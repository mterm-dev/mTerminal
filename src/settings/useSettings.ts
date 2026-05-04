import { useCallback, useEffect, useState } from "react";

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

function loadInitial(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, update, reset };
}
