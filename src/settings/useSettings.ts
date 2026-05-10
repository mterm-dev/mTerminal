import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentSoundType } from "../lib/agentSound";
import { emitCoreChange, emitExtChange } from "./event-bus";
import { CURRENT_SCHEMA_VERSION, migrateSettings } from "./migration";
import { normalizeSettings } from "./normalize";

export type CursorStyle = "block" | "bar" | "underline";
/**
 * Provider id is dynamic — corresponds to whichever AI provider extension the
 * user has installed (e.g. "anthropic", "openai-codex", "ollama", or any
 * marketplace plugin that registers a provider). Empty string means "no
 * provider selected".
 */
export type AiProviderId = string;
export type VoiceEngineId = "whisper-cpp" | "openai";

export interface AiProviderConfig {
  model?: string;
  baseUrl?: string;
}

export type ShellProfileKind = "native" | "wsl";

export interface ShellProfile {
  id: string;
  name: string;
  kind: ShellProfileKind;
  shell: string;
  args: string;
  icon?: string;
  wslDistro?: string;
}

export interface Settings {
  settingsSchemaVersion: number;
  themeId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  shellOverride: string;
  shellArgs: string;
  shellProfiles: ShellProfile[];
  defaultShellProfileId: string | null;
  uiFontSize: number;
  windowOpacity: number;
  confirmCloseMultipleTabs: boolean;
  copyOnSelect: boolean;
  showGreeting: boolean;
  aiEnabled: boolean;
  aiDefaultProvider: AiProviderId;
  aiProviderConfig: Record<string, AiProviderConfig>;
  aiAttachContext: boolean;
  aiExplainEnabled: boolean;
  claudeCodeDetectionEnabled: boolean;
  mcpServerEnabled: boolean;
  agentSoundEnabled: boolean;
  agentSoundType: AgentSoundType;
  agentSoundVolume: number;
  gitPanelEnabled: boolean;
  gitCommitProvider: AiProviderId;
  gitCommitProviderConfig: Record<string, AiProviderConfig>;
  gitCommitSystemPrompt: string;
  gitPullStrategy: "ff-only" | "merge" | "rebase";
  voiceEnabled: boolean;
  voiceEngine: VoiceEngineId;
  voiceLanguage: string;
  voiceShowMicButton: boolean;
  voiceAutoSpace: boolean;
  voiceHotkey: string;
  voiceWhisperCppBinPath: string;
  voiceWhisperCppModelPath: string;
  voiceOpenaiModel: string;
  voiceOpenaiBaseUrl: string;
  vaultIdleLockMs: number;
  marketplaceEndpoint?: string;
  extensions?: Record<string, Record<string, unknown>>;
}

export const DEFAULT_COMMIT_PROMPT = `You are an expert engineer writing a git commit message.
Given the staged diff, produce a single concise commit message in conventional-commits style (feat:, fix:, refactor:, docs:, test:, chore:).
Rules:
- Subject line: imperative, lowercase after the type, <=72 chars, no trailing period.
- Optionally one blank line + a short body (wrap at ~80 chars) explaining WHY, not WHAT.
- Never include code fences, quotes, or commentary. Output ONLY the commit message text.`;

export const DEFAULT_SETTINGS: Settings = {
  settingsSchemaVersion: CURRENT_SCHEMA_VERSION,
  themeId: "mterminal",
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: "bar",
  cursorBlink: true,
  scrollback: 5000,
  shellOverride: "",
  shellArgs: "",
  shellProfiles: [],
  defaultShellProfileId: null,
  uiFontSize: 13,
  windowOpacity: 1,
  confirmCloseMultipleTabs: true,
  copyOnSelect: false,
  showGreeting: true,
  aiEnabled: false,
  aiDefaultProvider: "",
  aiProviderConfig: {},
  aiAttachContext: true,
  aiExplainEnabled: true,
  claudeCodeDetectionEnabled: true,
  mcpServerEnabled: false,
  agentSoundEnabled: false,
  agentSoundType: "chime",
  agentSoundVolume: 0.7,
  gitPanelEnabled: false,
  gitCommitProvider: "",
  gitCommitProviderConfig: {},
  gitCommitSystemPrompt: DEFAULT_COMMIT_PROMPT,
  gitPullStrategy: "ff-only",
  voiceEnabled: false,
  voiceEngine: "whisper-cpp",
  voiceLanguage: "auto",
  voiceShowMicButton: true,
  voiceAutoSpace: true,
  voiceHotkey: "Ctrl+Shift+M",
  voiceWhisperCppBinPath: "",
  voiceWhisperCppModelPath: "",
  voiceOpenaiModel: "whisper-1",
  voiceOpenaiBaseUrl: "https://api.openai.com/v1",
  vaultIdleLockMs: 15 * 60 * 1000,
};

