import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RemoteSshPanel } from './components/RemoteSshPanel'
import { HostEditorModal } from './components/HostEditorModal'
import { RemoteTerminalTab } from './terminal/RemoteTerminalTab'
import { useHostRegistry, type ExtIpcLite } from './hooks/useHostRegistry'
import { GROUP_ACCENTS } from './shared/types'
import type {
  HostGroup,
  HostMeta,
  HostsSnapshot,
  SftpAuthBundle,
  SshKey,
} from './shared/types'

interface ExtCtx {
  id: string
  logger: {
    info(...a: unknown[]): void
    warn(...a: unknown[]): void
    error(...a: unknown[]): void
  }
  ipc: ExtIpcLite
  panels: {
    register(panel: {
      id: string
      title: string
      icon?: string
      location: 'sidebar' | 'sidebar.bottom' | 'bottombar'
      render(host: HTMLElement): void | (() => void)
    }): { dispose(): void }
    show(id: string): void
    hide(id: string): void
  }
  tabs: {
    registerTabType(spec: {
      id: string
      title: string
      icon?: string
      factory(props: { tabId: number; props: unknown; ctx: unknown }): {
        mount(host: HTMLElement): void | Promise<void>
        unmount(): void
        onResize?(): void
        onFocus?(): void
      }
    }): { dispose(): void }
    open(args: {
      type: string
      title?: string
      props?: unknown
      groupId?: string | null
    }): Promise<number>
  }
  commands: {
    register(c: { id: string; title?: string; run(): unknown | Promise<unknown> }): {
      dispose(): void
    }
  }
  keybindings: {
    register(k: { command: string; key: string }): { dispose(): void }
  }
  ui: {
    toast(opts: { kind?: 'info' | 'success' | 'warn' | 'error'; message: string }): void
    confirm(opts: {
      title: string
      message: string
      confirmLabel?: string
      cancelLabel?: string
    }): Promise<boolean>
  }
  secrets: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
    has(key: string): Promise<boolean>
  }
  providedServices: {
    publish<T>(id: string, impl: T): { dispose(): void }
  }
  workspace: {
    activeGroup(): string | null
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}

const STYLE_ID = 'remote-ssh-styles'

const CSS = `
.ext-panel[data-ext-panel="remote-ssh.hosts"] {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-subtle);
}
.term-side-embedded {
  display: contents;
}
.rs-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
}
.rs-modal {
  width: min(540px, 100%);
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
}
.rs-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.rs-modal-title {
  font-weight: 600;
  text-transform: lowercase;
  font-size: var(--t-md);
}
.rs-modal-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 70vh;
  overflow: auto;
}
.rs-icon-btn {
  background: transparent;
  border: 0;
  color: var(--fg-dim);
  cursor: pointer;
  font-size: 18px;
  padding: 0 4px;
}
.rs-icon-btn:hover {
  color: var(--fg);
}
.rs-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rs-field-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.rs-field-row > .rs-field {
  flex: 1;
}
.rs-field-narrow {
  max-width: 110px;
}
.rs-field-label {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  text-transform: lowercase;
}
.rs-field-hint {
  font-size: var(--t-xs);
  color: var(--fg-disabled);
}
.rs-input {
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 4px 8px;
  border-radius: var(--r-sm);
  font: inherit;
  width: 100%;
}
.rs-input:focus {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
.rs-radio-row {
  display: flex;
  gap: 4px;
}
.rs-radio {
  flex: 1;
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  text-transform: lowercase;
}
.rs-radio.active {
  border-color: var(--accent);
  color: var(--accent);
}
.rs-radio input {
  display: none;
}
.rs-toggle {
  display: flex;
  gap: 8px;
  align-items: center;
  cursor: pointer;
}
.rs-note {
  font-size: var(--t-xs);
  color: var(--fg-dim);
  background: var(--bg-base);
  padding: 6px 8px;
  border-radius: var(--r-sm);
}
.rs-error {
  background: color-mix(in oklch, var(--err) 18%, transparent);
  color: var(--err);
  padding: 6px 8px;
  border-radius: var(--r-sm);
  font-size: var(--t-xs);
}
.rs-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
.rs-btn {
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 5px 12px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font: inherit;
  text-transform: lowercase;
}
.rs-btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--bg-base);
}
.rs-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rs-menu {
  position: fixed;
  z-index: 3000;
  min-width: 170px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  font-size: var(--t-sm);
}
.rs-menu-item {
  background: transparent;
  border: 0;
  color: var(--fg);
  text-align: left;
  padding: 5px 12px;
  cursor: pointer;
  font: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rs-menu-item:hover {
  background: var(--bg-hover);
}
.rs-menu-item.rs-danger {
  color: var(--err);
}
.rs-menu-sep {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 0;
}
.rs-menu-submenu {
  position: relative;
}
.rs-submenu {
  position: absolute;
  left: 100%;
  top: 0;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  min-width: 140px;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.rs-accent-swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
}
.rs-terminal-host {
  background: transparent;
}
.rs-terminal-host .xterm {
  height: 100%;
}
.rs-terminal-host .xterm-viewport::-webkit-scrollbar { width: 8px; }
.rs-terminal-host .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
.rs-terminal-host .xterm-viewport::-webkit-scrollbar-thumb {
  background: var(--n-250);
  border-radius: 4px;
}
.rs-terminal-host .xterm-viewport::-webkit-scrollbar-thumb:hover {
  background: var(--n-300);
}
`

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface PanelHarnessProps {
  ctx: ExtCtx
}

