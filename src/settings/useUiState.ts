import { useCallback, useEffect, useState } from "react";

export interface UiState {
  aiPanelOpen: boolean;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  gitCommitMsgHeight: number;
}

export const DEFAULT_UI_STATE: UiState = {
  aiPanelOpen: false,
  sidebarCollapsed: false,
  sidebarWidth: 300,
  gitCommitMsgHeight: 72,
};

const KEY = "mterminal:ui-state:v1";

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalize(raw: unknown): UiState {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    aiPanelOpen: typeof r.aiPanelOpen === "boolean" ? r.aiPanelOpen : DEFAULT_UI_STATE.aiPanelOpen,
    sidebarCollapsed:
      typeof r.sidebarCollapsed === "boolean" ? r.sidebarCollapsed : DEFAULT_UI_STATE.sidebarCollapsed,
    sidebarWidth: clamp(r.sidebarWidth, 200, 600, DEFAULT_UI_STATE.sidebarWidth),
    gitCommitMsgHeight: clamp(r.gitCommitMsgHeight, 40, 400, DEFAULT_UI_STATE.gitCommitMsgHeight),
  };
}

function loadInitial(): UiState {
  if (typeof window === "undefined") return DEFAULT_UI_STATE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_UI_STATE;
    return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn("[ui-state] failed to load:", e);
    return DEFAULT_UI_STATE;
  }
}

export function useUiState() {
  const [state, setState] = useState<UiState>(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("[ui-state] failed to persist:", e);
    }
  }, [state]);

  const update = useCallback(<K extends keyof UiState>(key: K, value: UiState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  return { uiState: state, updateUi: update };
}
