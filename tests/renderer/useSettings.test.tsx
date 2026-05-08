// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings, DEFAULT_SETTINGS } from "../../src/settings/useSettings";

const KEY = "mterminal:settings:v1";

function installLocalStoragePolyfill(): void {
  const store: Record<string, string> = {};
  const polyfill = {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      for (const k of Object.keys(store)) delete store[k];
    },
    key(i: number): string | null {
      return Object.keys(store)[i] ?? null;
    },
    get length(): number {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: polyfill,
  });
}

beforeEach(() => {
  installLocalStoragePolyfill();
});

afterEach(() => {
  try {
    window.localStorage.clear();
  } catch {}
});

describe("useSettings - initial load", () => {
  it("returns DEFAULT_SETTINGS when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges localStorage payload over defaults", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ settingsSchemaVersion: 2, themeId: "dracula", fontSize: 16 }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.themeId).toBe("dracula");
    expect(result.current.settings.fontSize).toBe(16);

    expect(result.current.settings.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(result.current.settings.cursorStyle).toBe(DEFAULT_SETTINGS.cursorStyle);
  });

  it("falls back to DEFAULT_SETTINGS when localStorage payload is corrupted JSON", () => {
    window.localStorage.setItem(KEY, "not-json{{{");
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("partial localStorage object is merged with defaults (missing keys filled in)", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ settingsSchemaVersion: 2, aiEnabled: true }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.aiEnabled).toBe(true);

    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      if (k === "aiEnabled") continue;
      expect(result.current.settings[k]).toEqual(DEFAULT_SETTINGS[k]);
    }
  });
});

describe("useSettings - update", () => {
  it("update(key, value) updates the field and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.update("themeId", "x");
    });
    expect(result.current.settings.themeId).toBe("x");
    const raw = window.localStorage.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.themeId).toBe("x");
    
    expect(parsed.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
  });

  it("multiple updates each persist", () => {
    const { result } = renderHook(() => useSettings());
    act(() => {
      result.current.update("fontSize", 20);
    });
    act(() => {
      result.current.update("cursorBlink", false);
    });
    expect(result.current.settings.fontSize).toBe(20);
    expect(result.current.settings.cursorBlink).toBe(false);
    const parsed = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(parsed.fontSize).toBe(20);
    expect(parsed.cursorBlink).toBe(false);
  });
});

describe("useSettings - reset", () => {
  it("reverts to DEFAULT_SETTINGS and persists", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ settingsSchemaVersion: 2, themeId: "custom", fontSize: 16 }),
    );
    const { result } = renderHook(() => useSettings());
    expect(result.current.settings.themeId).toBe("custom");
    act(() => {
      result.current.reset();
    });
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
    const parsed = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });
});
