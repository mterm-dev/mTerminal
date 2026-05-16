import {
  Fragment,
  type DragEvent as RDragEvent,
  type PointerEvent as RPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Group, Tab } from "../hooks/useWorkspace";
import type { AgentStatus } from "../hooks/useAgentStatus";
import { InlineEdit } from "./InlineEdit";
import { PluginPanelSlot } from "../extensions/components/PluginPanelSlot";
import {
  getWorkspaceSectionRegistry,
  type WorkspaceSectionEntry,
} from "../extensions/registries/workspace-sections";

function useWorkspaceSections(): WorkspaceSectionEntry[] {
  const reg = getWorkspaceSectionRegistry();
  const [sections, setSections] = useState<WorkspaceSectionEntry[]>(() =>
    reg.list(),
  );
  useEffect(() => {
    return reg.subscribe(() => setSections(reg.list())).dispose;
  }, [reg]);
  return sections;
}

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
  onAddTabContextMenu?: (x: number, y: number, groupId?: string | null) => void;
  onAddFileBrowser?: (groupId: string) => void;
  onAddGroup: (kind?: string) => void;
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
  onReorderGroup: (id: string, beforeId: string | null) => void;
  onOpenSettings: () => void;
  activeGroupId: string | null;
  onSelectGroup: (id: string) => void;
  width: number;
  onResize: (w: number) => void;
  agentStatuses?: Map<number, AgentStatus>;
}

type DropMark =
  | { kind: "before"; beforeId: number; groupId: string | null }
  | { kind: "endOf"; groupId: string | null };

type GroupDropMark =
  | { kind: "before"; beforeId: string }
  | { kind: "end" };

