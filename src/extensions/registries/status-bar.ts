/**
 * Status bar item registry.
 *
 * Items are sorted by `priority` (higher first) within each `align` half.
 * `refreshOn` event names cause the item's `text`/`icon`/`tooltip` to be
 * re-evaluated (handy for items that derive their label from app state).
 */

import { getRendererEventBus } from '../event-bus'
import type { Disposable, StatusBarItemSpec } from '../ctx-types'

export interface StatusBarEntry extends StatusBarItemSpec {
  source: string
  /** Resolved text at the last refresh tick. */
  resolvedText: string
}

type Listener = () => void

export class StatusBarRegistry {
  private items = new Map<string, StatusBarEntry>()
  private listeners = new Set<Listener>()
  private subs = new Map<string, Array<() => void>>()

  register(spec: StatusBarItemSpec & { source: string }): Disposable {
    if (this.items.has(spec.id)) {
      console.warn(`[ext] status bar item "${spec.id}" already registered, replacing`)
      this.cleanupSubs(spec.id)
    }
    const entry: StatusBarEntry = {
      ...spec,
      resolvedText: typeof spec.text === 'function' ? spec.text() : (spec.text ?? ''),
    }
    this.items.set(spec.id, entry)

    if (spec.refreshOn?.length) {
      const bus = getRendererEventBus()
      const offs: Array<() => void> = []
      for (const ev of spec.refreshOn) {
        offs.push(
          bus.on(ev, () => {
            const cur = this.items.get(spec.id)
            if (!cur) return
            cur.resolvedText = typeof cur.text === 'function' ? cur.text() : (cur.text ?? '')
            this.fire()
          }),
        )
      }
      this.subs.set(spec.id, offs)
    }
    this.fire()

    return {
      dispose: () => {
        const cur = this.items.get(spec.id)
        if (cur && cur.source === spec.source) {
          this.items.delete(spec.id)
          this.cleanupSubs(spec.id)
          this.fire()
        }
      },
    }
  }

  update(
    id: string,
    patch: Partial<{ text: string; icon: string; tooltip: string; onClick: () => void }>,
  ): void {
    const cur = this.items.get(id)
    if (!cur) return
    if (patch.text !== undefined) {
      cur.text = patch.text
      cur.resolvedText = patch.text
    }
    if (patch.icon !== undefined) cur.icon = patch.icon
    if (patch.tooltip !== undefined) cur.tooltip = patch.tooltip
    if (patch.onClick !== undefined) cur.onClick = patch.onClick
    this.fire()
  }

  list(): StatusBarEntry[] {
    return Array.from(this.items.values()).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, it] of this.items) {
      if (it.source === source) {
        this.items.delete(id)
        this.cleanupSubs(id)
        changed = true
      }
    }
    if (changed) this.fire()
  }

  subscribe(cb: Listener): Disposable {
    this.listeners.add(cb)
    return { dispose: () => this.listeners.delete(cb) }
  }

  private cleanupSubs(id: string): void {
    const offs = this.subs.get(id)
    if (!offs) return
    for (const o of offs) {
      try {
        o()
      } catch {
        /* ignore */
      }
    }
    this.subs.delete(id)
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

let sbInstance: StatusBarRegistry | null = null
export function getStatusBarRegistry(): StatusBarRegistry {
  if (!sbInstance) sbInstance = new StatusBarRegistry()
  return sbInstance
}
