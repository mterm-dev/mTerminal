import React, {
  Fragment,
  type DragEvent as RDragEvent,
  useRef,
  useState,
} from 'react'
import type { HostGroup, HostMeta } from '../shared/types'
import { InlineEdit } from './InlineEdit'

interface Props {
  hosts: HostMeta[]
  groups: HostGroup[]
  loading: boolean
  activeHostId: string | null
  editingHostId: string | null
  editingGroupId: string | null
  setEditingHostId: (id: string | null) => void
  setEditingGroupId: (id: string | null) => void
  onConnect(host: HostMeta): void
  onAddHost(groupId?: string | null): void
  onAddGroup(): void
  onToggleGroup(group: HostGroup): void
  onRenameHost(host: HostMeta, name: string): void
  onRenameGroup(group: HostGroup, name: string): void
  onHostContextMenu(host: HostMeta, x: number, y: number): void
  onGroupContextMenu(group: HostGroup, x: number, y: number): void
  onReorderHost(
    hostId: string,
    beforeHostId: string | null,
    groupId: string | null,
  ): void
  onReorderGroup(groupId: string, beforeGroupId: string | null): void
}

type DropMark =
  | { kind: 'before'; beforeId: string; groupId: string | null }
  | { kind: 'endOf'; groupId: string | null }

type GroupDropMark =
  | { kind: 'before'; beforeId: string }
  | { kind: 'end' }

function resolveReorderHoverMark<Item, Id extends string, Mark>({
  draggedId,
  target,
  orderedItems,
  clientY,
  targetRect,
  getId,
  makeBeforeMark,
  makeEndMark,
}: {
  draggedId: Id
  target: Item
  orderedItems: Item[]
  clientY: number
  targetRect: Pick<DOMRect, 'top' | 'height'>
  getId: (item: Item) => Id
  makeBeforeMark: (item: Item) => Mark
  makeEndMark: () => Mark
}): Mark | null {
  const targetId = getId(target)
  const upper = clientY < targetRect.top + targetRect.height / 2
  if (upper) return targetId === draggedId ? null : makeBeforeMark(target)

  const idx = orderedItems.findIndex((item) => getId(item) === targetId)
  if (idx < 0) return null

  const next = orderedItems[idx + 1]
  if (!next) return targetId === draggedId ? null : makeEndMark()

  const nextId = getId(next)
  return nextId === draggedId || targetId === draggedId
    ? null
    : makeBeforeMark(next)
}

function authBadge(auth: string): string {
  if (auth === 'key') return 'k'
  if (auth === 'password') return 'p'
  return 'a'
}

