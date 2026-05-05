import { useCallback, useEffect, useRef, useState } from "react";

export type CursorStyle = "block" | "bar" | "underline";
export type AiProviderId = "anthropic" | "openai" | "ollama";

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
  remoteWorkspaceEnabled: boolean;
  showGreeting: boolean;
  aiEnabled: boolean;
  aiDefaultProvider: AiProviderId;
  aiAnthropicModel: string;
  aiOpenaiModel: string;
  aiOpenaiBaseUrl: string;
  aiOllamaModel: string;
  aiOllamaBaseUrl: string;
  aiAttachContext: boolean;
  aiPanelOpen: boolean;
  aiExplainEnabled: boolean;
  claudeCodeDetectionEnabled: boolean;
  mcpServerEnabled: boolean;
}

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
  remoteWorkspaceEnabled: false,
  showGreeting: true,
  aiEnabled: false,
  aiDefaultProvider: "anthropic",
  aiAnthropicModel: "claude-opus-4-7",
  aiOpenaiModel: "gpt-5",
  aiOpenaiBaseUrl: "https://api.openai.com/v1",
  aiOllamaModel: "llama3.2",
  aiOllamaBaseUrl: "http://localhost:11434/v1",
  aiAttachContext: true,
  aiPanelOpen: false,
  aiExplainEnabled: true,
  claudeCodeDetectionEnabled: true,
  mcpServerEnabled: false,
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

function loadInitial(): Settings {
  const raw = readRawSettings();
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
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
