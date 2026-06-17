export type PasteAction =
  | { kind: "text"; data: string }
  | { kind: "image"; data: string }
  | { kind: "literal"; data: string };

export function resolveTerminalPaste(
  text: string | null,
  image: string | null,
): PasteAction {
  if (text) return { kind: "text", data: text };
  if (image) return { kind: "image", data: image + " " };
  return { kind: "literal", data: "\x16" };
}
