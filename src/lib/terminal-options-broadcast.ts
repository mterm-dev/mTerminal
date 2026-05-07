import type { ITheme } from "@xterm/xterm";

export interface TerminalOptionsSnapshot {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  theme: ITheme;
}

const KEY = "__MT_TERMINAL_OPTIONS";
const EVENT = "mterminal:terminal-options-change";

interface Holder {
  [KEY]?: TerminalOptionsSnapshot;
}

export function publishTerminalOptions(snapshot: TerminalOptionsSnapshot): void {
  if (typeof window === "undefined") return;
  (window as unknown as Holder)[KEY] = snapshot;
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: snapshot }));
  } catch {}
}

export function getTerminalOptions(): TerminalOptionsSnapshot | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as Holder)[KEY] ?? null;
}

export function subscribeTerminalOptions(
  cb: (snapshot: TerminalOptionsSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<TerminalOptionsSnapshot>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