interface MenuKindHost {
  kind: 'host'
  x: number
  y: number
  host: HostMeta
}
interface MenuKindGroup {
  kind: 'group'
  x: number
  y: number
  group: HostGroup
}
type MenuState = MenuKindHost | MenuKindGroup | null

function PanelHarness({ ctx }: PanelHarnessProps): React.JSX.Element {
  const reg = useHostRegistry(ctx.ipc)
  const [editor, setEditor] = React.useState<{ initial: HostMeta | null } | null>(null)
  const [menu, setMenu] = React.useState<MenuState>(null)
  const [activeHostId, setActiveHostId] = React.useState<string | null>(null)
  const [editingHostId, setEditingHostId] = React.useState<string | null>(null)
  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])

  const openTerminalTab = React.useCallback(
    async (host: HostMeta) => {
      try {
        await ctx.tabs.open({
          type: 'remote-ssh-terminal',
          title: host.name || `${host.user}@${host.host}`,
          props: { hostId: host.id },
          groupId: ctx.workspace.activeGroup() ?? undefined,
        })
        setActiveHostId(host.id)
        await reg.touchLastUsed(host.id).catch(() => {})
      } catch (err) {
        ctx.ui.toast({
          kind: 'error',
          message: `failed to open terminal: ${(err as Error).message}`,
        })
      }
    },
    [ctx, reg],
  )

  const openFilesTab = React.useCallback(
    async (host: HostMeta) => {
      try {
        await ctx.tabs.open({
          type: 'file-browser',
          title: `files: ${host.name || host.host}`,
          props: { backend: { kind: 'sftp', hostId: host.id } },
          groupId: ctx.workspace.activeGroup() ?? undefined,
        })
      } catch (err) {
        ctx.ui.toast({
          kind: 'error',
          message: `failed to open files: ${(err as Error).message}`,
        })
      }
    },
    [ctx],
  )

  const onAddHost = React.useCallback(
    (groupId?: string | null) =>
      setEditor({ initial: { ...emptyHost(), groupId: groupId ?? null } }),
    [],
  )
  const onEditHost = React.useCallback(
    (host: HostMeta) => setEditor({ initial: { ...host } }),
    [],
  )
  const onDeleteHost = React.useCallback(
    async (host: HostMeta) => {
      const ok = await ctx.ui.confirm({
        title: 'delete host',
        message: `delete "${host.name || host.host}"?`,
        confirmLabel: 'delete',
      })
      if (!ok) return
      await reg.deleteHost(host.id)
      await ctx.secrets.delete(`host:${host.id}`).catch(() => {})
    },
    [ctx, reg],
  )

  const onAddGroup = React.useCallback(async () => {
    const accent = GROUP_ACCENTS[reg.groups.length % GROUP_ACCENTS.length]
    await reg.saveGroup({
      name: `group ${reg.groups.length + 1}`,
      collapsed: false,
      accent,
    })
  }, [reg])

  const onRenameHost = React.useCallback(
    async (host: HostMeta, name: string) => {
      const trimmed = name.trim()
      if (!trimmed || trimmed === host.name) return
      await reg.saveHost({ ...host, name: trimmed })
    },
    [reg],
  )

  const onRenameGroup = React.useCallback(
    async (group: HostGroup, name: string) => {
      const trimmed = name.trim()
      if (!trimmed || trimmed === group.name) return
      await reg.saveGroup({ ...group, name: trimmed })
    },
    [reg],
  )

  const onToggleGroup = React.useCallback(
    async (group: HostGroup) => {
      await reg.saveGroup({ ...group, collapsed: !group.collapsed })
    },
    [reg],
  )

  const onSetGroupAccent = React.useCallback(
    async (group: HostGroup, accent: string) => {
      await reg.saveGroup({ ...group, accent })
    },
    [reg],
  )

  const onDeleteGroup = React.useCallback(
    async (group: HostGroup) => {
      const ok = await ctx.ui.confirm({
        title: 'delete group',
        message: `delete group "${group.name}"? hosts will become ungrouped.`,
        confirmLabel: 'delete',
      })
      if (!ok) return
      await reg.deleteGroup(group.id)
    },
    [ctx, reg],
  )

  const closeMenu = React.useCallback(() => setMenu(null), [])

  return (
    <>
      <RemoteSshPanel
        hosts={reg.hosts}
        groups={reg.groups}
        loading={reg.loading}
        activeHostId={activeHostId}
        editingHostId={editingHostId}
        editingGroupId={editingGroupId}
        setEditingHostId={setEditingHostId}
        setEditingGroupId={setEditingGroupId}
        onConnect={openTerminalTab}
        onAddHost={onAddHost}
        onAddGroup={() => void onAddGroup()}
        onToggleGroup={(g) => void onToggleGroup(g)}
        onRenameHost={(h, name) => void onRenameHost(h, name)}
        onRenameGroup={(g, name) => void onRenameGroup(g, name)}
        onHostContextMenu={(host, x, y) => setMenu({ kind: 'host', x, y, host })}
        onGroupContextMenu={(group, x, y) =>
          setMenu({ kind: 'group', x, y, group })
        }
        onReorderHost={(hostId, beforeHostId, groupId) =>
          void reg.reorderHost(hostId, beforeHostId, groupId)
        }
        onReorderGroup={(groupId, beforeGroupId) =>
          void reg.reorderGroup(groupId, beforeGroupId)
        }
      />

      {menu?.kind === 'host' && (
        <HostMenu
          x={menu.x}
          y={menu.y}
          host={menu.host}
          groups={reg.groups}
          onClose={closeMenu}
          onConnect={() => {
            void openTerminalTab(menu.host)
          }}
          onOpenFiles={() => {
            void openFilesTab(menu.host)
          }}
          onEdit={() => onEditHost(menu.host)}
          onRename={() => setEditingHostId(menu.host.id)}
          onDelete={() => {
            void onDeleteHost(menu.host)
          }}
          onMoveToGroup={(gid) => void reg.setHostGroup(menu.host.id, gid)}
        />
      )}

      {menu?.kind === 'group' && (
        <GroupMenu
          x={menu.x}
          y={menu.y}
          group={menu.group}
          onClose={closeMenu}
          onRename={() => setEditingGroupId(menu.group.id)}
          onAddHost={() => onAddHost(menu.group.id)}
          onToggleCollapse={() => void onToggleGroup(menu.group)}
          onSetAccent={(a) => void onSetGroupAccent(menu.group, a)}
          onDelete={() => void onDeleteGroup(menu.group)}
        />
      )}

      {editor && (
        <HostEditorModal
          initial={editor.initial}
          listSshKeys={reg.listSshKeys}
          secrets={ctx.secrets}
          ui={ctx.ui}
          onClose={() => setEditor(null)}
          onSave={async (host) => {
            await reg.saveHost(host)
          }}
        />
      )}
    </>
  )
}

