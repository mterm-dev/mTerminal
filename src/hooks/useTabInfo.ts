import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TabInfo {
  cwd: string | null;
  cmd: string | null;
  pid: number;
}

interface Options {
  ptyId: number | null;
  onChange?: (info: TabInfo) => void;
  intervalMs?: number;
}

export function useTabInfo({ ptyId, onChange, intervalMs = 1500 }: Options) {
  const [info, setInfo] = useState<TabInfo | null>(null);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (ptyId == null) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await invoke<TabInfo>("pty_info", { id: ptyId });
        if (cancelled) return;
        setInfo(next);
        cbRef.current?.(next);
      } catch {}
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ptyId, intervalMs]);

  return info;
}
