export const DEFAULT_ACCENTS: readonly string[] = [
  "#f5a23d",
  "#6ea8e8",
  "#bb9af7",
  "#74cdc8",
  "#65d39a",
  "#c98ff0",
  "#5cd0d0",
  "#f5c176",
  "#d4b3f7",
  "#e8615a",
] as const;

export const FALLBACK_ACCENT = DEFAULT_ACCENTS[0];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexAccent(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

export function pickDefaultAccent(index: number): string {
  if (!Number.isFinite(index) || index < 0) return FALLBACK_ACCENT;
  return DEFAULT_ACCENTS[Math.floor(index) % DEFAULT_ACCENTS.length];
}

export function normalizeAccent(value: unknown, indexHint = 0): string {
  return isHexAccent(value) ? value.toLowerCase() : pickDefaultAccent(indexHint);
}
