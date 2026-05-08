import { describe, expect, it } from "vitest";
import { normalizeSettings } from "../../src/settings/normalize";
import { DEFAULT_SETTINGS } from "../../src/settings/useSettings";

describe("normalizeSettings", () => {
  it("returns defaults for empty input", () => {
    const out = normalizeSettings({});
    expect(out).toMatchObject(DEFAULT_SETTINGS);
  });

  it("clamps fontSize to range", () => {
    expect(normalizeSettings({ fontSize: 999 }).fontSize).toBe(24);
    expect(normalizeSettings({ fontSize: 0 }).fontSize).toBe(9);
    expect(normalizeSettings({ fontSize: 14 }).fontSize).toBe(14);
  });

  it("clamps windowOpacity to [0.6, 1]", () => {
    expect(normalizeSettings({ windowOpacity: 2 }).windowOpacity).toBe(1);
    expect(normalizeSettings({ windowOpacity: 0.1 }).windowOpacity).toBe(0.6);
  });

  it("clamps scrollback to [0, 100000]", () => {
    expect(normalizeSettings({ scrollback: -50 }).scrollback).toBe(0);
    expect(normalizeSettings({ scrollback: 500000 }).scrollback).toBe(100000);
  });

  it("falls back to default for invalid enum values", () => {
    expect(normalizeSettings({ cursorStyle: "diamond" }).cursorStyle).toBe(
      DEFAULT_SETTINGS.cursorStyle,
    );
    expect(normalizeSettings({ voiceEngine: "garbage" }).voiceEngine).toBe(
      DEFAULT_SETTINGS.voiceEngine,
    );
  });

  it("preserves valid enum values", () => {
    expect(normalizeSettings({ cursorStyle: "block" }).cursorStyle).toBe("block");
    expect(normalizeSettings({ voiceEngine: "openai" }).voiceEngine).toBe("openai");
  });

  it("rejects non-boolean for boolean fields", () => {
    const out = normalizeSettings({ aiEnabled: "yes" });
    expect(out.aiEnabled).toBe(DEFAULT_SETTINGS.aiEnabled);
  });

  it("preserves marketplaceEndpoint when set", () => {
    const out = normalizeSettings({ marketplaceEndpoint: "https://example.com" });
    expect(out.marketplaceEndpoint).toBe("https://example.com");
  });

  it("normalizes extensions sub-objects", () => {
    const out = normalizeSettings({
      extensions: { "ext-a": { x: 1 }, "ext-b": "garbage" as unknown },
    });
    expect(out.extensions?.["ext-a"]).toEqual({ x: 1 });
    expect(out.extensions?.["ext-b"]).toEqual({});
  });
});
