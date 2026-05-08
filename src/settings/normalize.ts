import { AGENT_SOUND_TYPES, type AgentSoundType } from "../lib/agentSound";
import type { CursorStyle, Settings, VoiceEngineId } from "./useSettings";
import { DEFAULT_SETTINGS } from "./useSettings";

const CURSOR_STYLES: readonly CursorStyle[] = ["block", "bar", "underline"] as const;
const VOICE_ENGINES: readonly VoiceEngineId[] = ["whisper-cpp", "openai"] as const;
const PULL_STRATEGIES = ["ff-only", "merge", "rebase"] as const;

interface Range {
  min: number;
  max: number;
  int?: boolean;
}

const NUMBER_RANGES: Partial<Record<keyof Settings, Range>> = {
  fontSize: { min: 9, max: 24, int: true },
  uiFontSize: { min: 11, max: 16, int: true },
  lineHeight: { min: 1, max: 2 },
  scrollback: { min: 0, max: 100000, int: true },
  windowOpacity: { min: 0.6, max: 1 },
  vaultIdleLockMs: { min: 0, max: 24 * 60 * 60 * 1000, int: true },
  agentSoundVolume: { min: 0, max: 1 },
};

function clampNumber(value: unknown, range: Range, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  let v = Math.max(range.min, Math.min(range.max, value));
  if (range.int) v = Math.round(v);
  return v;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pickRecord<T>(value: unknown): Record<string, T> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, T>;
  }
  return {};
}

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  const out: Settings = { ...DEFAULT_SETTINGS };
  const corrections: string[] = [];

  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const def = DEFAULT_SETTINGS[k];
    const value = r[k as string];

    if (typeof def === "number") {
      const range = NUMBER_RANGES[k];
      const next = range ? clampNumber(value, range, def as number) : (typeof value === "number" && Number.isFinite(value) ? value : def as number);
      if (next !== value && value !== undefined) corrections.push(String(k));
      (out as unknown as Record<string, unknown>)[k as string] = next;
    } else if (typeof def === "boolean") {
      (out as unknown as Record<string, unknown>)[k as string] = pickBoolean(value, def);
    } else if (typeof def === "string") {
      if (k === "cursorStyle") {
        (out as unknown as Record<string, unknown>)[k as string] = pickEnum(value, CURSOR_STYLES, def as CursorStyle);
      } else if (k === "voiceEngine") {
        (out as unknown as Record<string, unknown>)[k as string] = pickEnum(value, VOICE_ENGINES, def as VoiceEngineId);
      } else if (k === "gitPullStrategy") {
        (out as unknown as Record<string, unknown>)[k as string] = pickEnum(value, PULL_STRATEGIES, def as (typeof PULL_STRATEGIES)[number]);
      } else if (k === "agentSoundType") {
        (out as unknown as Record<string, unknown>)[k as string] = pickEnum(value, AGENT_SOUND_TYPES, def as AgentSoundType);
      } else {
        (out as unknown as Record<string, unknown>)[k as string] = pickString(value, def);
      }
    } else if (def && typeof def === "object") {
      (out as unknown as Record<string, unknown>)[k as string] = pickRecord(value);
    }
  }

  if (typeof r.marketplaceEndpoint === "string") {
    out.marketplaceEndpoint = r.marketplaceEndpoint;
  }
  if (r.extensions !== undefined) {
    const ext = pickRecord<Record<string, unknown>>(r.extensions);
    const cleaned: Record<string, Record<string, unknown>> = {};
    for (const [extId, sub] of Object.entries(ext)) {
      cleaned[extId] = pickRecord<unknown>(sub);
    }
    out.extensions = cleaned;
  }

  if (corrections.length > 0) {
    console.warn("[settings] corrected out-of-range values:", corrections.join(", "));
  }

  return out;
}
