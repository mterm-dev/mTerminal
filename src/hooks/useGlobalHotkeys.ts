import { useEffect, type RefObject } from "react";
import type { Settings } from "../settings/useSettings";
import type { UiState } from "../settings/useUiState";
import { matchHotkey } from "../lib/hotkey";

interface Workspace {
  activeId: number | null;
  addTab: () => void;
  closeTab: (id: number) => void;
  addGroup: () => void;
  selectIndex: (idx: number) => void;
}

interface Voice {
  toggle: () => void;
}

interface Args {
  wsRef: RefObject<Workspace>;
  settingsRef: RefObject<Settings>;
  uiStateRef: RefObject<UiState>;
  updateUiRef: RefObject<<K extends keyof UiState>(k: K, v: UiState[K]) => void>;
  voiceRef: RefObject<Voice>;
  spawnClaudeTabRef: RefObject<() => void>;
  openPaletteRef: RefObject<() => void>;
  toggleAIPanelRef: RefObject<() => void>;
  setGridGroupId: (id: string | null) => void;
  setShowSettings: (b: boolean) => void;
  setShowMarketplace?: (b: boolean) => void;
}

export function useGlobalHotkeys({
  wsRef,
  settingsRef,
  uiStateRef,
  updateUiRef,
  voiceRef,
  spawnClaudeTabRef,
  openPaletteRef,
  toggleAIPanelRef,
  setGridGroupId,
  setShowSettings,
  setShowMarketplace,
}: Args) {
  useEffect(() => {
    const onVoiceKey = (e: KeyboardEvent) => {
      const s = settingsRef.current;
      if (!s || !s.voiceEnabled || !s.voiceHotkey) return;
      if (!matchHotkey(e, s.voiceHotkey)) return;
      e.preventDefault();
      e.stopPropagation();
      voiceRef.current?.toggle();
    };
    window.addEventListener("keydown", onVoiceKey, { capture: true });

    const isMac =
      (window as { mt?: { platform?: string } }).mt?.platform === "darwin";
    const modOnly = (e: KeyboardEvent) =>
      isMac
        ? e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
        : e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
    const modShift = (e: KeyboardEvent) =>
      isMac
        ? e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey
        : e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inXterm = !!target?.closest?.(".xterm");
      if (
        !inXterm &&
        (tag === "input" || tag === "textarea" || tag === "select")
      )
        return;

      const w = wsRef.current;
      if (!w) return;
      const consume = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (modOnly(e)) {
        if (e.key === "t" || e.key === "T") {
          consume();
          setGridGroupId(null);
          w.addTab();
          return;
        }
        if (e.key === "w" || e.key === "W") {
          if (w.activeId != null) {
            consume();
            w.closeTab(w.activeId);
          }
          return;
        }
        if (e.key === "b" || e.key === "B") {
          consume();
          updateUiRef.current?.(
            "sidebarCollapsed",
            !uiStateRef.current!.sidebarCollapsed,
          );
          return;
        }
        if (e.key >= "1" && e.key <= "9") {
          const idx = Number(e.key) - 1;
          consume();
          setGridGroupId(null);
          w.selectIndex(idx);
          return;
        }
      }
      if (modShift(e) && (e.key === "G" || e.key === "g")) {
        consume();
        w.addGroup();
        return;
      }
      if (modShift(e) && (e.key === "L" || e.key === "l")) {
        consume();
        spawnClaudeTabRef.current?.();
        return;
      }
      if (modShift(e) && (e.key === "P" || e.key === "p")) {
        consume();
        openPaletteRef.current?.();
        return;
      }
      if (modShift(e) && (e.key === "A" || e.key === "a")) {
        consume();
        toggleAIPanelRef.current?.();
        return;
      }
      if (modShift(e) && (e.key === "X" || e.key === "x")) {
        consume();
        setShowMarketplace?.(true);
        return;
      }
      if (modOnly(e) && e.key === ",") {
        consume();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keydown", onVoiceKey, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