export function RemoteSshPanel(props: Props): React.JSX.Element {
  const {
    hosts,
    groups,
    loading,
    activeHostId,
    editingHostId,
    editingGroupId,
    setEditingHostId,
    setEditingGroupId,
    onConnect,
    onAddHost,
    onAddGroup,
    onToggleGroup,
    onRenameHost,
    onRenameGroup,
    onHostContextMenu,
    onGroupContextMenu,
    onReorderHost,
    onReorderGroup,
  } = props

  const [dragHostId, setDragHostId] = useState<string | null>(null)
  const [dragGroupId, setDragGroupId] = useState<string | null>(null)
  const [dropMark, setDropMark] = useState<DropMark | null>(null)
  const [groupDropMark, setGroupDropMark] = useState<GroupDropMark | null>(null)
  const dragHostRef = useRef<string | null>(null)
  const dragGroupRef = useRef<string | null>(null)
  const dropMarkRef = useRef<DropMark | null>(null)
  const groupDropMarkRef = useRef<GroupDropMark | null>(null)
  dropMarkRef.current = dropMark
  groupDropMarkRef.current = groupDropMark

  const ungroupedHosts = hosts.filter((h) => !h.groupId)

  const focusHostByOffset = (currentId: string, offset: number): void => {
    const idx = hosts.findIndex((h) => h.id === currentId)
    if (idx < 0) return
    const next = hosts[idx + offset]
    if (!next) return
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-host-id="${next.id}"]`,
      )
      el?.focus()
    })
  }

  const resetDrag = (): void => {
    dragHostRef.current = null
    dragGroupRef.current = null
    dropMarkRef.current = null
    groupDropMarkRef.current = null
    setDragHostId(null)
    setDragGroupId(null)
    setDropMark(null)
    setGroupDropMark(null)
  }

  const setMark = (m: DropMark | null): void => {
    dropMarkRef.current = m
    setDropMark(m)
  }

  const setGroupMark = (m: GroupDropMark | null): void => {
    groupDropMarkRef.current = m
    setGroupDropMark(m)
  }

  const handleHostDragOver = (
    e: RDragEvent,
    h: HostMeta,
    sectionHosts: HostMeta[],
  ): void => {
    const drag = dragHostRef.current
    if (drag == null) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setMark(
      resolveReorderHoverMark<HostMeta, string, DropMark>({
        draggedId: drag,
        target: h,
        orderedItems: sectionHosts,
        clientY: e.clientY,
        targetRect: e.currentTarget.getBoundingClientRect(),
        getId: (host) => host.id,
        makeBeforeMark: (host) => ({
          kind: 'before',
          beforeId: host.id,
          groupId: h.groupId ?? null,
        }),
        makeEndMark: () => ({ kind: 'endOf', groupId: h.groupId ?? null }),
      }),
    )
  }

  const handleSectionDragOver = (
    e: RDragEvent,
    groupId: string | null,
    sectionHosts: HostMeta[],
  ): void => {
    if (dragHostRef.current == null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (sectionHosts.length === 0) {
      setMark({ kind: 'endOf', groupId })
    }
  }

  const handleGroupDragOver = (e: RDragEvent, g: HostGroup): void => {
    const drag = dragGroupRef.current
    if (drag == null) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setGroupMark(
      resolveReorderHoverMark<HostGroup, string, GroupDropMark>({
        draggedId: drag,
        target: g,
        orderedItems: groups,
        clientY: e.clientY,
        targetRect: e.currentTarget.getBoundingClientRect(),
        getId: (group) => group.id,
        makeBeforeMark: (group) => ({ kind: 'before', beforeId: group.id }),
        makeEndMark: () => ({ kind: 'end' }),
      }),
    )
  }

  const commitDrop = (e: RDragEvent): void => {
    const drag = dragHostRef.current
    const mark = dropMarkRef.current
    const groupDrag = dragGroupRef.current
    const groupMark = groupDropMarkRef.current
    e.preventDefault()
    e.stopPropagation()
    if (drag != null && mark) {
      if (mark.kind === 'before') {
        onReorderHost(drag, mark.beforeId, mark.groupId)
      } else {
        onReorderHost(drag, null, mark.groupId)
      }
    } else if (groupDrag != null && groupMark) {
      onReorderGroup(
        groupDrag,
        groupMark.kind === 'before' ? groupMark.beforeId : null,
      )
    }
    resetDrag()
  }

  const renderHost = (h: HostMeta, sectionHosts: HostMeta[]): React.JSX.Element => {
    const active = activeHostId === h.id
    const showLineBefore =
      dropMark?.kind === 'before' && dropMark.beforeId === h.id
    const isDragging = dragHostId === h.id
    const label = h.name?.trim() || `${h.user}@${h.host}`
    const sub = `${h.user}@${h.host}${h.port !== 22 ? `:${h.port}` : ''}`
    return (
      <Fragment key={h.id}>
        {showLineBefore && <div className="drop-line" />}
        <div
          data-host-id={h.id}
          role="tab"
          tabIndex={active ? 0 : -1}
          aria-selected={active}
          className={`term-tab ${active ? 'active' : 'idle'} ${
            isDragging ? 'dragging' : ''
          }`}
          draggable={editingHostId !== h.id}
          onDragStart={(e) => {
            dragHostRef.current = h.id
            setDragHostId(h.id)
            e.dataTransfer.effectAllowed = 'move'
            try {
              e.dataTransfer.setData('text/plain', h.id)
            } catch {
              // ignore
            }
          }}
          onDragEnd={resetDrag}
          onDragOver={(e) => handleHostDragOver(e, h, sectionHosts)}
          onDrop={commitDrop}
          onClick={() => onConnect(h)}
          onDoubleClick={() => setEditingHostId(h.id)}
          onKeyDown={(e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onConnect(h)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              focusHostByOffset(h.id, 1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              focusHostByOffset(h.id, -1)
            } else if (e.key === 'F2') {
              e.preventDefault()
              setEditingHostId(h.id)
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            onHostContextMenu(h, e.clientX, e.clientY)
          }}
          title={`${sub} (${h.auth})`}
        >
          <span className="dot" aria-hidden="true" />
          <span className="label-block">
            <InlineEdit
              value={label}
              className="label-main"
              editing={editingHostId === h.id}
              setEditing={(b) => setEditingHostId(b ? h.id : null)}
              onCommit={(v) => onRenameHost(h, v)}
            />
            {sub && sub !== label && (
              <span className="label-sub" title={sub}>
                {sub}
              </span>
            )}
          </span>
          <span className="num" aria-hidden="true" title={`auth: ${h.auth}`}>
            {authBadge(h.auth)}
          </span>
        </div>
      </Fragment>
    )
  }

  const renderEndMarker = (groupId: string | null): React.JSX.Element | null =>
    dropMark?.kind === 'endOf' && dropMark.groupId === groupId ? (
      <div className="drop-line" />
    ) : null

  return (
    <div className="term-side-embedded" aria-label="Remote workspace">
      <div className="term-side-section term-side-section-row">
        <span>remote workspace</span>
        <div className="term-side-actions">
          <button
            className="ghost-btn"
            title="new host"
            onClick={() => onAddHost(null)}
          >
            + host
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
          if (dragGroupRef.current != null) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (groupDropMarkRef.current == null) {
              setGroupMark({ kind: 'end' })
            }
            return
          }
          if (dragHostRef.current == null) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dropMarkRef.current == null) {
            setMark({ kind: 'endOf', groupId: null })
          }
        }}
        onDrop={commitDrop}
      >
        <div
          className={`term-ungrouped ${
            dropMark?.kind === 'endOf' && dropMark.groupId === null
              ? 'drop-target'
              : ''
          } ${ungroupedHosts.length === 0 ? 'empty' : ''}`}
          onDragOver={(e) => handleSectionDragOver(e, null, ungroupedHosts)}
          onDrop={commitDrop}
        >
          {ungroupedHosts.map((h) => renderHost(h, ungroupedHosts))}
          {renderEndMarker(null)}
          {ungroupedHosts.length === 0 && (
            <div className="drop-hint">
              {dragHostId != null
                ? 'drop here to ungroup'
                : loading
                  ? 'loading…'
                  : groups.length === 0
                    ? 'no hosts — click + host to add'
                    : 'no ungrouped hosts'}
            </div>
          )}
        </div>

        {groups.map((g) => {
          const groupHosts = hosts.filter((h) => h.groupId === g.id)
          const isDropTarget =
            dropMark?.kind === 'endOf' && dropMark.groupId === g.id
          const isDraggingGroup = dragGroupId === g.id
          const showGroupLineBefore =
            groupDropMark?.kind === 'before' &&
            groupDropMark.beforeId === g.id
          return (
            <Fragment key={g.id}>
              {showGroupLineBefore && (
                <div
                  className="drop-line group-drop-line"
                  style={{ ['--group-accent' as never]: g.accent }}
                />
              )}
              <div
                data-group-id={g.id}
                className={`term-group ${isDropTarget ? 'drop-target' : ''} ${
                  isDraggingGroup ? 'dragging' : ''
                }`}
                style={{ ['--group-accent' as never]: g.accent }}
                onDragOver={(e) => handleGroupDragOver(e, g)}
                onDrop={commitDrop}
              >
                <div
                  className="term-group-h"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!g.collapsed}
                  draggable={editingGroupId !== g.id}
                  onDragStart={(e) => {
                    const tag = (e.target as HTMLElement).tagName
                    if (tag === 'INPUT' || tag === 'BUTTON') {
                      e.preventDefault()
                      return
                    }
                    dragGroupRef.current = g.id
                    setDragGroupId(g.id)
                    setMark(null)
                    setGroupMark(null)
                    e.dataTransfer.effectAllowed = 'move'
                    try {
                      e.dataTransfer.setData(
                        'application/x-mterminal-remote-group',
                        g.id,
                      )
                    } catch {
                      // ignore
                    }
                  }}
                  onDragEnd={resetDrag}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onGroupContextMenu(g, e.clientX, e.clientY)
                  }}
                  onDragOver={(e) => {
                    if (dragGroupRef.current != null) {
                      handleGroupDragOver(e, g)
                      return
                    }
                    if (dragHostId == null) return
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    setMark({ kind: 'endOf', groupId: g.id })
                  }}
                  onDrop={commitDrop}
                >
                  <button
                    className={`chevron ${g.collapsed ? 'collapsed' : ''}`}
                    aria-label={g.collapsed ? 'expand group' : 'collapse group'}
                    onClick={() => onToggleGroup(g)}
                    title={g.collapsed ? 'expand' : 'collapse'}
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
                      onCommit={(v) => onRenameGroup(g, v)}
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
                    onDragOver={(e) =>
                      handleSectionDragOver(e, g.id, groupHosts)
                    }
                    onDrop={commitDrop}
                  >
                    {groupHosts.map((h) => renderHost(h, groupHosts))}
                    {renderEndMarker(g.id)}
                    {groupHosts.length === 0 && (
                      <div className="drop-hint">
                        {dragHostId != null ? 'drop here' : 'empty group'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          )
        })}

        {groupDropMark?.kind === 'end' && (
          <div
            className="drop-line group-drop-line"
            style={{
              ['--group-accent' as never]:
                groups.find((g) => g.id === dragGroupId)?.accent ?? 'orange',
            }}
          />
        )}

        {groups.length === 0 && ungroupedHosts.length > 0 && (
          <div className="term-empty-groups">
            tip — click <span className="kbd">+ group</span> to organize hosts
          </div>
        )}
      </div>
    </div>
  )
}