interface HostMenuProps {
  x: number
  y: number
  host: HostMeta
  groups: HostGroup[]
  onClose(): void
  onConnect(): void
  onOpenFiles(): void
  onEdit(): void
  onRename(): void
  onDelete(): void
  onMoveToGroup(groupId: string | null): void
}

function HostMenu(props: HostMenuProps): React.JSX.Element {
  const otherGroups = props.groups.filter((g) => g.id !== props.host.groupId)
  return (
    <Menu x={props.x} y={props.y}>
      <MenuItem onClick={props.onConnect}>connect terminal</MenuItem>
      <MenuItem onClick={props.onOpenFiles}>open files</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={props.onRename}>rename</MenuItem>
      <MenuItem onClick={props.onEdit}>edit…</MenuItem>
      {(props.host.groupId || otherGroups.length > 0) && (
        <Submenu label="move to group">
          {props.host.groupId && (
            <MenuItem onClick={() => props.onMoveToGroup(null)}>
              ungrouped
            </MenuItem>
          )}
          {otherGroups.map((g) => (
            <MenuItem key={g.id} onClick={() => props.onMoveToGroup(g.id)}>
              <span
                className="rs-accent-swatch"
                style={{ background: `var(--c-${g.accent})` }}
                aria-hidden="true"
              />
              {g.name}
            </MenuItem>
          ))}
        </Submenu>
      )}
      <MenuSeparator />
      <MenuItem dangerous onClick={props.onDelete}>
        delete
      </MenuItem>
    </Menu>
  )
}

