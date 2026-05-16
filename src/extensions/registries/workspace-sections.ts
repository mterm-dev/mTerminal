/**
 * Workspace section registry.
 *
 * Extensions register additional sidebar sections (e.g. "remote workspace"
 * from the SSH plugin). Each section owns a tab `kind` (= section `id`) and
 * the corresponding panel slot at `workspace-section.<id>`. The built-in
 * "local workspace" section is rendered by the host directly and does NOT
 * live here.
 */

import type { Disposable } from '../ctx-types'

export interface WorkspaceSectionEntry {
  id: string
  label: string
  allowNewTab: boolean
  allowNewGroup: boolean
  source: string
}

type Listener = () => void

export class WorkspaceSectionRegistry {
  private sections = new Map<string, WorkspaceSectionEntry>()
  private order: string[] = []
  private listeners = new Set<Listener>()

  register(
    section: {
      id: string
      label: string
      allowNewTab?: boolean
      allowNewGroup?: boolean
    },
    source: string,
  ): Disposable {
    const entry: WorkspaceSectionEntry = {
      id: section.id,
      label: section.label,
      allowNewTab: Boolean(section.allowNewTab),
      allowNewGroup: section.allowNewGroup ?? true,
      source,
    }
    if (!this.sections.has(entry.id)) this.order.push(entry.id)
    this.sections.set(entry.id, entry)
    this.fire()
    return {
      dispose: () => {
        const cur = this.sections.get(entry.id)
        if (cur && cur.source === source) {
          this.sections.delete(entry.id)
          this.order = this.order.filter((id) => id !== entry.id)
          this.fire()
        }
      },
    }
  }

  list(): WorkspaceSectionEntry[] {
    return this.order
      .map((id) => this.sections.get(id))
      .filter((s): s is WorkspaceSectionEntry => Boolean(s))
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, s] of this.sections) {
      if (s.source === source) {
        this.sections.delete(id)
        this.order = this.order.filter((x) => x !== id)
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

let instance: WorkspaceSectionRegistry | null = null
export function getWorkspaceSectionRegistry(): WorkspaceSectionRegistry {
  if (!instance) instance = new WorkspaceSectionRegistry()
  return instance
}
