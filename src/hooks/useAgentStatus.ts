import { useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "../lib/ipc";

export type AgentState = "idle" | "thinking" | "awaitingInput" | "done";

export interface AgentStatus {
  state: AgentState;
  agent: "claude" | "codex" | null;
  lastChangeMs: number;
  detail?: { tool?: string; message?: string };
}

interface AgentEv {
  tabId: number;
  state: AgentState;
  agent: "claude" | "codex" | null;
  lastChangeMs: number;
  detail?: { tool?: string; message?: string };
}

interface AgentApi {
  snapshot(): Promise<Array<[number, AgentStatus]>>;
  onStatus(cb: (ev: AgentEv) => void): () => void;
}

function api(): AgentApi | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { mt?: { agent?: AgentApi } };
  return w.mt?.agent ?? null;
}

interface Options {
  enabled: boolean;
  notifyOnAwaitingInput?: boolean;
  notifyOnDone?: boolean;
}

/**
 * Subscribes to push events from the agent bridge (Claude Code hooks +
 * Codex MCP server). Replaces the old `useClaudeCodeStatus` polling.
 */
export function useAgentStatus(activeTabId: number | null, opts: Options) {
  const [statuses, setStatuses] = useState<Map<number, AgentStatus>>(new Map());
  const lastNotifiedRef = useRef<Map<number, { state: AgentState; ts: number }>>(
    new Map(),
  );
  const permissionRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!opts.enabled) return;
    if (permissionRef.current !== null) return;
    isPermissionGranted()
      .then(async (granted) => {
        if (!granted) {
          const p = await requestPermission();
          permissionRef.current = p === "granted";
        } else {
          permissionRef.current = true;
        }
      })
      .catch(() => {
        permissionRef.current = false;
      });
  }, [opts.enabled]);

  useEffect(() => {
    if (!opts.enabled) {
      setStatuses(new Map());
      return;
    }
    const a = api();
    if (!a) return;

    let cancelled = false;
    void a.snapshot().then((rows) => {
      if (cancelled) return;
      setStatuses(new Map(rows));
    });

    const off = a.onStatus((ev) => {
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(ev.tabId, {
          state: ev.state,
          agent: ev.agent,
          lastChangeMs: ev.lastChangeMs,
          detail: ev.detail,
        });
        return next;
      });

      if (!permissionRef.current) return;
      if (ev.tabId === activeTabId) return;

      if (ev.state === "awaitingInput" && opts.notifyOnAwaitingInput) {
        const last = lastNotifiedRef.current.get(ev.tabId);
        if (!last || last.state !== "awaitingInput" || Date.now() - last.ts > 30_000) {
          lastNotifiedRef.current.set(ev.tabId, { state: ev.state, ts: Date.now() });
          sendNotification({
            title: `${ev.agent ?? "agent"} waiting`,
            body: ev.detail?.message ?? `tab ${ev.tabId} needs your input`,
          });
        }
      } else if (ev.state === "done" && opts.notifyOnDone) {
        const last = lastNotifiedRef.current.get(ev.tabId);
        if (!last || last.state !== "done") {
          lastNotifiedRef.current.set(ev.tabId, { state: ev.state, ts: Date.now() });
          sendNotification({
            title: `${ev.agent ?? "agent"} finished`,
            body: ev.detail?.message ?? `tab ${ev.tabId}`,
          });
        }
      }
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [activeTabId, opts.enabled, opts.notifyOnAwaitingInput, opts.notifyOnDone]);

  return statuses;
}
