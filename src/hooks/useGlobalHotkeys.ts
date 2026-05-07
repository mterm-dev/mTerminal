import { useEffect, type RefObject } from "react";
import type { Settings } from "../settings/useSettings";
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
  updateRef: RefObject<<K extends keyof Settings>(k: K, v: Settings[K]) => void>;
  voiceRef: RefObject<Voice>;
  spawnClaudeTabRef: RefObject<() => void>;
  openPaletteRef: RefObject<() => void>;
  toggleAIPanelRef: RefObject<() => void>;
  setGridGroupId: (id: string | null) => void;
  setShowSettings: (b: boolean) => void;
}

export function useGlobalHotkeys({
  wsRef,
  settingsRef,
  updateRef,
  voiceRef,
  spawnClaudeTabRef,
  openPaletteRef,
  toggleAIPanelRef,
  setGridGroupId,
  setShowSettings,
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
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const w = wsRef.current;
      if (!w) return;
      if (modOnly(e)) {
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          setGridGroupId(null);
          w.addTab();
          return;
        }
        if (e.key === "w" || e.key === "W") {
          if (w.activeId != null) {
            e.preventDefault();
            w.closeTab(w.activeId);
          }
          return;
        }
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          updateRef.current?.(
            "sidebarCollapsed",
            !settingsRef.current!.sidebarCollapsed,
          );
          return;
        }
        if (e.key >= "1" && e.key <= "9") {
          const idx = Number(e.key) - 1;
          e.preventDefault();
          setGridGroupId(null);
          w.selectIndex(idx);
          return;
        }
      }
      if (modShift(e) && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        w.addGroup();
      }
      if (modShift(e) && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        spawnClaudeTabRef.current?.();
      }
      if (modShift(e) && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        openPaletteRef.current?.();
      }
      if (modShift(e) && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        toggleAIPanelRef.current?.();
      }
      if (modOnly(e) && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onVoiceKey, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