function resolveReorderHoverMark<Item, Id extends string | number, Mark>({
  draggedId,
  target,
  orderedItems,
  clientY,
  targetRect,
  getId,
  makeBeforeMark,
  makeEndMark,
}: {
  draggedId: Id;
  target: Item;
  orderedItems: Item[];
  clientY: number;
  targetRect: Pick<DOMRect, "top" | "height">;
  getId: (item: Item) => Id;
  makeBeforeMark: (item: Item) => Mark;
  makeEndMark: () => Mark;
}): Mark | null {
  const targetId = getId(target);
  const upper = clientY < targetRect.top + targetRect.height / 2;
  if (upper) return targetId === draggedId ? null : makeBeforeMark(target);

  const idx = orderedItems.findIndex((item) => getId(item) === targetId);
  if (idx < 0) return null;

  const next = orderedItems[idx + 1];
  if (!next) return targetId === draggedId ? null : makeEndMark();

  const nextId = getId(next);
  return nextId === draggedId || targetId === draggedId
    ? null
    : makeBeforeMark(next);
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
    onAddTab,
    onAddTabContextMenu,
    onAddFileBrowser,
    onAddGroup,
    onToggleGroup,
    onRenameTab,
    onRenameGroup,
    onTabContextMenu,
    onGroupContextMenu,
    onReorderTab,
    onReorderGroup,
    onOpenSettings,
    activeGroupId,
    onSelectGroup,
    width,
    onResize,
    agentStatuses,
  } = props;

  const onResizeStart = (e: RPointerEvent<HTMLDivElement>) => {
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

  const workspaceSections = useWorkspaceSections();
  const sectionIds = new Set(workspaceSections.map((s) => s.id));
  const localTabs = tabs.filter((t) => !sectionIds.has(t.kind));
  const localGroups = groups.filter((g) => !sectionIds.has(g.kind));

  const [dragTabId, setDragTabId] = useState<number | null>(null);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<DropMark | null>(null);
  const [groupDropMark, setGroupDropMark] = useState<GroupDropMark | null>(
    null,
  );
  const dragTabRef = useRef<number | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const dropMarkRef = useRef<DropMark | null>(null);
  const groupDropMarkRef = useRef<GroupDropMark | null>(null);
  dropMarkRef.current = dropMark;
  groupDropMarkRef.current = groupDropMark;

  const tabIndexMap = new Map<number, number>();
  tabs.forEach((t, i) => tabIndexMap.set(t.id, i));

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
    dragGroupRef.current = null;
    dropMarkRef.current = null;
    groupDropMarkRef.current = null;
    setDragTabId(null);
    setDragGroupId(null);
    setDropMark(null);
    setGroupDropMark(null);
  };

  const setMark = (m: DropMark | null) => {
    dropMarkRef.current = m;
    setDropMark(m);
  };

  const setGroupMark = (m: GroupDropMark | null) => {
    groupDropMarkRef.current = m;
    setGroupDropMark(m);
  };

  const handleTabDragOver = (
    e: RDragEvent,
    t: Tab,
    sectionTabs: Tab[],
  ) => {
    const drag = dragTabRef.current;
    if (drag == null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setMark(
      resolveReorderHoverMark<Tab, number, DropMark>({
        draggedId: drag,
        target: t,
        orderedItems: sectionTabs,
        clientY: e.clientY,
        targetRect: e.currentTarget.getBoundingClientRect(),
        getId: (tab) => tab.id,
        makeBeforeMark: (tab) => ({
          kind: "before",
          beforeId: tab.id,
          groupId: t.groupId,
        }),
        makeEndMark: () => ({ kind: "endOf", groupId: t.groupId }),
      }),
    );
  };

  const handleSectionDragOver = (
    e: RDragEvent,
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

  const handleGroupDragOver = (e: RDragEvent, g: Group) => {
    const drag = dragGroupRef.current;
    if (drag == null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setGroupMark(
      resolveReorderHoverMark<Group, string, GroupDropMark>({
        draggedId: drag,
        target: g,
        orderedItems: groups,
        clientY: e.clientY,
        targetRect: e.currentTarget.getBoundingClientRect(),
        getId: (group) => group.id,
        makeBeforeMark: (group) => ({
          kind: "before",
          beforeId: group.id,
        }),
        makeEndMark: () => ({ kind: "end" }),
      }),
    );
  };

  const commitDrop = (e: RDragEvent) => {
    const drag = dragTabRef.current;
    const mark = dropMarkRef.current;
    const groupDrag = dragGroupRef.current;
    const groupMark = groupDropMarkRef.current;
    e.preventDefault();
    e.stopPropagation();
    if (drag != null && mark) {
      if (mark.kind === "before") {
        onReorderTab(drag, mark.beforeId, mark.groupId);
      } else {
        onReorderTab(drag, null, mark.groupId);
      }
    } else if (groupDrag != null && groupMark) {
      onReorderGroup(
        groupDrag,
        groupMark.kind === "before" ? groupMark.beforeId : null,
      );
    }
    resetDrag();
  };

  const renderTab = (t: Tab, sectionTabs: Tab[]) => {
    const idx = tabIndexMap.get(t.id) ?? 0;
    const active = activeId === t.id;
    const showLineBefore =
      dropMark?.kind === "before" && dropMark.beforeId === t.id;
    const isDragging = dragTabId === t.id;
    const cc = agentStatuses?.get(t.id);
    const ccClass = cc && cc.state !== "idle" ? `cc-tab-${cc.state}` : "";
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
          } ${ccClass}`}
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
          {(() => {
            const cc = agentStatuses?.get(t.id);
            if (!cc || cc.state === "idle") return null;
            const glyph =
              cc.state === "thinking"
                ? "◐"
                : cc.state === "awaitingInput"
                  ? "!"
                  : "✓";
            const title = `${cc.agent ?? "agent"}: ${cc.state}`;
            return (
              <span
                className={`cc-badge cc-${cc.state}`}
                title={title}
                aria-label={title}
              >
                {glyph}
              </span>
            );
          })()}
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

  const renderWorkspaceSection = (opts: {
    kind: string;
    label: string;
    sectionTabs: Tab[];
    sectionGroups: Group[];
    showAddTab: boolean;
    showAddGroup: boolean;
  }) => {
    const { kind, label, sectionTabs, sectionGroups, showAddTab, showAddGroup } = opts;
    const sectionUngrouped = sectionTabs.filter((t) => t.groupId === null);
    const sectionKey = `term-side-section-${kind}`;
    return (
      <Fragment key={sectionKey}>
        <div className="term-side-section term-side-section-row">
          <span>{label}</span>
          <div className="term-side-actions">
            {showAddTab && (
              <button
                className="ghost-btn"
                title="new tab (right-click for profile)"
                onClick={() => onAddTab()}
                onContextMenu={(e) => {
                  if (!onAddTabContextMenu) return;
                  e.preventDefault();
                  onAddTabContextMenu(e.clientX, e.clientY, null);
                }}
              >
                + tab
              </button>
            )}
            {showAddGroup && (
              <button
                className="ghost-btn"
                title="new group"
                onClick={() => onAddGroup(kind)}
              >
                + group
              </button>
            )}
          </div>
        </div>

        <div
          className={`term-side-scroll term-side-scroll-${kind}`}
          role="tablist"
          aria-orientation="vertical"
          onDragOver={(e) => {
            if (dragGroupRef.current != null) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (groupDropMarkRef.current == null) {
                setGroupMark({ kind: "end" });
              }
              return;
            }
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
            } ${sectionUngrouped.length === 0 ? "empty" : ""}`}
            onDragOver={(e) => handleSectionDragOver(e, null, sectionUngrouped)}
            onDrop={commitDrop}
          >
            {sectionUngrouped.map((t) => renderTab(t, sectionUngrouped))}
            {renderEndMarker(null)}
            {sectionUngrouped.length === 0 && (
              <div className="drop-hint">
                {dragTabId != null
                  ? "drop here to ungroup"
                  : kind === "local"
                    ? "ungrouped tabs"
                    : `no ${label} tabs yet`}
              </div>
            )}
          </div>

          {sectionGroups.map((g) => {
            const groupTabs = sectionTabs.filter((t) => t.groupId === g.id);
          const groupAgentCounts = g.collapsed
            ? groupTabs.reduce(
                (acc, t) => {
                  const st = agentStatuses?.get(t.id)?.state;
                  if (st === "thinking") acc.thinking += 1;
                  else if (st === "awaitingInput") acc.awaitingInput += 1;
                  else if (st === "done") acc.done += 1;
                  return acc;
                },
                { thinking: 0, awaitingInput: 0, done: 0 },
              )
            : null;
          const isDropTarget =
            dropMark?.kind === "endOf" && dropMark.groupId === g.id;
          const isActiveGroup = activeGroupId === g.id;
          const isDraggingGroup = dragGroupId === g.id;
          const showGroupLineBefore =
            groupDropMark?.kind === "before" &&
            groupDropMark.beforeId === g.id;
          return (
            <Fragment key={g.id}>
              {showGroupLineBefore && (
                <div
                  className="drop-line group-drop-line"
                  style={{
                    ["--group-accent" as never]: g.accent,
                  }}
                />
              )}
              <div
                data-group-id={g.id}
                className={`term-group ${isDropTarget ? "drop-target" : ""} ${isActiveGroup ? "active" : ""} ${
                  isDraggingGroup ? "dragging" : ""
                }`}
                style={{ ["--group-accent" as never]: g.accent }}
                onDragOver={(e) => handleGroupDragOver(e, g)}
                onDrop={commitDrop}
              >
                <div
                  className="term-group-h"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!g.collapsed}
                  aria-pressed={isActiveGroup}
                  draggable={editingGroupId !== g.id}
                  onDragStart={(e) => {
                    const tag = (e.target as HTMLElement).tagName;
                    if (tag === "INPUT" || tag === "BUTTON") {
                      e.preventDefault();
                      return;
                    }
                    dragGroupRef.current = g.id;
                    setDragGroupId(g.id);
                    setMark(null);
                    setGroupMark(null);
                    e.dataTransfer.effectAllowed = "move";
                    try {
                      e.dataTransfer.setData(
                        "application/x-mterminal-group",
                        g.id,
                      );
                    } catch {}
                  }}
                  onDragEnd={resetDrag}
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
                    if (dragGroupRef.current != null) {
                      handleGroupDragOver(e, g);
                      return;
                    }
                    if (dragTabId == null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    setMark({ kind: "endOf", groupId: g.id });
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
                    className={`chevron ${g.collapsed ? "collapsed" : ""}`}
                    aria-label={g.collapsed ? "expand group" : "collapse group"}
                    onClick={() => onToggleGroup(g.id)}
                    title={g.collapsed ? "expand" : "collapse"}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      aria-hidden="true"
                    >
                      <path
                        d="M2.5 3.5 L5 6 L7.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
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
                  {groupAgentCounts &&
                    (
                      [
                        ["awaitingInput", "!"],
                        ["thinking", "◐"],
                        ["done", "✓"],
                      ] as const
                    )
                      .filter(([k]) => groupAgentCounts[k] > 0)
                      .map(([state, glyph]) => {
                        const n = groupAgentCounts[state];
                        const title = `${n} ${state}`;
                        return (
                          <span
                            key={state}
                            className={`cc-badge cc-${state} cc-group-badge`}
                            title={title}
                            aria-label={title}
                          >
                            {glyph}
                            {n > 1 && (
                              <span className="cc-badge-count">{n}</span>
                            )}
                          </span>
                        );
                      })}
                  <span
                    className="term-group-count"
                    aria-label={`${groupTabs.length} tabs`}
                  >
                    {groupTabs.length}
                  </span>
                  <button
                    className="ghost-btn small"
                    title="new tab in group (right-click for profile)"
                    aria-label="new tab in group"
                    onClick={() => onAddTab(g.id)}
                    onContextMenu={(e) => {
                      if (!onAddTabContextMenu) return;
                      e.preventDefault();
                      onAddTabContextMenu(e.clientX, e.clientY, g.id);
                    }}
                  >
                    +
                  </button>
                  {onAddFileBrowser && (
                    <button
                      className="ghost-btn small"
                      title="open file browser in group"
                      aria-label="open file browser in group"
                      onClick={() => onAddFileBrowser(g.id)}
                    >
                      ⌸
                    </button>
                  )}
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
            </Fragment>
          );
        })}

          {groupDropMark?.kind === "end" && (
            <div
              className="drop-line group-drop-line"
              style={{
                ["--group-accent" as never]: `var(--c-${
                  sectionGroups.find((g) => g.id === dragGroupId)?.accent ?? "orange"
                })`,
              }}
            />
          )}

          {sectionGroups.length === 0 && sectionUngrouped.length > 0 && (
            <div className="term-empty-groups">
              tip — click <span className="kbd">+ group</span> to organize tabs
            </div>
          )}

        </div>
      </Fragment>
    );
  };

  return (
    <aside className="term-side" aria-label="Workspace">
      <div className="term-side-h">
        <span className="name">mTerminal</span>
        <span title={sessionLabel}>{sessionLabel}</span>
      </div>

      {renderWorkspaceSection({
        kind: "local",
        label: "local workspace",
        sectionTabs: localTabs,
        sectionGroups: localGroups,
        showAddTab: true,
        showAddGroup: true,
      })}

      {workspaceSections.map((section) => (
        <div
          key={`workspace-section-${section.id}`}
          className="term-side-extension-section"
          data-section-id={section.id}
        >
          <PluginPanelSlot
            location={`workspace-section.${section.id}` as never}
          />
        </div>
      ))}

      <div
        className="term-side-resize"
        role="separator"
        aria-label="resize sidebar"
        aria-orientation="vertical"
        onPointerDown={onResizeStart}
        onDoubleClick={() => onResize(300)}
        title="drag to resize · double-click to reset"
      />

      {/* Extension-contributed sidebar panels (e.g. the Git Panel extension). */}
      <PluginPanelSlot location="sidebar" />
      <PluginPanelSlot location="sidebar.bottom" />

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
      </div>
    </aside>
  );
}
