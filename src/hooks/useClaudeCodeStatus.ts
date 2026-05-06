import { useEffect, useRef, useState } from "react";
import {
  invoke,
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "../lib/ipc";

export type CcState = "none" | "idle" | "thinking" | "awaitingInput";

export interface CcStatus {
  state: CcState;
  running: boolean;
  binary: string | null;
  lastActivityMs: number | null;
}

const POLL_MS = 2000;

interface Options {
  enabled: boolean;
  notifyOnAwaitingInput?: boolean;
}

export function useClaudeCodeStatus(
  ptySessionIds: Map<number, number>,
  activeTabId: number | null,
  opts: Options,
) {
  const [statuses, setStatuses] = useState<Map<number, CcStatus>>(new Map());
  const lastNotifiedRef = useRef<Map<number, number>>(new Map());
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
    let cancelled = false;
    const poll = async () => {
      const next = new Map<number, CcStatus>();
      for (const [tabId, ptyId] of ptySessionIds) {
        try {
          const s = await invoke<{
            state: CcState;
            running: boolean;
            binary: string | null;
            lastActivityMs: number | null;
          }>("claude_code_status", { tabId: ptyId });
          next.set(tabId, s);
          if (
            opts.notifyOnAwaitingInput &&
            s.state === "awaitingInput" &&
            tabId !== activeTabId &&
            permissionRef.current
          ) {
            const last = lastNotifiedRef.current.get(tabId) ?? 0;
            const now = Date.now();
            if (now - last > 30000) {
              lastNotifiedRef.current.set(tabId, now);
              sendNotification({
                title: "Claude Code waiting",
                body: `tab ${tabId} needs your input`,
              });
            }
          }
          if (s.state !== "awaitingInput") {
            lastNotifiedRef.current.delete(tabId);
          }
        } catch {}
      }
      if (!cancelled) setStatuses(next);
    };
    poll();
    const t = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [ptySessionIds, activeTabId, opts.enabled, opts.notifyOnAwaitingInput]);

  return statuses;
}
