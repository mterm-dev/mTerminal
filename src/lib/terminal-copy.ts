type ClipboardChord = Pick<
  KeyboardEvent,
  "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "key"
>;

export function terminalClipboardChord(
  e: ClipboardChord,
): "copy" | "paste" | null {
  if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return null;
  const k = e.key.toLowerCase();
  if (k === "c") return "copy";
  if (k === "v") return "paste";
  return null;
}

export function shouldHandleTerminalClipboard(target: {
  tagName?: string;
  inEditable: boolean;
  inTerminal: boolean;
}): boolean {
  if (target.inTerminal) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return false;
  if (target.inEditable) return false;
  return true;
}
