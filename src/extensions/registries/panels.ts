/**
 * Sidebar / bottom-bar panel registry.
 *
 * The host renders a `<PluginPanelSlot>` for each location and mounts each
 * panel's React tree (or vanilla DOM) into a host element. Panel render
 * functions return a disposer used at unregister time.
 *
 * Visibility / collapse state is stored per-panel in the workspace state
 * (`mterminal:ext:panels:visible`).
 */

import type { Disposable, PanelSpec } from '../ctx-types'

export interface PanelEntry extends PanelSpec {
  source: string
}

type Listener = () => void

export class PanelRegistry {
  private panels = new Map<string, PanelEntry>()
  private listeners = new Set<Listener>()

  register(spec: PanelSpec & { source: string }): Disposable {
    if (this.panels.has(spec.id)) {
      console.warn(`[ext] panel "${spec.id}" already registered, replacing`)
    }
    this.panels.set(spec.id, { ...spec })
    this.fire()
    return {
      dispose: () => {
        const cur = this.panels.get(spec.id)
        if (cur && cur.render === spec.render) {
          this.panels.delete(spec.id)
          this.fire()
        }
      },
    }
  }

  list(location?: PanelSpec['location']): PanelEntry[] {
    const all = Array.from(this.panels.values())
    return location ? all.filter((p) => p.location === location) : all
  }

  get(id: string): PanelEntry | undefined {
    return this.panels.get(id)
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, p] of this.panels) {
      if (p.source === source) {
        this.panels.delete(id)
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

let panelInstance: PanelRegistry | null = null
export function getPanelRegistry(): PanelRegistry {
  if (!panelInstance) panelInstance = new PanelRegistry()
  return panelInstance
}