const KEY = "mterminal:settings:v1";
const UI_STATE_KEY = "mterminal:ui-state:v1";

interface SettingsMtApi {
  loadSync?: () => string | null;
  save?: (json: string) => Promise<void> | void;
}

function settingsMtApi(): SettingsMtApi | null {
  if (typeof window === "undefined") return null;
  const mt = (window as unknown as { mt?: { settings?: SettingsMtApi } }).mt;
  return mt?.settings ?? null;
}

function readRawSettings(): string | null {
  const api = settingsMtApi();
  if (!api?.loadSync) {
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem(KEY);
      } catch (e) {
        console.warn("[settings] localStorage unavailable:", e);
        return null;
      }
    }
    return null;
  }
  try {
    const v = api.loadSync();
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch (e) {
    console.warn("[settings] load failed:", e);
    return null;
  }
}

function persistRawSettings(json: string): void {
  const api = settingsMtApi();
  if (!api?.save) {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KEY, json);
      } catch (e) {
        console.warn("[settings] localStorage write failed:", e);
      }
    }
    return;
  }
  try {
    const r = api.save(json);
    if (r && typeof (r as Promise<void>).catch === "function") {
      (r as Promise<void>).catch((e) => console.warn("[settings] save rejected:", e));
    }
  } catch (e) {
    console.warn("[settings] save failed:", e);
  }
}

function maybePersistMigratedUiState(uiState: Record<string, unknown> | null): void {
  if (!uiState || typeof window === "undefined") return;
  try {
    const existing = window.localStorage.getItem(UI_STATE_KEY);
    const parsed = existing ? JSON.parse(existing) : {};
    window.localStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...parsed, ...uiState }));
  } catch (e) {
    console.warn("[settings] failed to persist migrated ui-state:", e);
  }
}

function loadInitial(): Settings {
  const raw = readRawSettings();
  if (!raw) return DEFAULT_SETTINGS;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (e) {
    console.warn("[settings] parse failed, using defaults:", e);
    return DEFAULT_SETTINGS;
  }
  const { settings: migrated, uiState } = migrateSettings(parsed);
  maybePersistMigratedUiState(uiState);
  return normalizeSettings(migrated);
}

function diffAndEmit(prev: Settings, next: Settings): void {
  for (const k of Object.keys(next) as (keyof Settings)[]) {
    if (k === "extensions") continue;
    if (prev[k] !== next[k]) {
      emitCoreChange(k as string, next[k]);
    }
  }

  const prevExt = prev.extensions ?? {};
  const nextExt = next.extensions ?? {};
  const extIds = new Set([...Object.keys(prevExt), ...Object.keys(nextExt)]);
  for (const extId of extIds) {
    const prevSub = prevExt[extId] ?? {};
    const nextSub = nextExt[extId] ?? {};
    const keys = new Set([...Object.keys(prevSub), ...Object.keys(nextSub)]);
    for (const k of keys) {
      if (prevSub[k] !== nextSub[k]) {
        emitExtChange(extId, k, nextSub[k]);
      }
    }
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadInitial);
  const settingsRef = useRef(settings);
  const prevRef = useRef(settings);

  useEffect(() => {
    diffAndEmit(prevRef.current, settings);
    prevRef.current = settings;
    settingsRef.current = settings;
    try {
      persistRawSettings(JSON.stringify(settings));
    } catch (e) {
      console.warn("[settings] serialize failed:", e);
    }
  }, [settings]);

  useEffect(() => {
    const flush = (): void => {
      try {
        persistRawSettings(JSON.stringify(settingsRef.current));
      } catch (e) {
        console.warn("[settings] flush failed:", e);
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
    };
  }, []);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}
