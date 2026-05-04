import { useEffect, useState } from "react";
import { getCurrentWindow } from "../lib/tauri-shim";

export function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    win
      .isMaximized()
      .then((b) => {
        if (!cancelled) setMaximized(b);
      })
      .catch(() => {});

    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => {
        if (cancelled) u();
        else unlisten = u;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
  return maximized;
}
