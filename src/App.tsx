import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCurrentWindow } from "./lib/ipc";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TerminalTab } from "./components/TerminalTab";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { RemoteWorkspace } from "./components/RemoteWorkspace";
import {
  MasterPasswordModal,
  type MasterPasswordMode,
} from "./components/MasterPasswordModal";
import { RemoteHostModal } from "./components/RemoteHostModal";
import { useWorkspace } from "./hooks/useWorkspace";
import { ColorPicker } from "./components/ColorPicker";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { useMaximized } from "./hooks/useMaximized";
import { useVault } from "./hooks/useVault";
import { useClaudeCodeStatus } from "./hooks/useClaudeCodeStatus";
import { useMcpServer } from "./hooks/useMcpServer";
import { AICommandPalette } from "./components/AICommandPalette";
import { ExplainPopover } from "./components/ExplainPopover";
import { AIPanel } from "./components/AIPanel";
import { GitPanel } from "./components/GitPanel";
import { invoke, open as openDialog } from "./lib/ipc";
import type { AiUsage } from "./hooks/useAI";
import {
  useRemoteHosts,
  type HostGroup,
  type HostMeta,
} from "./hooks/useRemoteHosts";
import { useSettings } from "./settings/useSettings";
import { findTheme } from "./settings/themes";
import { SettingsModal } from "./settings/SettingsModal";
import { useVoiceRecognition } from "./hooks/useVoiceRecognition";
import { useThemeVars } from "./hooks/useThemeVars";
import { useGlobalHotkeys } from "./hooks/useGlobalHotkeys";
import { insertDictation } from "./lib/insertDictation";

interface CtxState {
  x: number;
  y: number;
  items: MenuItem[];
}

