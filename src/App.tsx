import { useEffect, useMemo, useRef, useState } from "react";
import { Titlebar } from "./components/Titlebar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { TerminalTab } from "./components/TerminalTab";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { GROUP_ACCENTS, useWorkspace } from "./hooks/useWorkspace";
import { useSystemInfo } from "./hooks/useSystemInfo";
import { useMaximized } from "./hooks/useMaximized";

interface CtxState {
  x: number;
  y: number;
  items: MenuItem[];
}

export default function App() {
  const ws = useWorkspace();
  const sys = useSystemInfo();
  const maximized = useMaximized();
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const dragTabRef = useRef<number | null>(null);

  useEffect(() => {
    (window as unknown as { __MT_HOME?: string }).__MT_HOME = `/home/${sys.user}`;
  }, [sys.user]);

  const activeTab = useMemo(
    () => ws.tabs.find((t) => t.id === ws.activeId) ?? null,
    [ws.tabs, ws.activeId],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        if (e.key === "t" || e.key === "T") {
          e.preventDefault();
          ws.addTab();
          return;
        }
        if (e.key === "w" || e.key === "W") {
          if (ws.activeId != null) {
            e.preventDefault();
            ws.closeTab(ws.activeId);
          }
          return;
        }
        if (e.key >= "1" && e.key <= "9") {
          const idx = Number(e.key) - 1;
          e.preventDefault();
          ws.selectIndex(idx);
          return;
        }
      }
      if (e.ctrlKey && e.shiftKey && (e.key === "G" || e.key === "g")) {
        e.preventDefault();
        ws.addGroup();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws]);

  const openTabMenu = (id: number, x: number, y: number) => {
    const tab = ws.tabs.find((t) => t.id === id);
    if (!tab) return;
    const otherGroups = ws.groups.filter((g) => g.id !== tab.groupId);
    const items: MenuItem[] = [
      { label: "rename", onSelect: () => setEditingTabId(id) },
      ...(otherGroups.length
        ? [{ label: "", onSelect: () => {}, separator: true } as MenuItem]
        : []),
      ...otherGroups.map<MenuItem>((g) => ({
        label: `move to → ${g.name}`,
        onSelect: () => ws.moveTab(id, g.id),
      })),
      { label: "", onSelect: () => {}, separator: true },
      { label: "close tab", onSelect: () => ws.closeTab(id), danger: true },
    ];
    setCtx({ x, y, items });
  };

  const openGroupMenu = (id: string, x: number, y: number) => {
    const canDelete = ws.groups.length > 1;
    const items: MenuItem[] = [
      { label: "rename group", onSelect: () => setEditingGroupId(id) },
      { label: "new tab here", onSelect: () => ws.addTab(id) },
      { label: "toggle collapse", onSelect: () => ws.toggleGroup(id) },
      { label: "", onSelect: () => {}, separator: true },
      ...GROUP_ACCENTS.map<MenuItem>((c) => ({
        label: `accent: ${c}`,
        onSelect: () => ws.setGroupAccent(id, c),
      })),
      ...(canDelete
        ? [
            { label: "", onSelect: () => {}, separator: true } as MenuItem,
            {
              label: "delete group",
              onSelect: () => ws.deleteGroup(id),
              danger: true,
            } as MenuItem,
          ]
        : []),
    ];
    setCtx({ x, y, items });
  };

  const labelLower = (activeTab?.label ?? "shell").toLowerCase();
  const titleSize = `${ws.tabs.length} tab${ws.tabs.length === 1 ? "" : "s"}`;

  return (
    <div className={`term-shell ${maximized ? "maximized" : ""}`}>
      <Titlebar title={`mTerminal — ${labelLower} — ${titleSize}`} />

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
          onSelectTab={ws.setActive}
          onAddTabInGroup={(g) => ws.addTab(g)}
          onAddGroup={() => ws.addGroup()}
          onToggleGroup={ws.toggleGroup}
          onRenameTab={ws.renameTab}
          onRenameGroup={ws.renameGroup}
          onTabContextMenu={openTabMenu}
          onGroupContextMenu={openGroupMenu}
          onTabDragStart={(id) => {
            dragTabRef.current = id;
          }}
          onTabDropOnGroup={(gid) => {
            const id = dragTabRef.current;
            if (id != null) ws.moveTab(id, gid);
            dragTabRef.current = null;
          }}
        />

        <main className="term-main">
          <div className="term-pane">
            {ws.tabs.map((t) => (
              <TerminalTab
                key={t.id}
                tabId={t.id}
                active={t.id === ws.activeId}
                onExit={(id) => ws.closeTab(id)}
                onInfo={ws.updateTabInfo}
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
    </div>
  );
}

