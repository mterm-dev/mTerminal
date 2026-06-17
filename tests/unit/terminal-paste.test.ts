import { describe, it, expect } from "vitest";
import { resolveTerminalPaste } from "../../src/lib/terminal-paste";

describe("resolveTerminalPaste", () => {
  it("prefers clipboard text over a (possibly stale) image", () => {
    expect(resolveTerminalPaste("hello", "/tmp/clip.png")).toEqual({
      kind: "text",
      data: "hello",
    });
  });

  it("pastes text even when no image is present", () => {
    expect(resolveTerminalPaste("ls -la", null)).toEqual({
      kind: "text",
      data: "ls -la",
    });
  });

  it("falls back to the image path (with trailing space) when there is no text", () => {
    expect(resolveTerminalPaste("", "/tmp/mterminal-clipboard/clip.png")).toEqual({
      kind: "image",
      data: "/tmp/mterminal-clipboard/clip.png ",
    });
    expect(resolveTerminalPaste(null, "/tmp/clip.png")).toEqual({
      kind: "image",
      data: "/tmp/clip.png ",
    });
  });

  it("sends a literal Ctrl-V when the clipboard is empty", () => {
    expect(resolveTerminalPaste("", null)).toEqual({ kind: "literal", data: "\x16" });
    expect(resolveTerminalPaste(null, null)).toEqual({ kind: "literal", data: "\x16" });
  });
});
