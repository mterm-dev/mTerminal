import { useCallback, useEffect, useRef } from "react";
import { getAiProviderRegistry } from "../extensions/registries/providers-ai";

export interface AiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiUsage {
  inTokens: number;
  outTokens: number;
  costUsd: number;
}

export type AiEvent =
  | { kind: "delta"; value: string }
  | { kind: "done"; value: AiUsage }
  | { kind: "error"; value: string };

export interface CompleteOptions {
  provider: string;
  model: string;
  messages: AiMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  baseUrl?: string;
  onDelta?: (text: string) => void;
  onDone?: (usage: AiUsage) => void;
  onError?: (err: string) => void;
}

export interface CompleteHandle {
  taskId: number;
  cancel: () => Promise<void>;
}

export interface ModelInfo {
  id: string;
  name: string;
}

interface ProviderUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inTokens?: number;
  outTokens?: number;
  costUsd?: number;
}

function toAiUsage(u: unknown): AiUsage {
  const x = (u ?? {}) as ProviderUsage;
  return {
    inTokens: x.inTokens ?? x.promptTokens ?? 0,
    outTokens: x.outTokens ?? x.completionTokens ?? 0,
    costUsd: x.costUsd ?? 0,
  };
}

let nextTaskId = 1;

export function useAI() {
  const activeRef = useRef<Map<number, AbortController>>(new Map());

  const complete = useCallback(
    async (opts: CompleteOptions): Promise<CompleteHandle> => {
      const entry = getAiProviderRegistry().get(opts.provider);
      if (!entry) {
        const err = `No AI provider "${opts.provider}" is installed. Open Settings → AI to install one.`;
        opts.onError?.(err);
        throw new Error(err);
      }

      const controller = new AbortController();
      const taskId = nextTaskId++;
      activeRef.current.set(taskId, controller);

      const req = {
        provider: opts.provider,
        model: opts.model,
        messages: opts.messages,
        system: opts.system,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        topP: opts.topP,
        baseUrl: opts.baseUrl,
        signal: controller.signal,
      };

      void (async () => {
        try {
          if (entry.stream) {
            let usage: AiUsage = { inTokens: 0, outTokens: 0, costUsd: 0 };
            for await (const raw of entry.stream(req)) {
              if (controller.signal.aborted) return;
              const delta = raw as { text?: string; finished?: boolean; usage?: unknown };
              if (delta.text) opts.onDelta?.(delta.text);
              if (delta.usage) usage = toAiUsage(delta.usage);
              if (delta.finished) {
                opts.onDone?.(usage);
                return;
              }
            }
            opts.onDone?.(usage);
          } else {
            const result = await entry.complete(req);
            if (controller.signal.aborted) return;
            opts.onDelta?.(result.text);
            opts.onDone?.(toAiUsage(result.usage));
          }
        } catch (e) {
          if (controller.signal.aborted) return;
          opts.onError?.(e instanceof Error ? e.message : String(e));
        } finally {
          activeRef.current.delete(taskId);
        }
      })();

      return {
        taskId,
        cancel: async () => {
          controller.abort();
          activeRef.current.delete(taskId);
        },
      };
    },
    [],
  );

  const cancelAll = useCallback(async () => {
    for (const ctl of activeRef.current.values()) ctl.abort();
    activeRef.current.clear();
  }, []);

  useEffect(() => () => { void cancelAll(); }, [cancelAll]);

  return { complete, cancelAll };
}

/**
 * Resolve a list of available models for a registered provider. Uses the
 * provider's `listModels()` if implemented (dynamic SDK fetch), otherwise
 * returns the static `models` array from registration.
 */
export async function listModels(provider: string): Promise<ModelInfo[]> {
  const entry = getAiProviderRegistry().get(provider);
  if (!entry) return [];
  try {
    const list = entry.listModels
      ? await entry.listModels()
      : entry.models ?? [];
    return list.map((m) => ({ id: m.id, name: m.label ?? m.id }));
  } catch {
    return [];
  }
}
