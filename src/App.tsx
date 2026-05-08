import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from "react";
import { getCurrentWindow } from "./lib/ipc";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { VoiceIndicator } from "./components/VoiceIndicator";
import { TerminalTab } from "./components/TerminalTab";
import { GridTabToolbar } from "./components/GridTabToolbar";
import { GridResizers } from "./components/GridResizers";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useWorkspace } from "./hooks/useWorkspace";
import { ColorPicker } from "./components/ColorPicker";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { useMaximized } from "./hooks/useMaximized";
import {
  VaultGateProvider,
  useVaultGate,
  type VaultModalMode,
} from "./vault/VaultGate";
import { VaultModalHost } from "./vault/VaultModalHost";
import { useAgentStatus } from "./hooks/useAgentStatus";
import { useMcpServer } from "./hooks/useMcpServer";
import { AICommandPalette } from "./components/AICommandPalette";
import { ExplainPopover } from "./components/ExplainPopover";
import { AIPanel } from "./components/AIPanel";
// Git Panel is now provided by the git-panel extension under
// extensions/git-panel/. Sidebar.tsx mounts plugin panels via PluginPanelSlot.
import { invoke, open as openDialog } from "./lib/ipc";
import type { AiUsage } from "./hooks/useAI";
import { getAiProviderRegistry } from "./extensions/registries/providers-ai";
import { computeGridLayout, computeOccupancy, defaultSizes } from "./lib/grid-layout";
import { useSettings } from "./settings/useSettings";
import { findTheme } from "./settings/themes";
import { SettingsModal } from "./settings/SettingsModal";
import { useVoiceRecognition } from "./hooks/useVoiceRecognition";
import { useThemeVars } from "./hooks/useThemeVars";
import { useGlobalHotkeys } from "./hooks/useGlobalHotkeys";
import { insertDictation } from "./lib/insertDictation";
import { publishTerminalOptions } from "./lib/terminal-options-broadcast";
import {
  bootExtensionsHostRenderer,
  getRendererEventBus,
  getTabTypeRegistry,
  getTerminalRegistry,
  setSettingsBackend,
  setWorkspaceBackend,
} from "./extensions";
import { PluginUiHost } from "./extensions/components/PluginUiHost";
import { PluginManager } from "./extensions/components/PluginManager";
import { PluginTabHost } from "./extensions/components/PluginTabHost";
import { MarketplaceModal } from "./marketplace/components/MarketplaceModal";
import { OnboardingModal } from "./marketplace/components/OnboardingModal";
import { marketplaceApi } from "./marketplace/api";

interface CtxState {
  x: number;
  y: number;
  items: MenuItem[];
}

export default function App() {
  const settingsBundle = useSettings();
  const { settings } = settingsBundle;
  const vaultEnabled =
    settings.aiEnabled ||
    (settings.voiceEnabled && settings.voiceEngine === "openai");
  return (
    <VaultGateProvider
      enabled={vaultEnabled}
      idleLockMs={settings.vaultIdleLockMs}
    >
      <AppInner settingsBundle={settingsBundle} />
    </VaultGateProvider>
  );
}

