export const DEFAULT_ACCENTS: readonly string[] = [
  "#d7693a",
  "#c9a14a",
  "#8a9a5b",
  "#6fa39b",
  "#6f93a8",
  "#b07b9e",
  "#c2705a",
  "#9a8f7d",
  "#7f9e7a",
  "#c98f6b",
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
