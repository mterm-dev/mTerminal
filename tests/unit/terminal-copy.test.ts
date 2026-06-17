import { describe, it, expect } from "vitest";
import {
  terminalClipboardChord,
  shouldHandleTerminalClipboard,
} from "../../src/lib/terminal-copy";

const chord = (over: Partial<KeyboardEvent>): KeyboardEvent =>
  ({
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: "",
    ...over,
  }) as KeyboardEvent;

describe("terminalClipboardChord", () => {
  it("maps Ctrl+Shift+C to copy regardless of case", () => {
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "C" }))).toBe("copy");
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "c" }))).toBe("copy");
  });

  it("maps Ctrl+Shift+V to paste regardless of case", () => {
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "V" }))).toBe("paste");
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "v" }))).toBe("paste");
  });

  it("requires both ctrl and shift", () => {
    expect(terminalClipboardChord(chord({ ctrlKey: true, key: "c" }))).toBe(null);
    expect(terminalClipboardChord(chord({ shiftKey: true, key: "v" }))).toBe(null);
  });

  it("rejects when alt or meta are held", () => {
    expect(
      terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, altKey: true, key: "c" })),
    ).toBe(null);
    expect(
      terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, metaKey: true, key: "v" })),
    ).toBe(null);
  });

  it("ignores other keys", () => {
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "x" }))).toBe(null);
    expect(terminalClipboardChord(chord({ ctrlKey: true, shiftKey: true, key: "a" }))).toBe(null);
  });
});

describe("shouldHandleTerminalClipboard", () => {
  it("handles when focus is inside the terminal pane", () => {
    expect(
      shouldHandleTerminalClipboard({ tagName: "TEXTAREA", inEditable: false, inTerminal: true }),
    ).toBe(true);
  });

  it("handles when focus drifted to a non-editable element (the regression case)", () => {
    expect(
      shouldHandleTerminalClipboard({ tagName: "BODY", inEditable: false, inTerminal: false }),
    ).toBe(true);
    expect(
      shouldHandleTerminalClipboard({ tagName: "DIV", inEditable: false, inTerminal: false }),
    ).toBe(true);
  });

  it("does not steal from an unrelated text field", () => {
    expect(
      shouldHandleTerminalClipboard({ tagName: "TEXTAREA", inEditable: false, inTerminal: false }),
    ).toBe(false);
    expect(
      shouldHandleTerminalClipboard({ tagName: "INPUT", inEditable: false, inTerminal: false }),
    ).toBe(false);
  });

  it("does not steal from a contenteditable region", () => {
    expect(
      shouldHandleTerminalClipboard({ tagName: "DIV", inEditable: true, inTerminal: false }),
    ).toBe(false);
  });
});