interface GroupMenuProps {
  x: number
  y: number
  group: HostGroup
  onClose(): void
  onRename(): void
  onAddHost(): void
  onToggleCollapse(): void
  onSetAccent(accent: string): void
  onDelete(): void
}

function GroupMenu(props: GroupMenuProps): React.JSX.Element {
  return (
    <Menu x={props.x} y={props.y}>
      <MenuItem onClick={props.onRename}>rename group</MenuItem>
      <MenuItem onClick={props.onAddHost}>new host here</MenuItem>
      <MenuItem onClick={props.onToggleCollapse}>
        {props.group.collapsed ? 'expand' : 'collapse'}
      </MenuItem>
      <Submenu label="change color">
        {GROUP_ACCENTS.map((a) => (
          <MenuItem key={a} onClick={() => props.onSetAccent(a)}>
            <span
              className="rs-accent-swatch"
              style={{ background: `var(--c-${a})` }}
              aria-hidden="true"
            />
            {a}
            {props.group.accent === a ? ' ✓' : ''}
          </MenuItem>
        ))}
      </Submenu>
      <MenuSeparator />
      <MenuItem dangerous onClick={props.onDelete}>
        delete group
      </MenuItem>
    </Menu>
  )
}

function Menu({
  x,
  y,
  children,
}: {
  x: number
  y: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className="rs-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  dangerous,
}: {
  children: React.ReactNode
  onClick(): void
  dangerous?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`rs-menu-item ${dangerous ? 'rs-danger' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function MenuSeparator(): React.JSX.Element {
  return <div className="rs-menu-sep" />
}

function Submenu({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  return (
    <div
      className="rs-menu-submenu"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className="rs-menu-item">
        {label} ›
      </button>
      {open && <div className="rs-submenu">{children}</div>}
    </div>
  )
}

function emptyHost(): HostMeta {
  return {
    id: '',
    name: '',
    host: '',
    port: 22,
    user: '',
    auth: 'key',
    identityPath: undefined,
    savePassword: false,
    groupId: null,
  }
}

async function buildAuthBundle(
  ctx: ExtCtx,
  hosts: HostMeta[],
  hostId: string,
): Promise<SftpAuthBundle> {
  const host = hosts.find((h) => h.id === hostId)
  if (!host) throw new Error(`unknown host ${hostId}`)
  const bundle: SftpAuthBundle = {
    hostId: host.id,
    host: host.host,
    port: host.port,
    user: host.user,
    auth: host.auth,
  }
  if (host.auth === 'key') {
    if (!host.identityPath) throw new Error('host has no identity path')
    bundle.identityPath = host.identityPath
  } else if (host.auth === 'password') {
    if (!host.savePassword) throw new Error('host requires savePassword=true')
    const pwd = await ctx.secrets.get(`host:${host.id}`)
    if (!pwd) throw new Error('no saved password (open editor and set one)')
    bundle.password = pwd
  }
  return bundle
}

export function activate(ctx: ExtCtx): void {
  ctx.logger.info('remote-ssh renderer activating')
  ensureStyles()

  ctx.subscribe(
    ctx.panels.register({
      id: 'remote-ssh.hosts',
      title: 'remote',
      location: 'sidebar',
      render: (host: HTMLElement) => {
        const root: Root = createRoot(host)
        root.render(<PanelHarness ctx={ctx} />)
        return () => {
          try {
            root.unmount()
          } catch {
            // ignore
          }
        }
      },
    }),
  )

  ctx.subscribe(
    ctx.tabs.registerTabType({
      id: 'remote-ssh-terminal',
      title: 'ssh',
      factory: ({ props }) => {
        const { hostId } = (props ?? {}) as { hostId?: string }
        if (!hostId) {
          throw new Error('remote-ssh-terminal tab requires props.hostId')
        }
        const tab = new RemoteTerminalTab(
          {
            ipc: ctx.ipc,
            logger: ctx.logger,
            resolveAuth: async (id: string) => {
              const snapshot = await ctx.ipc.invoke<HostsSnapshot>('hosts:list')
              return buildAuthBundle(ctx, snapshot.hosts ?? [], id)
            },
          },
          { hostId },
        )
        return {
          mount(host: HTMLElement) {
            void tab.mount(host)
          },
          unmount() {
            tab.unmount()
          },
          onResize() {
            tab.onResize()
          },
          onFocus() {
            tab.onFocus()
          },
        }
      },
    }),
  )

  ctx.subscribe(
    ctx.commands.register({
      id: 'remoteSsh.openHostsPanel',
      title: 'Remote SSH: open hosts panel',
      run: () => ctx.panels.show('remote-ssh.hosts'),
    }),
  )
  ctx.subscribe(
    ctx.commands.register({
      id: 'remoteSsh.addHost',
      title: 'Remote SSH: add host',
      run: () => ctx.panels.show('remote-ssh.hosts'),
    }),
  )
  ctx.subscribe(
    ctx.keybindings.register({
      command: 'remoteSsh.openHostsPanel',
      key: 'Ctrl+Shift+G',
    }),
  )

  publishRendererServices(ctx)
}

function publishRendererServices(ctx: ExtCtx): void {
  const hostsCache = { value: { hosts: [] as HostMeta[], groups: [] as HostGroup[] } }
  const refreshCache = async (): Promise<void> => {
    try {
      const snap = await ctx.ipc.invoke<HostsSnapshot>('hosts:list')
      hostsCache.value = { hosts: snap.hosts ?? [], groups: snap.groups ?? [] }
    } catch {
      // ignore
    }
  }
  void refreshCache()
  ctx.subscribe(
    ctx.ipc.on('hosts:changed', (payload) => {
      const snap = payload as HostsSnapshot
      hostsCache.value = { hosts: snap.hosts ?? [], groups: snap.groups ?? [] }
    }),
  )

  const hostRegistry = {
    listHosts: async (): Promise<HostMeta[]> => {
      await refreshCache()
      return [...hostsCache.value.hosts]
    },
    listGroups: async (): Promise<HostGroup[]> => {
      await refreshCache()
      return [...hostsCache.value.groups]
    },
    getHost: async (id: string): Promise<HostMeta | null> =>
      hostsCache.value.hosts.find((h) => h.id === id) ?? null,
    listSshKeys: (): Promise<SshKey[]> => ctx.ipc.invoke<SshKey[]>('hosts:list-keys'),
    requestAuthBundle: (hostId: string): Promise<SftpAuthBundle> =>
      buildAuthBundle(ctx, hostsCache.value.hosts, hostId),
    onHostsChanged: (cb: (hosts: HostMeta[]) => void): { dispose(): void } => {
      const sub = ctx.ipc.on('hosts:changed', (payload) => {
        const snap = payload as HostsSnapshot
        cb(snap.hosts ?? [])
      })
      return { dispose: () => sub.dispose() }
    },
  }
  ctx.subscribe(ctx.providedServices.publish('host-registry', hostRegistry))

  const sftpFs = {
    connect: async (args: { hostId: string }): Promise<{ connected: true }> => {
      const auth = await buildAuthBundle(ctx, hostsCache.value.hosts, args.hostId)
      return ctx.ipc.invoke<{ connected: true }>('sftp:connect', { auth })
    },
    disconnect: (args: { hostId: string }): Promise<void> =>
      ctx.ipc.invoke('sftp:disconnect', args) as Promise<void>,
    status: (args: { hostId: string }) => ctx.ipc.invoke('sftp:status', args),
    list: (args: { hostId: string; cwd: string; showHidden: boolean }) =>
      ctx.ipc.invoke('sftp:list', args),
    stat: (args: { hostId: string; path: string }) => ctx.ipc.invoke('sftp:stat', args),
    home: (args: { hostId: string }) => ctx.ipc.invoke('sftp:home', args),
    realpath: (args: { hostId: string; path: string }) => ctx.ipc.invoke('sftp:realpath', args),
    mkdir: (args: { hostId: string; path: string }) => ctx.ipc.invoke('sftp:mkdir', args),
    createFile: (args: { hostId: string; path: string }) =>
      ctx.ipc.invoke('sftp:create-file', args),
    rename: (args: { hostId: string; from: string; to: string }) =>
      ctx.ipc.invoke('sftp:rename', args),
    remove: (args: { hostId: string; path: string; recursive: boolean }) =>
      ctx.ipc.invoke('sftp:remove', args),
    copy: (args: { hostId: string; from: string; to: string; recursive: boolean }) =>
      ctx.ipc.invoke('sftp:copy', args),
    move: (args: { hostId: string; from: string; to: string }) =>
      ctx.ipc.invoke('sftp:move', args),
    upload: (args: { hostId: string; localPath: string; remotePath: string }) =>
      ctx.ipc.invoke('sftp:upload', args),
    download: (args: { hostId: string; remotePath: string; localPath: string }) =>
      ctx.ipc.invoke('sftp:download', args),
    read: (args: { hostId: string; path: string }) => ctx.ipc.invoke('sftp:read', args),
    write: (args: { hostId: string; path: string; content: string }) =>
      ctx.ipc.invoke('sftp:write', args),
  }
  ctx.subscribe(ctx.providedServices.publish('sftp-fs', sftpFs))
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
