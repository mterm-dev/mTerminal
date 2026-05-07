/**
 * `ctx.terminal` — gives plugins read/write/spawn access to xterm-backed tabs.
 *
 * Implementation strategy:
 *   - The renderer maintains a registry (`TerminalAccessRegistry`) populated
 *     by `<TerminalTab>` components when they mount. Each entry exposes a
 *     small adapter interface around the xterm instance and the underlying
 *     PTY id, so this module doesn't need to know anything about the tab
 *     component itself.
 *   - `spawn()` calls `window.mt.pty.spawn(...)` and instructs the workspace
 *     to add a new tab via the `WorkspaceBridge` helper.
 *
 * The registry is populated lazily — until the first tab mounts, `active()`
 * returns `null`. This is fine: most plugin commands run after the user has
 * focused a terminal.
 */

import type { Disposable, TerminalApi, TerminalHandle } from '../ctx-types'

export interface TerminalAdapter {
  readonly tabId: number
  readonly ptyId: number
  readonly cwd: string | null
  readonly cmd: string | null
  readonly title: string
  /** Up to N bytes of recent scrollback text. */
  read(maxBytes?: number): Promise<string>
  /** Write to the PTY (newlines submit). */
  write(data: string): Promise<void>
  /** Insert at prompt without auto-submit (best-effort). */
  insertAtPrompt(data: string): Promise<void>
  /** Send a named key. */
  sendKey(key: string): Promise<void>
  /** Currently selected text in xterm. */
  getSelection(): string | null
  /** Subscribe to data events. */
  onData(cb: (chunk: string) => void): Disposable
  /** Subscribe to exit. */
  onExit(cb: (code?: number) => void): Disposable
  /** Subscribe to title changes. */
  onTitleChange(cb: (title: string) => void): Disposable
}

export interface SpawnHandler {
  (opts: {
    shell?: string
    args?: string[]
    cwd?: string
    env?: Record<string, string>
    groupId?: string | null
    title?: string
  }): Promise<TerminalAdapter>
}

class TerminalAccessRegistry {
  private adapters = new Map<number, TerminalAdapter>()
  private active: TerminalAdapter | null = null
  private spawnHandler: SpawnHandler | null = null

  register(adapter: TerminalAdapter): Disposable {
    this.adapters.set(adapter.tabId, adapter)
    return {
      dispose: () => {
        if (this.adapters.get(adapter.tabId) === adapter) {
          this.adapters.delete(adapter.tabId)
        }
        if (this.active === adapter) this.active = null
      },
    }
  }

  setActive(tabId: number | null): void {
    if (tabId === null) {
      this.active = null
      return
    }
    const adapter = this.adapters.get(tabId)
    if (adapter) this.active = adapter
  }

  setSpawnHandler(handler: SpawnHandler): void {
    this.spawnHandler = handler
  }

  getSpawnHandler(): SpawnHandler | null {
    return this.spawnHandler
  }

  byId(tabId: number): TerminalAdapter | null {
    return this.adapters.get(tabId) ?? null
  }

  getActive(): TerminalAdapter | null {
    return this.active
  }

  list(): TerminalAdapter[] {
    return Array.from(this.adapters.values())
  }
}

let registryInstance: TerminalAccessRegistry | null = null
export function getTerminalRegistry(): TerminalAccessRegistry {
  if (!registryInstance) registryInstance = new TerminalAccessRegistry()
  return registryInstance
}

function asHandle(adapter: TerminalAdapter): TerminalHandle {
  return {
    tabId: adapter.tabId,
    ptyId: adapter.ptyId,
    cwd: adapter.cwd,
    cmd: adapter.cmd,
    title: adapter.title,
    read: (maxBytes) => adapter.read(maxBytes),
    write: (data) => adapter.write(data),
    insertAtPrompt: (data) => adapter.insertAtPrompt(data),
    sendKey: (key) => adapter.sendKey(key),
    getSelection: () => adapter.getSelection(),
    onData: (cb) => adapter.onData(cb),
    onExit: (cb) => adapter.onExit(cb),
    onTitleChange: (cb) => adapter.onTitleChange(cb),
  }
}

export function createTerminalBridge(): TerminalApi {
  const reg = getTerminalRegistry()
  return {
    active: () => {
      const a = reg.getActive()
      return a ? asHandle(a) : null
    },
    byId: (tabId) => {
      const a = reg.byId(tabId)
      return a ? asHandle(a) : null
    },
    async spawn(opts) {
      const handler = reg.getSpawnHandler()
      if (!handler) throw new Error('terminal spawn handler not registered yet')
      const adapter = await handler(opts ?? {})
      return asHandle(adapter)
    },
    list: () => reg.list().map(asHandle),
  }
}
