/**
 * Custom tab types contributed by plugins. The grid host queries this
 * registry to render non-PTY tabs (Docker dashboards, browser tabs, etc.)
 * via `<PluginTabHost>`.
 */

import type { Disposable, TabTypeSpec } from '../ctx-types'

export interface TabTypeEntry extends TabTypeSpec {
  source: string
}

type Listener = () => void

export class TabTypeRegistry {
  private types = new Map<string, TabTypeEntry>()
  private listeners = new Set<Listener>()

  register(spec: TabTypeSpec & { source: string }): Disposable {
    if (this.types.has(spec.id)) {
      console.warn(`[ext] tab type "${spec.id}" already registered, replacing`)
    }
    this.types.set(spec.id, { ...spec })
    this.fire()
    return {
      dispose: () => {
        const cur = this.types.get(spec.id)
        if (cur && cur.factory === spec.factory) {
          this.types.delete(spec.id)
          this.fire()
        }
      },
    }
  }

  get(id: string): TabTypeEntry | undefined {
    return this.types.get(id)
  }

  list(): TabTypeEntry[] {
    return Array.from(this.types.values())
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, t] of this.types) {
      if (t.source === source) {
        this.types.delete(id)
        changed = true
      }
    }
    if (changed) this.fire()
  }

  subscribe(cb: Listener): Disposable {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  private fire(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }
}

let ttInstance: TabTypeRegistry | null = null
export function getTabTypeRegistry(): TabTypeRegistry {
  if (!ttInstance) ttInstance = new TabTypeRegistry()
  return ttInstance
}
