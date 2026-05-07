/**
 * Self-contained AI streaming client for the git-panel extension.
 *
 * Independent of the host's `window.mt.ai` and core key vault — the plugin
 * stores its own API keys in its own settings namespace and POSTs directly
 * to provider endpoints from the renderer using `fetch` + ReadableStream.
 *
 * Anthropic requires `anthropic-dangerous-direct-browser-access: true` to
 * accept browser-origin requests; the user explicitly opted into a plugin
 * that handles its own keys, so we set it.
 */

export type ProviderId = "anthropic" | "openai" | "ollama";

export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiUsage {
  inTokens: number;
  outTokens: number;
}

export interface StreamRequest {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  system?: string;
  messages: AiMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onDone?: (usage: AiUsage) => void;
  onError?: (err: string) => void;
}

export interface StreamHandle {
  cancel: () => void;
}

export function streamComplete(req: StreamRequest): StreamHandle {
  const controller = new AbortController();
  if (req.signal) {
    if (req.signal.aborted) controller.abort();
    else req.signal.addEventListener("abort", () => controller.abort());
  }

  void run(req, controller).catch((err: unknown) => {
    if (controller.signal.aborted) return;
    req.onError?.(err instanceof Error ? err.message : String(err));
  });

  return { cancel: () => controller.abort() };
}

/**
 * Core-side streamer — delegates to `window.mt.ai`, which holds keys behind
 * the host vault. Exposes the same callbacks shape so callers can swap
 * between this and `streamComplete` based on the binding's source.
 */
interface MtAi {
  streamComplete: (args: {
    provider: string;
    model: string;
    messages: AiMessage[];
    system?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    baseUrl?: string;
  }) => Promise<number>;
  onEvent: (
    taskId: number,
    cb: (
      ev:
        | { kind: "delta"; value: string }
        | { kind: "done"; value: AiUsage }
        | { kind: "error"; value: string },
    ) => void,
  ) => () => void;
  cancel: (taskId: number) => Promise<void>;
}

export function streamCompleteCore(req: Omit<StreamRequest, "apiKey">): StreamHandle {
  const mt = (window as unknown as { mt?: { ai?: MtAi } }).mt;
  if (!mt?.ai) {
    req.onError?.("window.mt.ai is not available — core AI is disabled in this build");
    return { cancel: () => undefined };
  }
  let cancelled = false;
  let taskId: number | null = null;
  let off: (() => void) | null = null;
  void (async () => {
    try {
      taskId = await mt.ai!.streamComplete({
        provider: req.provider,
        model: req.model,
        messages: req.messages,
        system: req.system,
        maxTokens: req.maxTokens,
        temperature: req.temperature,
        topP: req.topP,
        baseUrl: req.baseUrl,
      });
      if (cancelled) {
        await mt.ai!.cancel(taskId);
        return;
      }
      off = mt.ai!.onEvent(taskId, (ev) => {
        if (ev.kind === "delta") req.onDelta?.(ev.value);
        else if (ev.kind === "done") req.onDone?.(ev.value);
        else if (ev.kind === "error") req.onError?.(ev.value);
      });
    } catch (err) {
      req.onError?.(err instanceof Error ? err.message : String(err));
    }
  })();
  return {
    cancel: () => {
      cancelled = true;
      if (taskId !== null) void mt.ai!.cancel(taskId);
      off?.();
    },
  };
}

async function run(req: StreamRequest, controller: AbortController): Promise<void> {
  if (req.provider === "anthropic") return runAnthropic(req, controller);
  if (req.provider === "openai") return runOpenAi(req, controller);
  if (req.provider === "ollama") return runOllama(req, controller);
  throw new Error(`unknown provider: ${String(req.provider)}`);
}

function requireKey(provider: string, key?: string): string {
  if (!key || !key.trim()) {
    throw new Error(`${provider} api key not set — open settings → extensions → git panel`);
  }
  return key.trim();
}