function AppInner({
  settingsBundle,
}: {
  settingsBundle: ReturnType<typeof useSettings>;
}) {
  const ws = useWorkspace();
  const sys = useSystemInfo();
  const maximized = useMaximized();
  const { settings, update, reset } = settingsBundle;
  const theme = useMemo(() => findTheme(settings.themeId), [settings.themeId]);
  const xtermTheme = useMemo(
    () => ({
      ...theme.xterm,
      background:
        settings.windowOpacity < 1
          ? "rgba(0, 0, 0, 0)"
          : theme.xterm.background,
    }),
    [theme, settings.windowOpacity],
  );
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [explainState, setExplainState] = useState<{
    selection: string;
    context?: string;
    cwd?: string;
  } | null>(null);
  const [paletteRecentOutput, setPaletteRecentOutput] = useState<string | undefined>();
  const [aiUsage, setAiUsage] = useState<AiUsage>({ inTokens: 0, outTokens: 0, costUsd: 0 });
  const accumulateUsage = useCallback((u: AiUsage) => {
    setAiUsage((cur) => ({
      inTokens: cur.inTokens + u.inTokens,
      outTokens: cur.outTokens + u.outTokens,
      costUsd: cur.costUsd + u.costUsd,
    }));
  }, []);
  const [closeConfirm, setCloseConfirm] = useState<{ count: number } | null>(null);
  const [gridGroupId, setGridGroupId] = useState<string | null>(null);
  const [soloTabId, setSoloTabId] = useState<number | null>(null);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const mp = (window as unknown as {
      mt?: { marketplace?: { setEndpoint?: (url: string | null) => Promise<unknown> } };
    }).mt?.marketplace;
    if (mp?.setEndpoint) {
      const value = settings.marketplaceEndpoint;
      void mp.setEndpoint(value && value.length > 0 ? value : null).catch(() => {});
    }
    marketplaceApi
      .isFirstRun()
      .then((first) => {
        if (!cancelled && first) setShowOnboarding(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.marketplaceEndpoint]);

  const vault = useVaultGate();

  const requestVault = useCallback(
    (mode: VaultModalMode, after?: () => void) => {
      vault.openModal(mode);
      if (after) {
        void vault.ensure().then((ok) => {
          if (ok) after();
        });
      }
    },
    [vault],
  );

  const ensureVaultUnlocked = useCallback(
    (after: () => void) => {
      if (vault.status.unlocked) return true;
      void vault.ensure().then((ok) => {
        if (ok) after();
      });
      return false;
    },
    [vault],
  );

  const [ptyMap, setPtyMap] = useState<Map<number, number>>(new Map());
  const pendingCommandsRef = useRef<Map<number, string>>(new Map());
  const handlePtyReady = useCallback((tabId: number, ptyId: number) => {
    setPtyMap((m) => {
      const n = new Map(m);
      n.set(tabId, ptyId);
      return n;
    });
  }, []);
  const handlePtyClose = useCallback((tabId: number) => {
    setPtyMap((m) => {
      const n = new Map(m);
      n.delete(tabId);
      return n;
    });
    pendingCommandsRef.current.delete(tabId);
  }, []);

  const agentStatuses = useAgentStatus(ptyMap, ws.activeId, {
    enabled: settings.claudeCodeDetectionEnabled,
    notifyOnAwaitingInput: true,
    notifyOnDone: true,
  });

  const mcp = useMcpServer(settings.aiEnabled && settings.mcpServerEnabled);

  const pasteToActive = useCallback(
    async (text: string, run: boolean) => {
      if (ws.activeId == null) return;
      const ptyId = ptyMap.get(ws.activeId);
      if (ptyId == null) return;
      const data = run ? text + "\n" : text;
      await invoke("pty_write", { id: ptyId, data }).catch(() => {});
    },
    [ws.activeId, ptyMap],
  );

  const openPalette = useCallback(async () => {
    if (!settings.aiEnabled) {
      setShowSettings(true);
      return;
    }
    const doOpen = async () => {
      if (ws.activeId != null) {
        const ptyId = ptyMap.get(ws.activeId);
        if (ptyId != null) {
          try {
            const out = await invoke<string>("pty_recent_output", {
              id: ptyId,
              maxBytes: 4096,
            });
            setPaletteRecentOutput(out);
          } catch {
            setPaletteRecentOutput(undefined);
          }
        }
      }
      setShowPalette(true);
    };
    const needsVault =
      getAiProviderRegistry().get(settings.aiDefaultProvider)?.requiresVault === true;
    if (needsVault && !ensureVaultUnlocked(() => { void doOpen(); })) return;
    await doOpen();
  }, [
    settings.aiEnabled,
    settings.aiDefaultProvider,
    ws.activeId,
    ptyMap,
    ensureVaultUnlocked,
  ]);

  const openExplain = useCallback(
    async (tabId: number, selection: string, _x: number, _y: number) => {
      if (!settings.aiEnabled || !settings.aiExplainEnabled) return;
      const doOpen = async () => {
        const ptyId = ptyMap.get(tabId);
        let context: string | undefined;
        if (ptyId != null) {
          try {
            context = await invoke<string>("pty_recent_output", {
              id: ptyId,
              maxBytes: 3000,
            });
          } catch {}
        }
        const tab = ws.tabs.find((t) => t.id === tabId);
        setExplainState({ selection, context, cwd: tab?.cwd });
      };
      const needsVault =
      getAiProviderRegistry().get(settings.aiDefaultProvider)?.requiresVault === true;
      if (needsVault && !ensureVaultUnlocked(() => { void doOpen(); })) return;
      await doOpen();
    },
    [
      settings.aiEnabled,
      settings.aiExplainEnabled,
      settings.aiDefaultProvider,
      ptyMap,
      ws.tabs,
      ensureVaultUnlocked,
    ],
  );

  const aiProvider = settings.aiDefaultProvider;
  const aiProviderCfg = settings.aiProviderConfig?.[aiProvider];
  const aiModel = aiProviderCfg?.model ?? "";
  const aiBaseUrl = aiProviderCfg?.baseUrl || undefined;
  const tabsRef = useRef(ws.tabs);
  tabsRef.current = ws.tabs;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    (window as unknown as { __MT_HOME?: string }).__MT_HOME = `/home/${sys.user}`;
  }, [sys.user]);

  // ── Extension system: settings/workspace backends + boot ────────────────
  // Wire the renderer host's settings/workspace backends to the live React
  // state. Boot is fire-and-forget — plugins activate asynchronously.
  useEffect(() => {
    setSettingsBackend({
      readAll: (extId) => settingsRef.current.extensions?.[extId] ?? {},
      read: (extId, key) => settingsRef.current.extensions?.[extId]?.[key],
      write: async (extId, key, value) => {
        const cur = settingsRef.current.extensions ?? {};
        const next: Record<string, Record<string, unknown>> = { ...cur };
        next[extId] = { ...(next[extId] ?? {}), [key]: value };
        updateRef.current("extensions", next);
      },
      onChange: () => ({ dispose: () => {} }),
      readCore: <T = unknown,>(key: string): T | undefined =>
        (settingsRef.current as unknown as Record<string, T>)[key],
      onCoreChange: () => ({ dispose: () => {} }),
    });
    const tabType = (t: { kind: string; customType?: string }): string =>
      t.kind === "custom" ? t.customType ?? "custom" : "terminal";
    setWorkspaceBackend({
      groups: () => wsRef.current.groups.map((g) => ({ id: g.id, label: g.name })),
      activeGroup: () => {
        const ws = wsRef.current;
        const active = ws.tabs.find((t) => t.id === ws.activeId);
        return active?.groupId ?? null;
      },
      setActiveGroup: () => {},
      tabs: () =>
        wsRef.current.tabs.map((t) => ({
          id: t.id,
          type: tabType(t),
          title: t.label,
          groupId: t.groupId,
          active: t.id === wsRef.current.activeId,
        })),
      cwd: () => {
        const ws = wsRef.current;
        const active = ws.tabs.find((t) => t.id === ws.activeId);
        if (active?.cwd) return active.cwd;
        const termActive = getTerminalRegistry().getActive();
        if (termActive) {
          const tab = ws.tabs.find((t) => t.id === termActive.tabId);
          if (tab?.cwd) return tab.cwd;
          return termActive.cwd ?? null;
        }
        return null;
      },
      openTab: async (args: { type: string; title?: string; props?: unknown; groupId?: string | null }) => {
        if (args.type === "terminal") {
          return wsRef.current.addTab(args.groupId ?? undefined);
        }
        const ws = wsRef.current;
        const active = ws.tabs.find((t) => t.id === ws.activeId);
        const inferredGroupId =
          args.groupId === undefined
            ? active && (active.kind === "local" || active.kind === "custom")
              ? active.groupId
              : null
            : args.groupId;
        const id = ws.addCustomTab({
          customType: args.type,
          label: args.title,
          groupId: inferredGroupId,
          props: args.props,
        });
        if (inferredGroupId) setGridGroupId(inferredGroupId);
        return id;
      },
      closeTab: (id: number) => wsRef.current.closeTab(id),
      active: () => {
        const ws = wsRef.current;
        const a = ws.tabs.find((t) => t.id === ws.activeId);
        return a ? { id: a.id, type: tabType(a) } : null;
      },
      list: () =>
        wsRef.current.tabs.map((t) => ({
          id: t.id,
          type: tabType(t),
          title: t.label,
          groupId: t.groupId,
          active: t.id === wsRef.current.activeId,
        })),
      onTabsChange: () => ({ dispose: () => {} }),
    });
    void bootExtensionsHostRenderer().catch((err) => {
      console.error("[extensions] boot failed:", err);
    });
  }, []);

  const [registeredTabTypes, setRegisteredTabTypes] = useState<Set<string>>(() => {
    const reg = getTabTypeRegistry();
    return new Set(reg.list().map((t) => t.id));
  });
  useEffect(() => {
    const reg = getTabTypeRegistry();
    const refresh = (): void => {
      setRegisteredTabTypes(new Set(reg.list().map((t) => t.id)));
    };
    refresh();
    const sub = reg.subscribe(refresh);
    return () => sub.dispose();
  }, []);

  const [showPluginManager, setShowPluginManager] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "x") {
        e.preventDefault();
        setShowPluginManager((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useThemeVars(theme, settings);

  useEffect(() => {
    publishTerminalOptions({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      copyOnSelect: settings.copyOnSelect,
      theme: xtermTheme,
    });
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.scrollback,
    settings.copyOnSelect,
    xtermTheme,
  ]);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlistenPromise = win.onCloseRequested((event) => {
      const tabs = tabsRef.current;
      const cfg = settingsRef.current;
      if (cfg.confirmCloseMultipleTabs && tabs.length > 1) {
        event.preventDefault();
        setCloseConfirm({ count: tabs.length });
      }
    });
    return () => {
      unlistenPromise.then((u) => u()).catch(() => {});
    };
  }, []);

  const confirmQuit = () => {
    setCloseConfirm(null);
    getCurrentWindow()
      .destroy()
      .catch((err) => console.error("destroy failed", err));
  };

  const shellArgs = useMemo(
    () =>
      settings.shellArgs
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    [settings.shellArgs],
  );

  const activeTab = useMemo(
    () => ws.tabs.find((t) => t.id === ws.activeId) ?? null,
    [ws.tabs, ws.activeId],
  );

  // Bridge core state changes onto the extension event bus so plugins can
  // subscribe via ctx.events.on('app:tab:focused' / 'app:cwd:changed' / ...).
  const prevActiveIdRef = useRef<number | null>(null);
  const prevCwdRef = useRef<string | null>(null);
  const prevTabIdsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const next = ws.activeId;
    const prev = prevActiveIdRef.current;
    const bus = getRendererEventBus();
    if (next !== prev) {
      prevActiveIdRef.current = next;
      if (next != null) {
        bus.emit("app:tab:focused", { tabId: next, prevTabId: prev });
      }
    }
    const cwd = activeTab?.cwd ?? null;
    if (cwd !== prevCwdRef.current && next != null) {
      prevCwdRef.current = cwd;
      if (cwd) {
        bus.emit("app:cwd:changed", { tabId: next, cwd });
      }
    }
    const cur = new Set(ws.tabs.map((t) => t.id));
    for (const id of cur) {
      if (!prevTabIdsRef.current.has(id)) {
        const tab = ws.tabs.find((t) => t.id === id);
        if (tab) {
          bus.emit("app:tab:created", {
            tab: {
              id: tab.id,
              type: "terminal",
              title: tab.label,
              groupId: tab.groupId,
              active: tab.id === ws.activeId,
            },
          });
        }
      }
    }
    for (const id of prevTabIdsRef.current) {
      if (!cur.has(id)) {
        bus.emit("app:tab:closed", { tabId: id });
      }
    }
    prevTabIdsRef.current = cur;
  }, [ws.activeId, ws.tabs, activeTab?.cwd]);

  // Settings/theme change events go through the bus as well.
  const prevThemeRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevThemeRef.current !== null && prevThemeRef.current !== settings.themeId) {
      getRendererEventBus().emit("app:theme:changed", { themeId: settings.themeId });
    }
    prevThemeRef.current = settings.themeId;
  }, [settings.themeId]);

  // Settings change broadcasting. Diff each top-level key against the
  // previous render and emit `app:settings:changed` for any that changed.
  // Plugins listen via `ctx.settings.onChange` (their own namespace) or the
  // global event for cross-cutting concerns.
  const prevSettingsRef = useRef(settings);
  useEffect(() => {
    const prev = prevSettingsRef.current as unknown as Record<string, unknown>;
    const cur = settings as unknown as Record<string, unknown>;
    if (prev !== cur) {
      const bus = getRendererEventBus();
      for (const key of Object.keys(cur)) {
        if (prev[key] !== cur[key]) {
          bus.emit("app:settings:changed", { key, value: cur[key] });
        }
      }
      prevSettingsRef.current = settings;
    }
  }, [settings]);

  const ptyMapRef = useRef(ptyMap);
  ptyMapRef.current = ptyMap;
  const activeIdRef = useRef(ws.activeId);
  activeIdRef.current = ws.activeId;

  const voiceConfig = useMemo(
    () => ({
      enabled: settings.voiceEnabled,
      engine: settings.voiceEngine,
      language: settings.voiceLanguage,
      whisperBinPath: settings.voiceWhisperCppBinPath,
      whisperModelPath: settings.voiceWhisperCppModelPath,
      openaiModel: settings.voiceOpenaiModel,
      openaiBaseUrl: settings.voiceOpenaiBaseUrl,
    }),
    [
      settings.voiceEnabled,
      settings.voiceEngine,
      settings.voiceLanguage,
      settings.voiceWhisperCppBinPath,
      settings.voiceWhisperCppModelPath,
      settings.voiceOpenaiModel,
      settings.voiceOpenaiBaseUrl,
    ],
  );

  const voiceModelLabel = useMemo(() => {
    if (settings.voiceEngine === "openai") {
      const model = settings.voiceOpenaiModel.trim() || "whisper-1";
      return `OpenAI · ${model}`;
    }
    const path = settings.voiceWhisperCppModelPath.trim();
    if (!path) return "whisper.cpp";
    const base = path.split(/[\\/]/).pop() || path;
    const name = base.replace(/^ggml-/, "").replace(/\.bin$/i, "");
    return `whisper.cpp · ${name}`;
  }, [
    settings.voiceEngine,
    settings.voiceOpenaiModel,
    settings.voiceWhisperCppModelPath,
  ]);

  const voice = useVoiceRecognition({
    config: voiceConfig,
    onText: (text) => {
      const aid = activeIdRef.current;
      const ptyId = aid != null ? ptyMapRef.current.get(aid) : undefined;
      void insertDictation(text, {
        activeTabPtyId: ptyId,
        autoSpace: settingsRef.current.voiceAutoSpace,
      });
    },
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const gridTabsRaw = useMemo(
    () =>
      gridGroupId
        ? ws.tabs.filter((t) => t.groupId === gridGroupId)
        : [],
    [ws.tabs, gridGroupId],
  );

  const gridSlotOrder = gridGroupId
    ? ws.groupLayouts[gridGroupId]?.slotOrder
    : undefined;

  const gridTabs = useMemo(() => {
    if (!gridSlotOrder) return gridTabsRaw;
    const byId = new Map(gridTabsRaw.map((t) => [t.id, t]));
    const ordered = gridSlotOrder
      .map((id) => byId.get(id))
      .filter((t): t is (typeof gridTabsRaw)[number] => t != null);
    for (const t of gridTabsRaw) {
      if (!gridSlotOrder.includes(t.id)) ordered.push(t);
    }
    return ordered;
  }, [gridTabsRaw, gridSlotOrder]);

  useEffect(() => {
    if (gridGroupId && gridTabs.length === 0) setGridGroupId(null);
  }, [gridGroupId, gridTabs.length]);

  useEffect(() => {
    if (soloTabId == null) return;
    if (!gridGroupId || !gridTabs.some((t) => t.id === soloTabId)) {
      setSoloTabId(null);
    }
  }, [soloTabId, gridGroupId, gridTabs]);

  useEffect(() => {
    if (soloTabId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".xterm")) return;
        setSoloTabId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [soloTabId]);

  const visibleTabIds = useMemo(() => {
    if (gridGroupId && soloTabId != null) {
      return new Set([soloTabId]);
    }
    if (gridGroupId && gridTabs.length > 0) {
      return new Set(gridTabs.map((t) => t.id));
    }
    return new Set(ws.activeId != null ? [ws.activeId] : []);
  }, [gridGroupId, gridTabs, ws.activeId, soloTabId]);

  const customLayout = gridGroupId ? ws.groupLayouts[gridGroupId] : undefined;

  const gridDims = useMemo(() => {
    if (!gridGroupId) return null;
    if (soloTabId != null) return null;
    if (gridTabs.length === 0) return null;
    const auto = computeGridLayout(gridTabs.length);
    if (!auto) return null;
    const cols = auto.cols;
    const rows = auto.rows;
    const colSizes =
      customLayout && customLayout.cols === cols
        ? customLayout.colSizes
        : defaultSizes(cols);
    const rowSizes =
      customLayout && customLayout.cols === cols && customLayout.rowSizes.length === rows
        ? customLayout.rowSizes
        : defaultSizes(rows);
    return {
      cols,
      rows,
      colSizes,
      rowSizes,
      spanRowsSlots: auto.spanRowsSlots,
    };
  }, [gridGroupId, gridTabs.length, soloTabId, customLayout]);

  const [dragSourceTabId, setDragSourceTabId] = useState<number | null>(null);
  const [dropTargetTabId, setDropTargetTabId] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{ tabId: number; pointerId: number } | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewRef = useRef<HTMLDivElement | null>(null);

  const swapTabsInGroup = ws.swapTabsInGroup;
  const setGroupLayout = ws.setGroupLayout;

  const startTabDrag = useCallback(
    (tabId: number, e: RPointerEvent<HTMLDivElement>) => {
      if (!gridGroupId || soloTabId != null) return;
      e.preventDefault();
      dragStateRef.current = { tabId, pointerId: e.pointerId };
      setDragSourceTabId(tabId);
      setDropTargetTabId(null);
      setDragStartPos({ x: e.clientX, y: e.clientY });
      document.body.classList.add("grid-tab-dragging");
    },
    [gridGroupId, soloTabId],
  );

  useEffect(() => {
    if (dragSourceTabId == null) return;
    const findTabUnder = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const cell = (el as Element).closest?.(".term-pane-cell.in-grid");
      if (!cell) return null;
      const raw = (cell as HTMLElement).dataset.tabId;
      if (!raw) return null;
      const id = Number.parseInt(raw, 10);
      return Number.isFinite(id) ? id : null;
    };
    const move = (ev: PointerEvent) => {
      const el = dragPreviewRef.current;
      if (el) el.style.translate = `${ev.clientX}px ${ev.clientY}px`;
      const target = findTabUnder(ev.clientX, ev.clientY);
      setDropTargetTabId(
        target != null && target !== dragSourceTabId ? target : null,
      );
    };
    const finish = (ev: PointerEvent) => {
      const target = findTabUnder(ev.clientX, ev.clientY);
      if (target != null && target !== dragSourceTabId) {
        swapTabsInGroup(dragSourceTabId, target);
      }
      cleanup();
    };
    const cancel = () => cleanup();
    const cleanup = () => {
      dragStateRef.current = null;
      setDragSourceTabId(null);
      setDropTargetTabId(null);
      setDragStartPos(null);
      document.body.classList.remove("grid-tab-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return cleanup;
  }, [dragSourceTabId, swapTabsInGroup]);

  const dragSourceTab =
    dragSourceTabId != null
      ? ws.tabs.find((t) => t.id === dragSourceTabId)
      : null;

  const handleColSizes = useCallback(
    (sizes: number[]) => {
      if (!gridGroupId || !gridDims) return;
      setGroupLayout(gridGroupId, {
        cols: gridDims.cols,
        colSizes: sizes,
        rowSizes: gridDims.rowSizes,
      });
    },
    [gridGroupId, gridDims, setGroupLayout],
  );

  const handleRowSizes = useCallback(
    (sizes: number[]) => {
      if (!gridGroupId || !gridDims) return;
      setGroupLayout(gridGroupId, {
        cols: gridDims.cols,
        colSizes: gridDims.colSizes,
        rowSizes: sizes,
      });
    },
    [gridGroupId, gridDims, setGroupLayout],
  );

  const selectTab = (id: number) => {
    setGridGroupId(null);
    setSoloTabId(null);
    ws.setActive(id);
  };

  const onLockClick = useCallback(() => {
    if (!vault.status.exists) {
      requestVault("init");
      return;
    }
    if (vault.status.unlocked) {
      vault.lock().catch(() => {});
    } else {
      requestVault("unlock");
    }
  }, [vault, requestVault]);

  const selectGroup = (id: string) => {
    const tabsInGroup = ws.tabs.filter((t) => t.groupId === id);
    if (tabsInGroup.length === 0) {
      ws.addTab(id);
      setGridGroupId(id);
      return;
    }
    setGridGroupId(id);
    if (!tabsInGroup.some((t) => t.id === ws.activeId)) {
      ws.setActive(tabsInGroup[0].id);
    }
  };

  const toggleSidebar = () =>
    update("sidebarCollapsed", !settings.sidebarCollapsed);

  const shq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const spawnClaudeTab = useCallback(() => {
    const cur = ws.tabs.find((t) => t.id === ws.activeId);
    const cwd = cur?.cwd;
    const cmd = cwd ? `cd ${shq(cwd)} && claude\n` : `claude\n`;
    setGridGroupId(null);
    setSoloTabId(null);
    const id = ws.addTab();
    pendingCommandsRef.current.set(id, cmd);
  }, [ws]);

  const toggleSolo = useCallback((id: number) => {
    setSoloTabId((cur) => (cur === id ? null : id));
  }, []);
  const spawnClaudeTabRef = useRef(spawnClaudeTab);
  spawnClaudeTabRef.current = spawnClaudeTab;
  const openPaletteRef = useRef(openPalette);
  openPaletteRef.current = openPalette;
  const toggleAIPanel = useCallback(() => {
    if (!settings.aiEnabled) {
      setShowSettings(true);
      return;
    }
    if (settings.aiPanelOpen) {
      update("aiPanelOpen", false);
      return;
    }
    const doOpen = () => update("aiPanelOpen", true);
    const needsVault =
      getAiProviderRegistry().get(settings.aiDefaultProvider)?.requiresVault === true;
    if (needsVault && !ensureVaultUnlocked(doOpen)) return;
    doOpen();
  }, [
    settings.aiEnabled,
    settings.aiPanelOpen,
    settings.aiDefaultProvider,
    update,
    ensureVaultUnlocked,
  ]);
  const toggleAIPanelRef = useRef(toggleAIPanel);
  toggleAIPanelRef.current = toggleAIPanel;

  useGlobalHotkeys({
    wsRef,
    settingsRef,
    updateRef,
    voiceRef,
    spawnClaudeTabRef,
    openPaletteRef,
    toggleAIPanelRef,
    setGridGroupId,
    setShowSettings,
    setShowMarketplace,
  });

  const openTabMenu = (id: number, x: number, y: number) => {
    const tab = ws.tabs.find((t) => t.id === id);
    if (!tab) return;
    const otherGroups = ws.groups.filter((g) => g.id !== tab.groupId);
    const moveItems: MenuItem[] = [];
    if (tab.groupId !== null) {
      moveItems.push({
        label: "move to → ungrouped",
        onSelect: () => ws.moveTab(id, null),
      });
    }
    for (const g of otherGroups) {
      moveItems.push({
        label: `move to → ${g.name}`,
        onSelect: () => ws.moveTab(id, g.id),
      });
    }
    const items: MenuItem[] = [
      { label: "rename", onSelect: () => setEditingTabId(id) },
      ...(moveItems.length
        ? [
            { label: "", onSelect: () => {}, separator: true } as MenuItem,
            ...moveItems,
          ]
        : []),
      { label: "", onSelect: () => {}, separator: true },
      { label: "close tab", onSelect: () => ws.closeTab(id), danger: true },
    ];
    setCtx({ x, y, items });
  };

  const pickGroupCwd = useCallback(
    async (id: string) => {
      const group = wsRef.current.groups.find((g) => g.id === id);
      try {
        const picked = await openDialog({
          directory: true,
          defaultPath: group?.defaultCwd,
          title: "select default working directory",
        });
        if (typeof picked === "string" && picked.length > 0) {
          ws.setGroupCwd(id, picked);
        }
      } catch {}
    },
    [ws],
  );

  const openGroupMenu = (id: string, x: number, y: number) => {
    const group = ws.groups.find((g) => g.id === id);
    const hasCwd = !!group?.defaultCwd;
    const items: MenuItem[] = [
      { label: "rename group", onSelect: () => setEditingGroupId(id) },
      { label: "new tab here", onSelect: () => ws.addTab(id) },
      { label: "toggle collapse", onSelect: () => ws.toggleGroup(id) },
      { label: "", onSelect: () => {}, separator: true },
      {
        label: hasCwd
          ? `default cwd: ${group?.defaultCwd}`
          : "set default cwd…",
        onSelect: () => {
          pickGroupCwd(id).catch(() => {});
        },
      },
      ...(hasCwd
        ? [
            {
              label: "clear default cwd",
              onSelect: () => ws.setGroupCwd(id, null),
            } as MenuItem,
          ]
        : []),
      { label: "", onSelect: () => {}, separator: true },
      {
        label: "change color",
        submenu: (
          <ColorPicker
            value={group?.accent ?? ""}
            onChange={(hex) => ws.setGroupAccent(id, hex)}
          />
        ),
      },
      { label: "", onSelect: () => {}, separator: true },
      {
        label: "delete group",
        onSelect: () => ws.deleteGroup(id),
        danger: true,
      },
    ];
    setCtx({ x, y, items });
  };

  const labelLower = (activeTab?.label ?? "shell").toLowerCase();
  const titleSize = `${ws.tabs.length} tab${ws.tabs.length === 1 ? "" : "s"}`;

  const shellCls = [
    "term-shell",
    maximized ? "maximized" : "",
    settings.sidebarCollapsed ? "sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellCls}>
      <Titlebar
        title={`mTerminal — ${labelLower} — ${titleSize}`}
        sidebarCollapsed={settings.sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      <div className="term-body">
        <Sidebar
          tabs={ws.tabs}
          groups={ws.groups}
          activeId={ws.activeId}
          sessionLabel={`${sys.user}@${sys.host}`}
          editingTabId={editingTabId}
          editingGroupId={editingGroupId}
          setEditingTabId={setEditingTabId}
          setEditingGroupId={setEditingGroupId}
          onSelectTab={selectTab}
          onAddTab={(g) => {
            const active = ws.tabs.find((t) => t.id === ws.activeId);
            const activeGroup =
              active && active.kind === "local" ? active.groupId : null;
            const target = g === undefined ? activeGroup : g;
            if (target !== gridGroupId) setGridGroupId(null);
            ws.addTab(g);
          }}
          onAddFileBrowser={
            registeredTabTypes.has("file-browser")
              ? (gid) => {
                  ws.addCustomTab({
                    customType: "file-browser",
                    label: "files",
                    groupId: gid,
                  });
                  setGridGroupId(gid);
                }
              : undefined
          }
          onAddGroup={() => ws.addGroup()}
          onToggleGroup={ws.toggleGroup}
          onRenameTab={ws.renameTab}
          onRenameGroup={ws.renameGroup}
          onTabContextMenu={openTabMenu}
          onGroupContextMenu={openGroupMenu}
          onReorderTab={ws.reorderTab}
          onReorderGroup={ws.reorderGroup}
          onOpenSettings={() => setShowSettings(true)}
          activeGroupId={gridGroupId}
          onSelectGroup={selectGroup}
          width={settings.sidebarWidth}
          onResize={(w) => update("sidebarWidth", w)}
          agentStatuses={agentStatuses}
        />

        <main className="term-main">
          <div
            ref={paneRef}
            className={`term-pane${gridDims ? " grid" : ""}`}
            style={
              gridDims
                ? ({
                    ["--grid-col-sizes" as never]: gridDims.colSizes
                      .map((n) => `${n}fr`)
                      .join(" "),
                    ["--grid-row-sizes" as never]: gridDims.rowSizes
                      .map((n) => `${n}fr`)
                      .join(" "),
                  } as CSSProperties)
                : undefined
            }
          >
            {gridDims && (
              <GridResizers
                cols={gridDims.cols}
                rows={gridDims.rows}
                colSizes={gridDims.colSizes}
                rowSizes={gridDims.rowSizes}
                containerRef={paneRef}
                onColSizes={handleColSizes}
                onRowSizes={handleRowSizes}
                occupancy={computeOccupancy(
                  gridTabs.length,
                  gridDims.cols,
                  gridDims.rows,
                  gridDims.spanRowsSlots,
                )}
              />
            )}
            {ws.tabs.map((t) => {
              const isGridContext =
                gridGroupId !== null && t.groupId === gridGroupId;
              const isSolo = soloTabId === t.id;
              const showToolbar =
                isGridContext && (gridDims !== null || isSolo);
              const slotIndex =
                gridDims && t.groupId === gridGroupId
                  ? gridTabs.findIndex((x) => x.id === t.id)
                  : -1;
              const isDropTarget = isGridContext && dropTargetTabId === t.id;
              const isDragging = isGridContext && dragSourceTabId === t.id;
              const tabToolbar = showToolbar ? (
                <GridTabToolbar
                  label={t.label}
                  sub={t.sub}
                  isSolo={isSolo}
                  onSolo={() => toggleSolo(t.id)}
                  onRename={() => setEditingTabId(t.id)}
                  onClose={() => ws.closeTab(t.id)}
                  onDragStart={
                    gridDims && !isSolo
                      ? (e) => startTabDrag(t.id, e)
                      : undefined
                  }
                  dragging={isDragging}
                  editing={editingTabId === t.id}
                  setEditing={(b) => setEditingTabId(b ? t.id : null)}
                  onCommitRename={(v) => ws.renameTab(t.id, v)}
                />
              ) : undefined;
              if (t.kind === "custom" && t.customType) {
                return (
                  <PluginTabHost
                    key={t.id}
                    tabId={t.id}
                    customType={t.customType}
                    customProps={t.customProps}
                    active={visibleTabIds.has(t.id)}
                    gridSlot={slotIndex >= 0 ? slotIndex : null}
                    gridSpanRows={
                      gridDims && slotIndex >= 0
                        ? gridDims.spanRowsSlots.has(slotIndex)
                        : false
                    }
                    gridPlacement={null}
                    isDropTarget={isDropTarget}
                    isDragging={isDragging}
                    toolbar={tabToolbar}
                  />
                );
              }
              return (
                <TerminalTab
                  key={t.id}
                  tabId={t.id}
                  active={visibleTabIds.has(t.id)}
                  gridSlot={slotIndex >= 0 ? slotIndex : null}
                  gridSpanRows={
                    gridDims && slotIndex >= 0
                      ? gridDims.spanRowsSlots.has(slotIndex)
                      : false
                  }
                  gridPlacement={null}
                  isDropTarget={isDropTarget}
                  isDragging={isDragging}
                  onExit={(id) => ws.closeTab(id)}
                  onInfo={ws.updateTabInfo}
                  onPtyReady={handlePtyReady}
                  onPtyClose={handlePtyClose}
                  onActivate={ws.setActive}
                  initialCommand={pendingCommandsRef.current.get(t.id) ?? null}
                  onSelectionMenu={openExplain}
                  toolbar={tabToolbar}
                  fontFamily={settings.fontFamily}
                  fontSize={settings.fontSize}
                  lineHeight={settings.lineHeight}
                  cursorStyle={settings.cursorStyle}
                  cursorBlink={settings.cursorBlink}
                  scrollback={settings.scrollback}
                  theme={xtermTheme}
                  shell={settings.shellOverride}
                  shellArgs={shellArgs}
                  showGreeting={settings.showGreeting}
                  copyOnSelect={settings.copyOnSelect}
                  initialCwd={t.cwd}
                />
              );
            })}
            {ws.tabs.length === 0 && (
              <div className="empty-state">
                no sessions — <span className="kbd-inline">Ctrl+T</span> to
                start
              </div>
            )}
          </div>
          <StatusBar
            activeLabel={activeTab?.label ?? "—"}
            cwd={activeTab?.cwd}
            cmd={activeTab?.sub}
            tabCount={ws.tabs.length}
            groupCount={ws.groups.length}
            aiUsage={settings.aiEnabled ? aiUsage : undefined}
            voice={
              settings.voiceEnabled && settings.voiceShowMicButton
                ? {
                    visible: true,
                    state: voice.state,
                    onToggle: voice.toggle,
                    tooltip: voice.error
                      ? `voice error: ${voice.error}`
                      : undefined,
                  }
                : undefined
            }
            vaultLock={
              vault.enabled
                ? {
                    visible: true,
                    exists: vault.status.exists,
                    unlocked: vault.status.unlocked,
                    onClick: onLockClick,
                  }
                : undefined
            }
          />
        </main>
      </div>

      {dragSourceTab && dragStartPos && (
        <div
          ref={dragPreviewRef}
          className="grid-drag-preview"
          style={{ translate: `${dragStartPos.x}px ${dragStartPos.y}px` }}
        >
          <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
            <circle cx="2.5" cy="3" r="1" fill="currentColor" />
            <circle cx="7.5" cy="3" r="1" fill="currentColor" />
            <circle cx="2.5" cy="7" r="1" fill="currentColor" />
            <circle cx="7.5" cy="7" r="1" fill="currentColor" />
            <circle cx="2.5" cy="11" r="1" fill="currentColor" />
            <circle cx="7.5" cy="11" r="1" fill="currentColor" />
          </svg>
          <span className="grid-drag-preview-label">{dragSourceTab.label}</span>
          {dragSourceTab.sub ? (
            <span className="grid-drag-preview-sub">{dragSourceTab.sub}</span>
          ) : null}
        </div>
      )}

      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          items={ctx.items}
          onClose={() => setCtx(null)}
        />
      )}

      {showPalette && (
        <AICommandPalette
          defaultProvider={aiProvider}
          defaultModel={aiModel}
          baseUrl={aiBaseUrl}
          cwd={activeTab?.cwd}
          recentOutput={paletteRecentOutput}
          onClose={() => setShowPalette(false)}
          onPaste={(text, run) => {
            pasteToActive(text, run).catch(() => {});
          }}
          onUsage={accumulateUsage}
        />
      )}

      {settings.aiEnabled && settings.aiPanelOpen && (
        <AIPanel
          defaultProvider={aiProvider}
          defaultModel={aiModel}
          baseUrl={aiBaseUrl}
          attachContext={settings.aiAttachContext}
          activeTabId={ws.activeId}
          activePtyId={ws.activeId != null ? ptyMap.get(ws.activeId) ?? null : null}
          cwd={activeTab?.cwd}
          onClose={() => update("aiPanelOpen", false)}
          onUsage={accumulateUsage}
        />
      )}

      {explainState && (
        <ExplainPopover
          selection={explainState.selection}
          context={explainState.context}
          cwd={explainState.cwd}
          defaultProvider={aiProvider}
          defaultModel={aiModel}
          baseUrl={aiBaseUrl}
          onClose={() => setExplainState(null)}
          onUsage={accumulateUsage}
        />
      )}

      {settings.voiceEnabled && (
        <VoiceIndicator
          state={voice.state}
          stream={voice.stream}
          onStop={voice.stop}
          modelLabel={voiceModelLabel}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          update={update}
          reset={reset}
          onClose={() => setShowSettings(false)}
          vaultUnlocked={vault.status.unlocked}
          vaultExists={vault.status.exists}
          onRequestVault={() =>
            requestVault(vault.status.exists ? "unlock" : "init")
          }
          mcpStatus={mcp.status}
          onOpenMarketplace={() => {
            setShowSettings(false);
            setShowMarketplace(true);
          }}
        />
      )}

      {closeConfirm && (
        <ConfirmDialog
          message={`quit mTerminal? ${closeConfirm.count} tabs are still open.`}
          confirmLabel="quit"
          cancelLabel="cancel"
          onConfirm={confirmQuit}
          onCancel={() => setCloseConfirm(null)}
        />
      )}

      <VaultModalHost />

      <MarketplaceModal open={showMarketplace} onClose={() => setShowMarketplace(false)} />
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      {/* Extension system: pending modals/toasts/trust prompts. */}
      <PluginUiHost />

      {showPluginManager && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 8200,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPluginManager(false);
          }}
        >
          <div
            style={{
              background: "var(--surface, #1a1a1a)",
              color: "var(--text, #eee)",
              borderRadius: 8,
              width: "min(720px, 92vw)",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border, #333)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <strong>Extensions</strong>
              <button
                type="button"
                onClick={() => setShowPluginManager(false)}
                style={{
                  background: "transparent",
                  color: "inherit",
                  border: "1px solid var(--border, #444)",
                  borderRadius: 4,
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Close
              </button>
            </div>
            <PluginManager />
          </div>
        </div>
      )}
    </div>
  );
}
