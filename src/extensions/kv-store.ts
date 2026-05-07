/**
 * Renderer-side KeyValueStore proxy.
 *
 * Backed by `localStorage` for `globalState` (renderer-only) and by a
 * per-extension entry inside the workspace state file for `workspaceState`.
 *
 * For v1 we keep both flavors local to the renderer; main-side
 * `ctx.globalState` is independent (writes to <dataDir>/global-state.json).
 * They are NOT synced — extensions that need cross-process state should use
 * `ctx.ipc` to bounce the value through.
 */

import type { Disposable } from './ctx-types'

export interface KeyValueStore {
  get<T = unknown>(key: string, def?: T): T | undefined
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): string[]
  onChange(cb: (key: string, value: unknown) => void): Disposable
}

interface ChangeEvent {
  key: string
  value: unknown
}

class LocalStorageKvStore implements KeyValueStore {
  private listeners = new Set<(key: string, value: unknown) => void>()
  // Track which storage keys we own so `keys()` doesn't return unrelated data.
  private prefix: string

  constructor(storageKey: string) {
    this.prefix = `${storageKey}:`
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (!e.key || !e.key.startsWith(this.prefix)) return
        const k = e.key.slice(this.prefix.length)
        const v = this.get(k)
        for (const cb of this.listeners) cb(k, v)
      })
    }
  }

  get<T = unknown>(key: string, def?: T): T | undefined {
    if (typeof localStorage === 'undefined') return def
    const raw = localStorage.getItem(this.prefix + key)
    if (raw === null) return def
    try {
      return JSON.parse(raw) as T
    } catch {
      return def
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.prefix + key, JSON.stringify(value))
    }
    this.fire({ key, value })
  }

  async delete(key: string): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.prefix + key)
    }
    this.fire({ key, value: undefined })
  }

  keys(): string[] {
    if (typeof localStorage === 'undefined') return []
    const out: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length))
    }
    return out
  }

  onChange(cb: (key: string, value: unknown) => void): Disposable {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  private fire(ev: ChangeEvent): void {
    for (const cb of this.listeners) cb(ev.key, ev.value)
  }
}

export function createGlobalState(extId: string): KeyValueStore {
  return new LocalStorageKvStore(`mterminal:ext:${extId}:global`)
}

export function createWorkspaceState(extId: string): KeyValueStore {
  // Workspace state is currently identical to globalState — there's no separate
  // "workspace identity" yet. Once mTerminal supports multiple persistent
  // workspaces this can switch storage backends.
  return new LocalStorageKvStore(`mterminal:ext:${extId}:workspace`)
}