async function runAnthropic(
  req: StreamRequest,
  controller: AbortController,
): Promise<void> {
  const key = requireKey("anthropic", req.apiKey);
  const url = (req.baseUrl?.replace(/\/+$/, "") || "https://api.anthropic.com/v1") + "/messages";
  const body = {
    model: req.model,
    max_tokens: req.maxTokens ?? 1024,
    temperature: req.temperature,
    top_p: req.topP,
    system: req.system,
    stream: true,
    messages: req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
  };
  const res = await fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(await readError(res, "anthropic"));
  }
  const usage: AiUsage = { inTokens: 0, outTokens: 0 };
  await readSse(res.body, controller.signal, (event, data) => {
    if (!data) return;
    if (event === "content_block_delta") {
      try {
        const json = JSON.parse(data) as { delta?: { text?: string } };
        const text = json.delta?.text;
        if (text) req.onDelta?.(text);
      } catch {
        /* ignore malformed event */
      }
    } else if (event === "message_delta") {
      try {
        const json = JSON.parse(data) as { usage?: { output_tokens?: number } };
        if (json.usage?.output_tokens) usage.outTokens = json.usage.output_tokens;
      } catch {
        /* ignore */
      }
    } else if (event === "message_start") {
      try {
        const json = JSON.parse(data) as {
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
        };
        if (json.message?.usage?.input_tokens)
          usage.inTokens = json.message.usage.input_tokens;
      } catch {
        /* ignore */
      }
    }
  });
  req.onDone?.(usage);
}

async function runOpenAi(
  req: StreamRequest,
  controller: AbortController,
): Promise<void> {
  const key = requireKey("openai", req.apiKey);
  const base = (req.baseUrl?.replace(/\/+$/, "") || "https://api.openai.com/v1");
  const url = base + "/chat/completions";
  const messages: AiMessage[] = req.system
    ? [{ role: "system", content: req.system }, ...req.messages]
    : [...req.messages];
  const body = {
    model: req.model,
    stream: true,
    messages,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
    top_p: req.topP,
    stream_options: { include_usage: true },
  };
  const res = await fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(await readError(res, "openai"));
  }
  const usage: AiUsage = { inTokens: 0, outTokens: 0 };
  await readSse(res.body, controller.signal, (_event, data) => {
    if (!data || data === "[DONE]") return;
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.delta?.content;
      if (text) req.onDelta?.(text);
      if (json.usage) {
        if (typeof json.usage.prompt_tokens === "number")
          usage.inTokens = json.usage.prompt_tokens;
        if (typeof json.usage.completion_tokens === "number")
          usage.outTokens = json.usage.completion_tokens;
      }
    } catch {
      /* ignore malformed event */
    }
  });
  req.onDone?.(usage);
}

async function runOllama(
  req: StreamRequest,
  controller: AbortController,
): Promise<void> {
  const base = (req.baseUrl?.replace(/\/+$/, "") || "http://localhost:11434");
  const url = base + "/api/chat";
  const messages: AiMessage[] = req.system
    ? [{ role: "system", content: req.system }, ...req.messages]
    : [...req.messages];
  const body = {
    model: req.model,
    stream: true,
    messages,
    options: {
      temperature: req.temperature,
      top_p: req.topP,
      num_predict: req.maxTokens,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    signal: controller.signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(await readError(res, "ollama"));
  }
  const usage: AiUsage = { inTokens: 0, outTokens: 0 };
  await readNdjson(res.body, controller.signal, (line) => {
    try {
      const json = JSON.parse(line) as {
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
        done?: boolean;
      };
      const text = json.message?.content;
      if (text) req.onDelta?.(text);
      if (json.done) {
        if (typeof json.prompt_eval_count === "number")
          usage.inTokens = json.prompt_eval_count;
        if (typeof json.eval_count === "number") usage.outTokens = json.eval_count;
      }
    } catch {
      /* ignore malformed line */
    }
  });
  req.onDone?.(usage);
}

async function readSse(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: string, data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "message";
  let data = "";
  while (true) {
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const raw = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (raw === "") {
        if (data) onEvent(event, data);
        event = "message";
        data = "";
        continue;
      }
      if (raw.startsWith(":")) continue;
      if (raw.startsWith("event:")) {
        event = raw.slice(6).trim();
      } else if (raw.startsWith("data:")) {
        const piece = raw.slice(5).replace(/^ /, "");
        data = data ? data + "\n" + piece : piece;
      }
    }
  }
  if (data) onEvent(event, data);
}

async function readNdjson(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (signal.aborted) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return;
    }
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  }
  const tail = buf.trim();
  if (tail) onLine(tail);
}

async function readError(res: Response, provider: string): Promise<string> {
  let detail = `${res.status} ${res.statusText}`;
  try {
    const text = await res.text();
    if (text) detail += `: ${text.slice(0, 400)}`;
  } catch {
    /* ignore */
  }
  return `${provider} request failed — ${detail}`;
}
