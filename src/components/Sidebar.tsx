import { Fragment, type ReactNode, useRef, useState } from "react";
import type { Group, Tab } from "../hooks/useWorkspace";
import { InlineEdit } from "./InlineEdit";

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
  onAddTab: (groupId?: string | null) => void;
  onAddGroup: () => void;
  onToggleGroup: (id: string) => void;
  onRenameTab: (id: number, name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onTabContextMenu: (id: number, x: number, y: number) => void;
  onGroupContextMenu: (id: string, x: number, y: number) => void;
  onReorderTab: (
    id: number,
    beforeId: number | null,
    groupId: string | null,
  ) => void;
  onOpenSettings: () => void;
  activeGroupId: string | null;
  onSelectGroup: (id: string) => void;
  remoteSlot?: ReactNode;
  width: number;
  onResize: (w: number) => void;
}

type DropMark =
  | { kind: "before"; beforeId: number; groupId: string | null }
  | { kind: "endOf"; groupId: string | null };

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
    onAddTab,
    onAddGroup,
    onToggleGroup,
    onRenameTab,
    onRenameGroup,
    onTabContextMenu,
    onGroupContextMenu,
    onReorderTab,
    onOpenSettings,
    activeGroupId,
    onSelectGroup,
    remoteSlot,
    width,
    onResize,
  } = props;

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const next = Math.max(200, Math.min(600, startW + (ev.clientX - startX)));
      onResize(next);
    };
    const up = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("resizing-sidebar");
    };
    document.body.classList.add("resizing-sidebar");
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  const localTabs = tabs.filter((t) => t.kind !== "remote");
  const remoteTabs = tabs.filter((t) => t.kind === "remote");

  const [dragTabId, setDragTabId] = useState<number | null>(null);
  const [dropMark, setDropMark] = useState<DropMark | null>(null);
  const dragTabRef = useRef<number | null>(null);
  const dropMarkRef = useRef<DropMark | null>(null);
  dropMarkRef.current = dropMark;

  const tabIndexMap = new Map<number, number>();
  tabs.forEach((t, i) => tabIndexMap.set(t.id, i));

  const ungroupedTabs = localTabs.filter((t) => t.groupId === null);

  const focusTabByOffset = (currentId: number, offset: number) => {
    const idx = tabs.findIndex((t) => t.id === currentId);
    if (idx < 0) return;
    const next = tabs[idx + offset];
    if (!next) return;
    onSelectTab(next.id);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-tab-id="${next.id}"]`,
      );
      el?.focus();
    });
  };

  const resetDrag = () => {
    dragTabRef.current = null;
    dropMarkRef.current = null;
    setDragTabId(null);
    setDropMark(null);
  };

  const setMark = (m: DropMark | null) => {
    dropMarkRef.current = m;
    setDropMark(m);
  };

  const handleTabDragOver = (
    e: React.DragEvent,
    t: Tab,
    sectionTabs: Tab[],
  ) => {
    const drag = dragTabRef.current;
    if (drag == null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const upper = e.clientY < rect.top + rect.height / 2;
    if (upper) {
      if (t.id === drag) {
        setMark(null);
        return;
      }
      setMark({ kind: "before", beforeId: t.id, groupId: t.groupId });
    } else {
      const idx = sectionTabs.findIndex((x) => x.id === t.id);
      const next = sectionTabs[idx + 1];
      if (next) {
        if (next.id === drag || t.id === drag) {
          setMark(null);
          return;
        }
        setMark({
          kind: "before",
          beforeId: next.id,
          groupId: t.groupId,
        });
      } else {
        if (t.id === drag) {
          setMark(null);
          return;
        }
        setMark({ kind: "endOf", groupId: t.groupId });
      }
    }
  };

  const handleSectionDragOver = (
    e: React.DragEvent,
    groupId: string | null,
    sectionTabs: Tab[],
  ) => {
    if (dragTabRef.current == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (sectionTabs.length === 0) {
      setMark({ kind: "endOf", groupId });
    }
  };

  const commitDrop = (e: React.DragEvent) => {
    const drag = dragTabRef.current;
    const mark = dropMarkRef.current;
    e.preventDefault();
    e.stopPropagation();
    if (drag != null && mark) {
      if (mark.kind === "before") {
        onReorderTab(drag, mark.beforeId, mark.groupId);
      } else {
        onReorderTab(drag, null, mark.groupId);
      }
    }
    resetDrag();
  };

  const renderTab = (t: Tab, sectionTabs: Tab[]) => {
    const idx = tabIndexMap.get(t.id) ?? 0;
    const active = activeId === t.id;
    const showLineBefore =
      dropMark?.kind === "before" && dropMark.beforeId === t.id;
    const isDragging = dragTabId === t.id;
    return (
      <Fragment key={t.id}>
        {showLineBefore && <div className="drop-line" />}
        <div
          data-tab-id={t.id}
          role="tab"
          tabIndex={active ? 0 : -1}
          aria-selected={active}
          className={`term-tab ${active ? "active" : "idle"} ${
            isDragging ? "dragging" : ""
          }`}
          draggable={editingTabId !== t.id}
          onDragStart={(e) => {
            dragTabRef.current = t.id;
            setDragTabId(t.id);
            e.dataTransfer.effectAllowed = "move";
            try {
              e.dataTransfer.setData("text/plain", String(t.id));
            } catch {}
          }}
          onDragEnd={resetDrag}
          onDragOver={(e) => handleTabDragOver(e, t, sectionTabs)}
          onDrop={commitDrop}
          onClick={() => onSelectTab(t.id)}
          onDoubleClick={() => setEditingTabId(t.id)}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === "INPUT") return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectTab(t.id);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              focusTabByOffset(t.id, 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              focusTabByOffset(t.id, -1);
            } else if (e.key === "F2") {
              e.preventDefault();
              setEditingTabId(t.id);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onTabContextMenu(t.id, e.clientX, e.clientY);
          }}
        >
          <span className="dot" aria-hidden="true" />
          <span className="label-block">
            <InlineEdit
              value={t.label}
              className="label-main"
              editing={editingTabId === t.id}
              setEditing={(b) => setEditingTabId(b ? t.id : null)}
              onCommit={(v) => onRenameTab(t.id, v)}
            />
            {t.sub && t.sub !== t.label && (
              <span className="label-sub" title={t.sub}>
                {t.sub}
              </span>
            )}
          </span>
          <span className="num" aria-hidden="true">
            {idx + 1}
          </span>
        </div>
      </Fragment>
    );
  };

  const renderEndMarker = (groupId: string | null) =>
    dropMark?.kind === "endOf" && dropMark.groupId === groupId ? (
      <div className="drop-line" />
    ) : null;

  return (
    <aside className="term-side" aria-label="Workspace">
      <div className="term-side-h">
        <span className="name">mTerminal</span>
        <span title={sessionLabel}>{sessionLabel}</span>
      </div>

      <div className="term-side-section term-side-section-row">
        <span>local workspace</span>
        <div className="term-side-actions">
          <button
            className="ghost-btn"
            title="new tab"
            onClick={() => onAddTab()}
          >
            + tab
          </button>
          <button className="ghost-btn" title="new group" onClick={onAddGroup}>
            + group
          </button>
        </div>
      </div>

      <div
        className="term-side-scroll"
        role="tablist"
        aria-orientation="vertical"
        onDragOver={(e) => {
          if (dragTabRef.current == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dropMarkRef.current == null) {
            setMark({ kind: "endOf", groupId: null });
          }
        }}
        onDrop={commitDrop}
      >
        <div
          className={`term-ungrouped ${
            dropMark?.kind === "endOf" && dropMark.groupId === null
              ? "drop-target"
              : ""
          } ${ungroupedTabs.length === 0 ? "empty" : ""}`}
          onDragOver={(e) => handleSectionDragOver(e, null, ungroupedTabs)}
          onDrop={commitDrop}
        >
          {ungroupedTabs.map((t) => renderTab(t, ungroupedTabs))}
          {renderEndMarker(null)}
          {ungroupedTabs.length === 0 && (
            <div className="drop-hint">
              {dragTabId != null
                ? "drop here to ungroup"
                : "ungrouped tabs"}
            </div>
          )}
        </div>

        {groups.map((g) => {
          const groupTabs = tabs.filter((t) => t.groupId === g.id);
          const isDropTarget =
            dropMark?.kind === "endOf" && dropMark.groupId === g.id;
          const isActiveGroup = activeGroupId === g.id;
          return (
            <div
              key={g.id}
              className={`term-group ${isDropTarget ? "drop-target" : ""} ${isActiveGroup ? "active" : ""}`}
              style={{ ["--group-accent" as never]: `var(--c-${g.accent})` }}
            >
              <div
                className="term-group-h"
                role="button"
                tabIndex={0}
                aria-expanded={!g.collapsed}
                aria-pressed={isActiveGroup}
                onClick={(e) => {
                  const tag = (e.target as HTMLElement).tagName;
                  if (tag === "INPUT" || tag === "BUTTON") return;
                  if (editingGroupId === g.id) return;
                  onSelectGroup(g.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onGroupContextMenu(g.id, e.clientX, e.clientY);
                }}
                onDragOver={(e) => {
                  if (dragTabId == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setDropMark({ kind: "endOf", groupId: g.id });
                }}
                onDrop={commitDrop}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    e.preventDefault();
                    onSelectGroup(g.id);
                  }
                }}
              >
                <button
                  className="chevron"
                  aria-label={g.collapsed ? "expand group" : "collapse group"}
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
                <span
                  className="term-group-count"
                  aria-label={`${groupTabs.length} tabs`}
                >
                  {groupTabs.length}
                </span>
                <button
                  className="ghost-btn small"
                  title="new tab in group"
                  aria-label="new tab in group"
                  onClick={() => onAddTab(g.id)}
                >
                  +
                </button>
              </div>

              {!g.collapsed && (
                <div
                  className="term-group-body"
                  onDragOver={(e) =>
                    handleSectionDragOver(e, g.id, groupTabs)
                  }
                  onDrop={commitDrop}
                >
                  {groupTabs.map((t) => renderTab(t, groupTabs))}
                  {renderEndMarker(g.id)}
                  {groupTabs.length === 0 && (
                    <div className="drop-hint">
                      {dragTabId != null ? "drop here" : "empty group"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {groups.length === 0 && ungroupedTabs.length > 0 && (
          <div className="term-empty-groups">
            tip — click <span className="kbd">+ group</span> to organize tabs
          </div>
        )}

        {remoteSlot}

        {remoteTabs.length > 0 && (
          <div className="term-remote-tabs">
            <div className="term-side-section term-side-section-row term-side-subsection">
              <span>remote sessions</span>
            </div>
            {remoteTabs.map((t) => renderTab(t, remoteTabs))}
          </div>
        )}
      </div>

      <div
        className="term-side-resize"
        role="separator"
        aria-label="resize sidebar"
        aria-orientation="vertical"
        onPointerDown={onResizeStart}
        onDoubleClick={() => onResize(300)}
        title="drag to resize · double-click to reset"
      />

      <div className="term-side-foot">
        <button className="settings-btn" onClick={onOpenSettings}>
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span>Settings</span>
          <span className="kbd" style={{ marginLeft: "auto", marginRight: 0 }}>
            Ctrl+,
          </span>
        </button>
        <div className="term-side-foot-keys">
          <div><span className="kbd">1-9</span> switch</div>
          <div><span className="kbd">Ctrl+T</span> new tab</div>
          <div><span className="kbd">Ctrl+W</span> close</div>
          <div><span className="kbd">Ctrl+B</span> sidebar</div>
          <div><span className="kbd">Ctrl+Shift+G</span> new group</div>
        </div>
      </div>
    </aside>
  );
}
