import { useCallback, useEffect, useState } from "react";

export type CursorStyle = "block" | "bar" | "underline";

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
