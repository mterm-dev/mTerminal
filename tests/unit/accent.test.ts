import { describe, it, expect } from "vitest";
import {
  DEFAULT_ACCENTS,
  FALLBACK_ACCENT,
  isHexAccent,
  pickDefaultAccent,
  normalizeAccent,
} from "../../src/utils/accent";

describe("accent - DEFAULT_ACCENTS palette", () => {
  it("has 10 entries", () => {
    expect(DEFAULT_ACCENTS.length).toBe(10);
  });

  it("are all lowercase 6-digit hex colors", () => {
    for (const c of DEFAULT_ACCENTS) {
      expect(c, `${c} not a 6-digit lowercase hex`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("are unique", () => {
    expect(new Set(DEFAULT_ACCENTS).size).toBe(DEFAULT_ACCENTS.length);
  });

  it("uses the warm ember as the first/fallback accent", () => {
    expect(DEFAULT_ACCENTS[0]).toBe("#d7693a");
    expect(FALLBACK_ACCENT).toBe(DEFAULT_ACCENTS[0]);
  });
});

describe("accent - pickDefaultAccent", () => {
  it("returns the accent at the index", () => {
    expect(pickDefaultAccent(0)).toBe(DEFAULT_ACCENTS[0]);
    expect(pickDefaultAccent(3)).toBe(DEFAULT_ACCENTS[3]);
  });

  it("wraps past the end of the palette", () => {
    expect(pickDefaultAccent(10)).toBe(DEFAULT_ACCENTS[0]);
    expect(pickDefaultAccent(13)).toBe(DEFAULT_ACCENTS[3]);
  });

  it("falls back for negative or non-finite indices", () => {
    expect(pickDefaultAccent(-1)).toBe(FALLBACK_ACCENT);
    expect(pickDefaultAccent(Number.NaN)).toBe(FALLBACK_ACCENT);
    expect(pickDefaultAccent(Infinity)).toBe(FALLBACK_ACCENT);
  });

  it("floors fractional indices", () => {
    expect(pickDefaultAccent(2.9)).toBe(DEFAULT_ACCENTS[2]);
  });
});

describe("accent - isHexAccent", () => {
  it("accepts valid 6-digit hex", () => {
    expect(isHexAccent("#d7693a")).toBe(true);
    expect(isHexAccent("#FFFFFF")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isHexAccent("#fff")).toBe(false);
    expect(isHexAccent("d7693a")).toBe(false);
    expect(isHexAccent("rgb(1,2,3)")).toBe(false);
    expect(isHexAccent(null)).toBe(false);
    expect(isHexAccent(123)).toBe(false);
  });
});

describe("accent - normalizeAccent", () => {
  it("lowercases a valid hex", () => {
    expect(normalizeAccent("#D7693A")).toBe("#d7693a");
  });

  it("falls back to the indexed default for invalid input", () => {
    expect(normalizeAccent("nonsense", 1)).toBe(DEFAULT_ACCENTS[1]);
    expect(normalizeAccent(undefined)).toBe(FALLBACK_ACCENT);
  });
});
