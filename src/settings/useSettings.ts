import { useCallback, useEffect, useRef, useState } from "react";

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

export interface Settings {
  themeId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  shellOverride: string;
  shellArgs: string;
  uiFontSize: number;
  windowOpacity: number;
  confirmCloseMultipleTabs: boolean;
  copyOnSelect: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  showGreeting: boolean;
  aiEnabled: boolean;
  /** Empty string when no provider extension is installed/selected. */
  aiDefaultProvider: AiProviderId;
  /** Per-provider model + baseUrl, keyed by provider id. */
  aiProviderConfig: Record<string, AiProviderConfig>;
  aiAttachContext: boolean;
  aiPanelOpen: boolean;
  aiExplainEnabled: boolean;
  claudeCodeDetectionEnabled: boolean;
  mcpServerEnabled: boolean;
  gitPanelEnabled: boolean;
  gitPanelCollapsed: boolean;
  gitPanelTreeView: boolean;
  gitPanelHeight: number;
  gitCommitMsgHeight: number;
  /** Empty string when no provider chosen for commit messages. */
  gitCommitProvider: AiProviderId;
  /** Per-provider override for commit message generation. */
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
  themeId: "mterminal",
  fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: "bar",
  cursorBlink: true,
  scrollback: 5000,
  shellOverride: "",
  shellArgs: "",
  uiFontSize: 13,
  windowOpacity: 1,
  confirmCloseMultipleTabs: true,
  copyOnSelect: false,
  sidebarCollapsed: false,
  sidebarWidth: 300,
  showGreeting: true,
  aiEnabled: false,
  aiDefaultProvider: "",
  aiProviderConfig: {},
  aiAttachContext: true,
  aiPanelOpen: false,
  aiExplainEnabled: true,
  claudeCodeDetectionEnabled: true,
  mcpServerEnabled: false,
  gitPanelEnabled: false,
  gitPanelCollapsed: false,
  gitPanelTreeView: true,
  gitPanelHeight: 340,
  gitCommitMsgHeight: 72,
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
  if (api?.loadSync) {
    try {
      const v = api.loadSync();
      if (typeof v === "string" && v.length > 0) return v;
    } catch {}
  }
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) return raw;
    } catch {}
  }
  return null;
}

function persistRawSettings(json: string): void {
  const api = settingsMtApi();
  if (api?.save) {
    try {
      const r = api.save(json);
      if (r && typeof (r as Promise<void>).catch === "function") {
        (r as Promise<void>).catch(() => {});
      }
      return;
    } catch {}
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, json);
    } catch {}
  }
}

/**
 * One-shot migration from the legacy per-provider fields (aiAnthropicModel
 * etc.) to the dynamic `aiProviderConfig` map. Removes the legacy keys from
 * the parsed object so they don't keep getting persisted forward.
 */
function migrateLegacyAiFields(raw: Record<string, unknown>): void {
  const aiCfg: Record<string, AiProviderConfig> = {
    ...(typeof raw.aiProviderConfig === "object" && raw.aiProviderConfig
      ? (raw.aiProviderConfig as Record<string, AiProviderConfig>)
      : {}),
  };
  const ensure = (id: string): AiProviderConfig => (aiCfg[id] ??= {});

  if (typeof raw.aiAnthropicModel === "string" && raw.aiAnthropicModel) {
    ensure("anthropic").model ??= raw.aiAnthropicModel;
  }
  if (typeof raw.aiOpenaiModel === "string" && raw.aiOpenaiModel) {
    ensure("openai").model ??= raw.aiOpenaiModel;
  }
  if (typeof raw.aiOpenaiBaseUrl === "string" && raw.aiOpenaiBaseUrl) {
    ensure("openai").baseUrl ??= raw.aiOpenaiBaseUrl;
  }
  if (typeof raw.aiOllamaModel === "string" && raw.aiOllamaModel) {
    ensure("ollama").model ??= raw.aiOllamaModel;
  }
  if (typeof raw.aiOllamaBaseUrl === "string" && raw.aiOllamaBaseUrl) {
    ensure("ollama").baseUrl ??= raw.aiOllamaBaseUrl;
  }

  delete raw.aiAnthropicModel;
  delete raw.aiOpenaiModel;
  delete raw.aiOpenaiBaseUrl;
  delete raw.aiOllamaModel;
  delete raw.aiOllamaBaseUrl;
  raw.aiProviderConfig = aiCfg;

  const gitCfg: Record<string, AiProviderConfig> = {
    ...(typeof raw.gitCommitProviderConfig === "object" && raw.gitCommitProviderConfig
      ? (raw.gitCommitProviderConfig as Record<string, AiProviderConfig>)
      : {}),
  };
  const ensureGit = (id: string): AiProviderConfig => (gitCfg[id] ??= {});

  if (typeof raw.gitCommitAnthropicModel === "string" && raw.gitCommitAnthropicModel) {
    ensureGit("anthropic").model ??= raw.gitCommitAnthropicModel;
  }
  if (typeof raw.gitCommitOpenaiModel === "string" && raw.gitCommitOpenaiModel) {
    ensureGit("openai").model ??= raw.gitCommitOpenaiModel;
  }
  if (typeof raw.gitCommitOpenaiBaseUrl === "string" && raw.gitCommitOpenaiBaseUrl) {
    ensureGit("openai").baseUrl ??= raw.gitCommitOpenaiBaseUrl;
  }
  if (typeof raw.gitCommitOllamaModel === "string" && raw.gitCommitOllamaModel) {
    ensureGit("ollama").model ??= raw.gitCommitOllamaModel;
  }
  if (typeof raw.gitCommitOllamaBaseUrl === "string" && raw.gitCommitOllamaBaseUrl) {
    ensureGit("ollama").baseUrl ??= raw.gitCommitOllamaBaseUrl;
  }

  delete raw.gitCommitAnthropicModel;
  delete raw.gitCommitOpenaiModel;
  delete raw.gitCommitOpenaiBaseUrl;
  delete raw.gitCommitOllamaModel;
  delete raw.gitCommitOllamaBaseUrl;
  raw.gitCommitProviderConfig = gitCfg;
}

function loadInitial(): Settings {
  const raw = readRawSettings();
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    migrateLegacyAiFields(parsed);
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadInitial);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      persistRawSettings(JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    const flush = (): void => {
      try {
        persistRawSettings(JSON.stringify(settingsRef.current));
      } catch {}
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
