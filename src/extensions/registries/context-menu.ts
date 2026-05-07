/**
 * Extension-contributed context menu items.
 *
 * Items declare a `context` they live under (e.g. `terminal`, `terminal.selection`,
 * `tab`, `git-panel.file`). Core code that builds the menu queries this
 * registry by context to merge plugin items in.
 */

import type { ContextMenuItemSpec, Disposable } from '../ctx-types'

export interface ContextMenuEntry extends ContextMenuItemSpec {
  source: string
}

type Listener = () => void

export class ContextMenuRegistry {
  private items: ContextMenuEntry[] = []
  private listeners = new Set<Listener>()

  register(spec: ContextMenuItemSpec & { source: string }): Disposable {
    const entry: ContextMenuEntry = { ...spec }
    this.items.push(entry)
    this.fire()
    return {
      dispose: () => {
        const i = this.items.indexOf(entry)
        if (i >= 0) {
          this.items.splice(i, 1)
          this.fire()
        }
      },
    }
  }

  byContext(context: string): ContextMenuEntry[] {
    return this.items.filter((i) => i.context === context)
  }

  removeBySource(source: string): void {
    const before = this.items.length
    this.items = this.items.filter((i) => i.source !== source)
    if (this.items.length !== before) this.fire()
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

let cmInstance: ContextMenuRegistry | null = null
export function getContextMenuRegistry(): ContextMenuRegistry {
  if (!cmInstance) cmInstance = new ContextMenuRegistry()
  return cmInstance
}
