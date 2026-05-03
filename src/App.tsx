import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TerminalTab } from "./components/TerminalTab";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { GROUP_ACCENTS, useWorkspace } from "./hooks/useWorkspace";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { useMaximized } from "./hooks/useMaximized";
import { useSettings } from "./settings/useSettings";
import { findTheme } from "./settings/themes";
import { SettingsModal } from "./settings/SettingsModal";

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
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState<{ count: number } | null>(null);
  const [gridGroupId, setGridGroupId] = useState<string | null>(null);

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

  useEffect(() => {
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(theme.cssVars)) {
      root.setProperty(k, v);
    }
    root.setProperty("--ui-font-size", `${settings.uiFontSize}px`);
    document.body.style.fontSize = `${settings.uiFontSize}px`;
  }, [theme, settings.uiFontSize]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--window-opacity",
      String(settings.windowOpacity),
    );
  }, [settings.windowOpacity]);

  useEffect(() => {
    const apply = () => {
      const overflow = Math.max(
        0,
        window.outerHeight - window.screen.availHeight,
      );
      document.documentElement.style.setProperty(
        "--safe-bottom",
        `${overflow}px`,
      );
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const w = wsRef.current;
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
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
          updateRef.current(
            "sidebarCollapsed",
            !settingsRef.current.sidebarCollapsed,
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
      if (e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        w.addGroup();
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ",") {
        e.preventDefault();
        setShowSettings(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const openGroupMenu = (id: string, x: number, y: number) => {
    const items: MenuItem[] = [
      { label: "rename group", onSelect: () => setEditingGroupId(id) },
      { label: "new tab here", onSelect: () => ws.addTab(id) },
      { label: "toggle collapse", onSelect: () => ws.toggleGroup(id) },
      { label: "", onSelect: () => {}, separator: true },
      ...GROUP_ACCENTS.map<MenuItem>((c) => ({
        label: `accent: ${c}`,
        onSelect: () => ws.setGroupAccent(id, c),
      })),
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
          onOpenSettings={() => setShowSettings(true)}
          activeGroupId={gridGroupId}
          onSelectGroup={selectGroup}
        />

        <main className="term-main">
          <div
            className={`term-pane${gridDims ? " grid" : ""}`}
            style={
              gridDims
                ? ({
                    ["--grid-cols" as never]: gridDims.cols,
                    ["--grid-rows" as never]: gridDims.rows,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {ws.tabs.map((t) => (
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
                fontFamily={settings.fontFamily}
                fontSize={settings.fontSize}
                lineHeight={settings.lineHeight}
                cursorStyle={settings.cursorStyle}
                cursorBlink={settings.cursorBlink}
                scrollback={settings.scrollback}
                theme={theme.xterm}
                shell={settings.shellOverride}
                shellArgs={shellArgs}
                copyOnSelect={settings.copyOnSelect}
              />
            ))}
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

      {showSettings && (
        <SettingsModal
          settings={settings}
          update={update}
          reset={reset}
          onClose={() => setShowSettings(false)}
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
    </div>
  );
}

interface ConfirmDialogProps {
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm-dialog">
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="confirm-btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="confirm-btn confirm-btn-primary"
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
