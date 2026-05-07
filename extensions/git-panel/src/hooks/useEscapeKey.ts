import { useEffect } from "react";

export function useEscapeKey(
  onEscape: () => void,
  options: { enabled?: boolean; preventDefault?: boolean } = {},
) {
  const { enabled = true, preventDefault = false } = options;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preventDefault) e.preventDefault();
      onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, enabled, preventDefault]);
}
