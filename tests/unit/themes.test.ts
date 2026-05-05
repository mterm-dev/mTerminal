
import { describe, it, expect } from "vitest";
import { THEMES, findTheme, type Theme } from "../../src/settings/themes";

const REQUIRED_XTERM_KEYS: Array<keyof Theme["xterm"]> = [
  "background",
  "foreground",
  "cursor",
  "cursorAccent",
  "selectionBackground",
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

const REQUIRED_CSS_VARS = [
  "--bg-base",
  "--bg-muted",
  "--bg-raised",
  "--fg",
  "--fg-muted",
  "--fg-dim",
  "--border",
  "--border-subtle",
  "--accent",
];

function isValidColor(s: string): boolean {
  
  return (
    /^#[0-9a-fA-F]{3,8}$/.test(s) ||
    /^rgb/i.test(s) ||
    /^rgba/i.test(s) ||
    /^hsl/i.test(s) ||
    /^hsla/i.test(s) ||
    /^oklch/i.test(s) ||
    /^oklab/i.test(s)
  );
}

describe("themes - THEMES array", () => {
  it("is non-empty", () => {
    expect(Array.isArray(THEMES)).toBe(true);
    expect(THEMES.length).toBeGreaterThan(0);
  });

  it("every theme has id, name, cssVars, and full xterm shape", () => {
    for (const t of THEMES) {
      expect(typeof t.id).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.cssVars).toBeTruthy();
      expect(typeof t.cssVars).toBe("object");
      for (const key of REQUIRED_CSS_VARS) {
        expect(t.cssVars[key], `${t.id} missing cssVar ${key}`).toBeTruthy();
      }
      for (const key of REQUIRED_XTERM_KEYS) {
        expect(t.xterm[key], `${t.id} missing xterm.${String(key)}`).toBeTruthy();
        expect(typeof t.xterm[key]).toBe("string");
      }
    }
  });

  it("theme ids are unique", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("xterm color fields parse as recognizable CSS color strings", () => {
    for (const t of THEMES) {
      for (const key of REQUIRED_XTERM_KEYS) {
        const v = t.xterm[key];
        expect(
          isValidColor(v),
          `${t.id}.xterm.${String(key)} not a recognized color: ${v}`,
        ).toBe(true);
      }
    }
  });
});

describe("themes - findTheme", () => {
  it("returns the theme with that id when present", () => {
    for (const t of THEMES) {
      expect(findTheme(t.id)).toBe(t);
    }
  });

  it("returns the default (THEMES[0], 'mterminal') for unknown ids", () => {
    const fallback = findTheme("does-not-exist-xyz");
    expect(fallback).toBe(THEMES[0]);
    expect(fallback.id).toBe("mterminal");
  });

  it("returns the default for empty string id", () => {
    expect(findTheme("")).toBe(THEMES[0]);
  });
});
