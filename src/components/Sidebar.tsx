import type { Group, Tab } from "../hooks/useWorkspace";
import { InlineEdit } from "./InlineEdit";
import { useState } from "react";

interface Props {
  tabs: Tab[];
  groups: Group[];
  activeId: number | null;
  sessionLabel: string;
  editingTabId: number | null;
  editingGroupId: string | null;
  setEditingTabId: (id: number | null) => void;
  setEditingGroupId: (id: string | null) => void;
  onSelectTab: (id: number) => void;
  onAddTabInGroup: (groupId: string) => void;
  onAddGroup: () => void;
  onToggleGroup: (id: string) => void;
  onRenameTab: (id: number, name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onTabContextMenu: (id: number, x: number, y: number) => void;
  onGroupContextMenu: (id: string, x: number, y: number) => void;
  onTabDragStart: (id: number) => void;
  onTabDropOnGroup: (groupId: string) => void;
}

export function Sidebar(props: Props) {
  const {
    tabs,
    groups,
    activeId,
    sessionLabel,
    editingTabId,
    editingGroupId,
    setEditingTabId,
    setEditingGroupId,
    onSelectTab,
    onAddTabInGroup,
    onAddGroup,
    onToggleGroup,
    onRenameTab,
    onRenameGroup,
    onTabContextMenu,
    onGroupContextMenu,
    onTabDragStart,
    onTabDropOnGroup,
  } = props;

  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const tabIndexMap = new Map<number, number>();
  tabs.forEach((t, i) => tabIndexMap.set(t.id, i));

  return (
    <aside className="term-side">
      <div className="term-side-h">
        <span className="name">mTerminal</span>
        <span>{sessionLabel}</span>
      </div>

      <div className="term-side-section term-side-section-row">
        <span>Workspace</span>
        <button className="ghost-btn" title="new group" onClick={onAddGroup}>
          + group
        </button>
      </div>

      <div className="term-side-scroll">
        {groups.map((g) => {
          const groupTabs = tabs.filter((t) => t.groupId === g.id);
          const isDropTarget = dropTarget === g.id;
          return (
            <div
              key={g.id}
              className={`term-group ${isDropTarget ? "drop-target" : ""}`}
              style={{ ["--group-accent" as never]: `var(--c-${g.accent})` }}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(g.id);
              }}
              onDragLeave={() => {
                if (dropTarget === g.id) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                onTabDropOnGroup(g.id);
              }}
            >
              <div
                className="term-group-h"
                onContextMenu={(e) => {
                  e.preventDefault();
                  onGroupContextMenu(g.id, e.clientX, e.clientY);
                }}
              >
                <button
                  className="chevron"
                  onClick={() => onToggleGroup(g.id)}
                  title={g.collapsed ? "expand" : "collapse"}
                >
                  {g.collapsed ? "▸" : "▾"}
                </button>
                <span
                  className="term-group-name"
                  onDoubleClick={() => setEditingGroupId(g.id)}
                >
                  <InlineEdit
                    value={g.name}
                    editing={editingGroupId === g.id}
                    setEditing={(b) => setEditingGroupId(b ? g.id : null)}
                    onCommit={(v) => onRenameGroup(g.id, v)}
                  />
                </span>
                <span className="term-group-count">{groupTabs.length}</span>
                <button
                  className="ghost-btn small"
                  title="new tab in group"
                  onClick={() => onAddTabInGroup(g.id)}
                >
                  +
                </button>
              </div>

              {!g.collapsed &&
                groupTabs.map((t) => {
                  const idx = tabIndexMap.get(t.id) ?? 0;
                  const active = activeId === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`term-tab ${active ? "active" : "idle"}`}
                      draggable={editingTabId !== t.id}
                      onDragStart={() => onTabDragStart(t.id)}
                      onClick={() => onSelectTab(t.id)}
                      onDoubleClick={() => setEditingTabId(t.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        onTabContextMenu(t.id, e.clientX, e.clientY);
                      }}
                    >
                      <span className="dot" />
                      <span className="label-block">
                        <InlineEdit
                          value={t.label}
                          className="label-main"
                          editing={editingTabId === t.id}
                          setEditing={(b) => setEditingTabId(b ? t.id : null)}
                          onCommit={(v) => onRenameTab(t.id, v)}
                        />
                        {t.sub && t.sub !== t.label && (
                          <span className="label-sub">{t.sub}</span>
                        )}
                      </span>
                      <span className="num">{idx + 1}</span>
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className="term-side-foot">
        <div>
          <span className="kbd">1-9</span> switch
        </div>
        <div>
          <span className="kbd">Ctrl+T</span> new tab
        </div>
        <div>
          <span className="kbd">Ctrl+W</span> close
        </div>
        <div>
          <span className="kbd">Ctrl+Shift+G</span> new group
        </div>
        <div>
          <span className="kbd">2× click</span> rename
        </div>
      </div>
    </aside>
  );
}
