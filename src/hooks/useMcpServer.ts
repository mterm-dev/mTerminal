import { useCallback, useEffect, useState } from "react";
import { invoke } from "../lib/tauri-shim";

export interface McpStatus {
  running: boolean;
  socketPath: string | null;
}

export function useMcpServer(enabled: boolean) {
  const [status, setStatus] = useState<McpStatus>({ running: false, socketPath: null });

  const refresh = useCallback(async () => {
    try {
      const s = await invoke<{ running: boolean; socketPath: string | null }>(
        "mcp_server_status",
      );
      setStatus(s);
    } catch {
      setStatus({ running: false, socketPath: null });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        if (enabled) {
          const s = await invoke<McpStatus>("mcp_server_start");
          if (!cancelled) setStatus(s);
        } else {
          const s = await invoke<McpStatus>("mcp_server_stop");
          if (!cancelled) setStatus(s);
        }
      } catch {
        if (!cancelled) refresh();
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh]);

  return { status, refresh };
}