export default function App() {
  const ws = useWorkspace();
  const sys = useSystemInfo();
  const maximized = useMaximized();
  const { settings, update, reset } = useSettings();
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
  const [hostModal, setHostModal] = useState<{
    initial: HostMeta | null;
    presetGroupId?: string | null;
  } | null>(null);
  const [editingHostGroupId, setEditingHostGroupId] = useState<string | null>(null);
  const [vaultModal, setVaultModal] = useState<{ mode: MasterPasswordMode } | null>(null);
  const [pendingAfterUnlock, setPendingAfterUnlock] = useState<(() => void) | null>(null);

  const vault = useVault(settings.remoteWorkspaceEnabled || settings.aiEnabled);

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

  const ccStatuses = useClaudeCodeStatus(ptyMap, ws.activeId, {
    enabled: settings.claudeCodeDetectionEnabled,
    notifyOnAwaitingInput: true,
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
  }, [settings.aiEnabled, ws.activeId, ptyMap]);

  const openExplain = useCallback(
    async (tabId: number, selection: string, _x: number, _y: number) => {
      if (!settings.aiEnabled || !settings.aiExplainEnabled) return;
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
    },
    [settings.aiEnabled, settings.aiExplainEnabled, ptyMap, ws.tabs],
  );

  const aiProvider = settings.aiDefaultProvider;
  const aiModel =
    aiProvider === "anthropic"
      ? settings.aiAnthropicModel
      : aiProvider === "openai"
        ? settings.aiOpenaiModel
        : settings.aiOllamaModel;
  const aiBaseUrl =
    aiProvider === "openai"
      ? settings.aiOpenaiBaseUrl
      : aiProvider === "ollama"
        ? settings.aiOllamaBaseUrl
        : undefined;
  const remote = useRemoteHosts(
    settings.remoteWorkspaceEnabled,
    vault.status.unlocked,
  );

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

  useThemeVars(theme, settings);

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

  const gridTabs = useMemo(
    () =>
      gridGroupId
        ? ws.tabs.filter((t) => t.groupId === gridGroupId)
        : [],
    [ws.tabs, gridGroupId],
  );

  useEffect(() => {
    if (gridGroupId && gridTabs.length === 0) setGridGroupId(null);
  }, [gridGroupId, gridTabs.length]);

  const visibleTabIds = useMemo(() => {
    if (gridGroupId && gridTabs.length > 0) {
      return new Set(gridTabs.map((t) => t.id));
    }
    return new Set(ws.activeId != null ? [ws.activeId] : []);
  }, [gridGroupId, gridTabs, ws.activeId]);

  const gridDims = useMemo(() => {
    const n = gridTabs.length;
    if (!gridGroupId || n === 0) return null;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    return { cols, rows };
  }, [gridGroupId, gridTabs.length]);

  const selectTab = (id: number) => {
    setGridGroupId(null);
    ws.setActive(id);
  };

  const requestVault = useCallback(
    (mode: MasterPasswordMode, after?: () => void) => {
      if (after) setPendingAfterUnlock(() => after);
      setVaultModal({ mode });
    },
    [],
  );

  const ensureVaultUnlocked = useCallback(
    (after: () => void) => {
      if (!vault.status.exists) {
        requestVault("init", after);
        return false;
      }
      if (!vault.status.unlocked) {
        requestVault("unlock", after);
        return false;
      }
      return true;
    },
    [vault.status, requestVault],
  );

  const connectToHost = useCallback(
    (host: HostMeta) => {
      const needsVault = host.auth === "password" && host.savePassword;
      const doConnect = () => {
        const label = host.name?.trim() || `${host.user}@${host.host}`;
        ws.addRemoteTab(host.id, label);
        setGridGroupId(null);
      };
      if (needsVault && !ensureVaultUnlocked(doConnect)) return;
      doConnect();
    },
    [ws, ensureVaultUnlocked],
  );

  const openAddHost = (groupId?: string | null) => {
    if (!vault.status.exists) {
      requestVault("init", () =>
        setHostModal({ initial: null, presetGroupId: groupId ?? null }),
      );
      return;
    }
    setHostModal({ initial: null, presetGroupId: groupId ?? null });
  };

  const openEditHost = (host: HostMeta) =>
    setHostModal({ initial: host, presetGroupId: host.groupId ?? null });

  const handleHostSubmit = useCallback(
    async (host: HostMeta, password?: string) => {
      const willSavePw = host.auth === "password" && host.savePassword;
      if (willSavePw && !vault.status.unlocked) {
        requestVault("unlock", () => {
          remote.save(host, password).catch(() => {});
        });
        throw new Error("vault locked — unlocking...");
      }
      await remote.save(host, password);
    },
    [remote, vault.status.unlocked, requestVault],
  );

  const handleHostDelete = useCallback(
    async (host: HostMeta) => {
      await remote.remove(host.id);
    },
    [remote],
  );

  const openHostMenu = (host: HostMeta, x: number, y: number) => {
    const otherGroups = remote.groups.filter((g) => g.id !== host.groupId);
    const moveItems: MenuItem[] = [];
    if (host.groupId) {
      moveItems.push({
        label: "move to → ungrouped",
        onSelect: () =>
          remote.setHostGroup(host.id, null).catch(() => {}),
      });
    }
    for (const g of otherGroups) {
      moveItems.push({
        label: `move to → ${g.name}`,
        onSelect: () =>
          remote.setHostGroup(host.id, g.id).catch(() => {}),
      });
    }
    const items: MenuItem[] = [
      { label: "connect", onSelect: () => connectToHost(host) },
      { label: "edit", onSelect: () => openEditHost(host) },
      ...(moveItems.length
        ? [
            { label: "", onSelect: () => {}, separator: true } as MenuItem,
            ...moveItems,
          ]
        : []),
      { label: "", onSelect: () => {}, separator: true },
      {
        label: "delete",
        onSelect: () => handleHostDelete(host).catch(() => {}),
        danger: true,
      },
    ];
    setCtx({ x, y, items });
  };

  const openHostGroupMenu = (group: HostGroup, x: number, y: number) => {
    const items: MenuItem[] = [
      { label: "rename group", onSelect: () => setEditingHostGroupId(group.id) },
      { label: "new host here", onSelect: () => openAddHost(group.id) },
      {
        label: "toggle collapse",
        onSelect: () => remote.toggleGroup(group.id).catch(() => {}),
      },
      { label: "", onSelect: () => {}, separator: true },
      {
        label: "change color",
        submenu: (
          <ColorPicker
            value={group.accent}
            onChange={(hex) =>
              remote.setGroupAccent(group.id, hex).catch(() => {})
            }
          />
        ),
      },
      { label: "", onSelect: () => {}, separator: true },
      {
        label: "delete group",
        onSelect: () => remote.deleteGroup(group.id).catch(() => {}),
        danger: true,
      },
    ];
    setCtx({ x, y, items });
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
    const id = ws.addTab();
    pendingCommandsRef.current.set(id, cmd);
  }, [ws]);
  const spawnClaudeTabRef = useRef(spawnClaudeTab);
  spawnClaudeTabRef.current = spawnClaudeTab;
  const openPaletteRef = useRef(openPalette);
  openPaletteRef.current = openPalette;
  const toggleAIPanel = useCallback(() => {
    if (!settings.aiEnabled) {
      setShowSettings(true);
      return;
    }
    update("aiPanelOpen", !settings.aiPanelOpen);
  }, [settings.aiEnabled, settings.aiPanelOpen, update]);
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
            setGridGroupId(null);
            ws.addTab(g);
          }}
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
          ccStatuses={ccStatuses}
          gitSlot={
            settings.gitPanelEnabled ? (
              <GitPanel
                cwd={activeTab?.cwd}
                collapsed={settings.gitPanelCollapsed}
                onToggleCollapsed={(b) => update("gitPanelCollapsed", b)}
                treeView={settings.gitPanelTreeView}
                onToggleTreeView={(b) => update("gitPanelTreeView", b)}
                settings={settings}
                height={settings.gitPanelHeight}
                onResizeHeight={(h) => update("gitPanelHeight", h)}
                onUpdatePullStrategy={(s) => update("gitPullStrategy", s)}
                onEnsureVaultUnlocked={ensureVaultUnlocked}
              />
            ) : undefined
          }
          remoteSlot={
            settings.remoteWorkspaceEnabled ? (
              <RemoteWorkspace
                hosts={remote.hosts}
                groups={remote.groups}
                vault={vault.status}
                onAddHost={openAddHost}
                onConnect={connectToHost}
                onLockClick={onLockClick}
                onHostContextMenu={openHostMenu}
                onGroupContextMenu={openHostGroupMenu}
                onAddGroup={() => remote.addGroup().catch(() => {})}
                onToggleGroup={(id) => remote.toggleGroup(id).catch(() => {})}
                onRenameGroup={(id, name) =>
                  remote.renameGroup(id, name).catch(() => {})
                }
                onSetHostGroup={(hid, gid) =>
                  remote.setHostGroup(hid, gid).catch(() => {})
                }
                editingGroupId={editingHostGroupId}
                setEditingGroupId={setEditingHostGroupId}
              />
            ) : null
          }
        />

        <main className="term-main">
          <div
            className={`term-pane${gridDims ? " grid" : ""}`}
            style={
              gridDims
                ? ({
                    ["--grid-cols" as never]: gridDims.cols,
                    ["--grid-rows" as never]: gridDims.rows,
                  } as CSSProperties)
                : undefined
            }
          >
            {ws.tabs.map((t) => {
              const remoteHost =
                t.kind === "remote" && t.remoteHostId
                  ? remote.hosts.find((h) => h.id === t.remoteHostId)
                  : undefined;
              const banner = remoteHost
                ? `connecting to ${remoteHost.user}@${remoteHost.host}:${remoteHost.port}...`
                : t.kind === "remote"
                  ? "connecting to remote host..."
                  : undefined;
              return (
                <TerminalTab
                  key={t.id}
                  tabId={t.id}
                  active={visibleTabIds.has(t.id)}
                  gridSlot={
                    gridDims && t.groupId === gridGroupId
                      ? gridTabs.findIndex((x) => x.id === t.id)
                      : null
                  }
                  onExit={(id) => ws.closeTab(id)}
                  onInfo={ws.updateTabInfo}
                  onPtyReady={handlePtyReady}
                  onPtyClose={handlePtyClose}
                  initialCommand={pendingCommandsRef.current.get(t.id) ?? null}
                  onSelectionMenu={openExplain}
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
                  kind={t.kind}
                  remoteHostId={t.remoteHostId}
                  remoteBanner={banner}
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
          />
        </main>
      </div>

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

      {hostModal && (
        <RemoteHostModal
          initial={
            hostModal.initial ??
            (hostModal.presetGroupId
              ? ({
                  id: "",
                  name: "",
                  host: "",
                  port: 22,
                  user: "",
                  auth: "key",
                  identityPath: "",
                  savePassword: true,
                  groupId: hostModal.presetGroupId,
                } as HostMeta)
              : null)
          }
          vaultUnlocked={vault.status.unlocked}
          onClose={() => setHostModal(null)}
          onSubmit={handleHostSubmit}
          onRequestUnlock={() => requestVault(vault.status.exists ? "unlock" : "init")}
        />
      )}

      {vaultModal && (
        <MasterPasswordModal
          mode={vaultModal.mode}
          onClose={() => setVaultModal(null)}
          onInit={async (pw) => {
            await vault.init(pw);
            const after = pendingAfterUnlock;
            setPendingAfterUnlock(null);
            if (after) after();
          }}
          onUnlock={async (pw) => {
            await vault.unlock(pw);
            const after = pendingAfterUnlock;
            setPendingAfterUnlock(null);
            if (after) after();
          }}
          onChange={(oldPw, newPw) => vault.changePassword(oldPw, newPw)}
        />
      )}
    </div>
  );
}
