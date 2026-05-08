import { useEffect, useRef, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "../lib/ipc";
import { playAgentSound, type AgentSoundType } from "../lib/agentSound";

export type AgentState = "idle" | "thinking" | "awaitingInput" | "done";

export interface AgentStatus {
  state: AgentState;
  agent: "claude" | "codex" | null;
  lastChangeMs: number;
  detail?: { tool?: string; message?: string };
}

interface AgentEv {
  /** PTY session id (= MTERMINAL_TAB_ID). The hook translates to workspace tab id. */
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
  soundEnabled?: boolean;
  soundType?: AgentSoundType;
  soundVolume?: number;
}

/**
 * Subscribes to push events from the agent bridge (Claude Code hooks +
 * Codex MCP server). The bridge keys events by PTY session id (which is
 * what `MTERMINAL_TAB_ID` carries); this hook translates those to
 * workspace tab ids so the Sidebar can match against `tab.id`.
 */
export function useAgentStatus(
  ptySessionIds: Map<number, number>,
  activeTabId: number | null,
  opts: Options,
) {
  const [statuses, setStatuses] = useState<Map<number, AgentStatus>>(new Map());
  const lastNotifiedRef = useRef<Map<number, { state: AgentState; ts: number }>>(
    new Map(),
  );
  const permissionRef = useRef<boolean | null>(null);
  const ptyToTabRef = useRef<Map<number, number>>(new Map());

  // Keep a ptyId → workspaceTabId reverse map fresh.
  useEffect(() => {
    const reverse = new Map<number, number>();
    for (const [tabId, ptyId] of ptySessionIds) reverse.set(ptyId, tabId);
    ptyToTabRef.current = reverse;
  }, [ptySessionIds]);

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

    const translate = (ptyId: number): number | null =>
      ptyToTabRef.current.get(ptyId) ?? null;

    let cancelled = false;
    void a.snapshot().then((rows) => {
      if (cancelled) return;
      const next = new Map<number, AgentStatus>();
      for (const [ptyId, status] of rows) {
        const tabId = translate(ptyId);
        if (tabId != null) next.set(tabId, status);
      }
      setStatuses(next);
    });

    const off = a.onStatus((ev) => {
      const tabId = translate(ev.tabId);
      if (tabId == null) return;

      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(tabId, {
          state: ev.state,
          agent: ev.agent,
          lastChangeMs: ev.lastChangeMs,
          detail: ev.detail,
        });
        return next;
      });

      if (ev.state === "done" && opts.soundEnabled) {
        playAgentSound(opts.soundType ?? "chime", opts.soundVolume ?? 0.7);
      }

      if (!permissionRef.current) return;
      if (tabId === activeTabId) return;

      if (ev.state === "awaitingInput" && opts.notifyOnAwaitingInput) {
        const last = lastNotifiedRef.current.get(tabId);
        if (!last || last.state !== "awaitingInput" || Date.now() - last.ts > 30_000) {
          lastNotifiedRef.current.set(tabId, { state: ev.state, ts: Date.now() });
          sendNotification({
            title: `${ev.agent ?? "agent"} waiting`,
            body: ev.detail?.message ?? `tab ${tabId} needs your input`,
          });
        }
      } else if (ev.state === "done" && opts.notifyOnDone) {
        const last = lastNotifiedRef.current.get(tabId);
        if (!last || last.state !== "done") {
          lastNotifiedRef.current.set(tabId, { state: ev.state, ts: Date.now() });
          sendNotification({
            title: `${ev.agent ?? "agent"} finished`,
            body: ev.detail?.message ?? `tab ${tabId}`,
          });
        }
      }
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [
    activeTabId,
    opts.enabled,
    opts.notifyOnAwaitingInput,
    opts.notifyOnDone,
    opts.soundEnabled,
    opts.soundType,
    opts.soundVolume,
  ]);

  return statuses;
}
