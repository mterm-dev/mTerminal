import { Fragment, useRef, useState } from "react";
import type { HostGroup, HostMeta } from "../hooks/useRemoteHosts";
import { InlineEdit } from "./InlineEdit";

interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
}

function LockIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      {open ? (
        <path d="M8 11V7a4 4 0 0 1 7.5-2" />
      ) : (
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      )}
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M11 13l9-9" />
      <path d="M17 7l3 3" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 8l4 4-4 4" />
      <path d="M12 16h7" />
    </svg>
  );
}

interface Props {
  hosts: HostMeta[];
  groups: HostGroup[];
  vault: VaultStatus;
  onAddHost: (groupId?: string | null) => void;
  onConnect: (host: HostMeta) => void;
  onLockClick: () => void;
  onHostContextMenu: (host: HostMeta, x: number, y: number) => void;
  onGroupContextMenu: (group: HostGroup, x: number, y: number) => void;
  onAddGroup: () => void;
  onToggleGroup: (id: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onSetHostGroup: (hostId: string, groupId: string | null) => void;
  editingGroupId: string | null;
  setEditingGroupId: (id: string | null) => void;
}

type DropMark =
  | { kind: "into"; groupId: string | null }
  | null;

export function RemoteWorkspace({
  hosts,
  groups,
  vault,
  onAddHost,
  onConnect,
  onLockClick,
  onHostContextMenu,
  onGroupContextMenu,
  onAddGroup,
  onToggleGroup,
  onRenameGroup,
  onSetHostGroup,
  editingGroupId,
  setEditingGroupId,
}: Props) {
  const [dragHostId, setDragHostId] = useState<string | null>(null);
  const dragHostRef = useRef<string | null>(null);
  const [dropMark, setDropMark] = useState<DropMark>(null);

  const ungrouped = hosts.filter((h) => !h.groupId);

  const resetDrag = () => {
    dragHostRef.current = null;
    setDragHostId(null);
    setDropMark(null);
  };

  const onSectionDragOver = (
    e: React.DragEvent,
    groupId: string | null,
  ) => {
    if (!dragHostRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropMark({ kind: "into", groupId });
  };

  const commitDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dragId = dragHostRef.current;
    const mark = dropMark;
    if (dragId && mark && mark.kind === "into") {
      const cur = hosts.find((h) => h.id === dragId);
      const curGroup = cur?.groupId ?? null;
      if (curGroup !== mark.groupId) {
        onSetHostGroup(dragId, mark.groupId);
      }
    }
    resetDrag();
  };

  const renderHost = (h: HostMeta) => {
    const lockable = h.auth === "password" && h.savePassword;
    const isDragging = dragHostId === h.id;
    return (
      <div
        key={h.id}
        role="button"
        tabIndex={0}
        className={`remote-host ${isDragging ? "dragging" : ""}`}
        draggable
        onDragStart={(e) => {
          dragHostRef.current = h.id;
          setDragHostId(h.id);
          e.dataTransfer.effectAllowed = "move";
          try {
            e.dataTransfer.setData("text/plain", h.id);
          } catch {}
        }}
        onDragEnd={resetDrag}
        onClick={() => onConnect(h)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onConnect(h);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onHostContextMenu(h, e.clientX, e.clientY);
        }}
        title={`${h.user}@${h.host}:${h.port} (${h.auth}${lockable ? ", saved pw" : ""})`}
      >
        <span className="remote-host-icon" aria-hidden="true">
          {h.auth === "key" ? (
            <KeyIcon />
          ) : h.auth === "password" ? (
            <LockIcon open={false} />
          ) : (
            <TerminalIcon />
          )}
        </span>
        <span className="remote-host-label">
          <span className="remote-host-name">
            {h.name || `${h.user}@${h.host}`}
          </span>
          <span className="remote-host-sub">
            {h.user}@{h.host}
            {h.port !== 22 ? `:${h.port}` : ""}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="remote-workspace">
      <div className="term-side-section term-side-section-row">
        <span>remote workspace</span>
        <div className="term-side-actions">
          <button
            className="ghost-btn vault-lock-btn"
            title={
              !vault.exists
                ? "create master password to start"
                : vault.unlocked
                  ? "lock vault"
                  : "unlock vault"
            }
            onClick={onLockClick}
            aria-label={vault.unlocked ? "lock vault" : "unlock vault"}
          >
            <LockIcon open={vault.unlocked} />
          </button>
          <button className="ghost-btn" title="new host" onClick={() => onAddHost()}>
            + host
          </button>
          <button className="ghost-btn" title="new group" onClick={onAddGroup}>
            + group
          </button>
        </div>
      </div>

      <div
        className={`term-ungrouped ${
          dropMark?.kind === "into" && dropMark.groupId === null
            ? "drop-target"
            : ""
        } ${ungrouped.length === 0 ? "empty" : ""}`}
        onDragOver={(e) => onSectionDragOver(e, null)}
        onDrop={commitDrop}
      >
        {ungrouped.map(renderHost)}
        {ungrouped.length === 0 && (
          <div className="drop-hint">
            {dragHostId
              ? "drop here to ungroup"
              : groups.length === 0
                ? "no hosts — click + host to add"
                : "no ungrouped hosts"}
          </div>
        )}
      </div>

      {groups.map((g) => {
        const groupHosts = hosts.filter((h) => h.groupId === g.id);
        const isDropTarget =
          dropMark?.kind === "into" && dropMark.groupId === g.id;
        return (
          <Fragment key={g.id}>
            <div
              className={`term-group ${isDropTarget ? "drop-target" : ""}`}
              style={{ ["--group-accent" as never]: g.accent }}
            >
              <div
                className="term-group-h"
                onContextMenu={(e) => {
                  e.preventDefault();
                  onGroupContextMenu(g, e.clientX, e.clientY);
                }}
                onDragOver={(e) => onSectionDragOver(e, g.id)}
                onDrop={commitDrop}
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
                  aria-label={`${groupHosts.length} hosts`}
                >
                  {groupHosts.length}
                </span>
                <button
                  className="ghost-btn small"
                  title="new host in group"
                  aria-label="new host in group"
                  onClick={() => onAddHost(g.id)}
                >
                  +
                </button>
              </div>

              {!g.collapsed && (
                <div
                  className="term-group-body"
                  onDragOver={(e) => onSectionDragOver(e, g.id)}
                  onDrop={commitDrop}
                >
                  {groupHosts.map(renderHost)}
                  {groupHosts.length === 0 && (
                    <div className="drop-hint">
                      {dragHostId ? "drop here" : "empty group"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Fragment>
        );
      })}

    </div>
  );
}
