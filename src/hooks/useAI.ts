import { useCallback, useEffect, useRef } from "react";
import { Channel, invoke } from "../lib/ipc";

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
  baseUrl?: string;
  onDelta?: (text: string) => void;
  onDone?: (usage: AiUsage) => void;
  onError?: (err: string) => void;
}

export interface CompleteHandle {
  taskId: number;
  cancel: () => Promise<void>;
}

type ActiveEntry = { handle: CompleteHandle; channel: Channel<AiEvent> };

export function useAI() {
  const activeRef = useRef<Map<number, ActiveEntry>>(new Map());

  const complete = useCallback(
    async (opts: CompleteOptions): Promise<CompleteHandle> => {
      const channel = new Channel<AiEvent>();
      channel.onmessage = (msg) => {
        if (msg.kind === "delta") opts.onDelta?.(msg.value);
        else if (msg.kind === "done") opts.onDone?.(msg.value);
        else if (msg.kind === "error") opts.onError?.(msg.value);
      };
      const taskId = await invoke<number>("ai_stream_complete", {
        events: channel,
        provider: opts.provider,
        model: opts.model,
        messages: opts.messages,
        system: opts.system ?? null,
        maxTokens: opts.maxTokens ?? null,
        temperature: opts.temperature ?? null,
        baseUrl: opts.baseUrl ?? null,
      });
      const handle: CompleteHandle = {
        taskId,
        cancel: async () => {
          await invoke("ai_cancel", { taskId });
          const entry = activeRef.current.get(taskId);
          entry?.channel.unsubscribe?.();
          activeRef.current.delete(taskId);
        },
      };
      activeRef.current.set(taskId, { handle, channel });
      return handle;
    },
    [],
  );

  const cancelAll = useCallback(async () => {
    const entries = Array.from(activeRef.current.entries());
    await Promise.all(
      entries.map(([id, { channel }]) =>
        invoke("ai_cancel", { taskId: id })
          .catch(() => {})
          .then(() => channel.unsubscribe?.()),
      ),
    );
    activeRef.current.clear();
  }, []);

  useEffect(() => () => { void cancelAll(); }, [cancelAll]);

  return { complete, cancelAll };
}

export interface ModelInfo {
  id: string;
  name: string;
}

export async function listModels(provider: string, baseUrl?: string): Promise<ModelInfo[]> {
  return await invoke<ModelInfo[]>("ai_list_models", {
    provider,
    baseUrl: baseUrl ?? null,
  });
}
