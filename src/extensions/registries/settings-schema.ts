/**
 * Tracks the JSON Schema that each extension contributes for its settings.
 *
 * Used by the SettingsModal to auto-render an "Extensions › <name>" section
 * via `<PluginSettingsForm>`. Only registered for extensions whose manifest
 * declares `contributes.settings`.
 */

import type { Disposable } from '../ctx-types'

export interface SettingsSchemaEntry {
  extId: string
  displayName: string
  schema: unknown // JsonSchema, kept loose to avoid cross-package import
  source: string
}

type Listener = () => void

export class SettingsSchemaRegistry {
  private entries = new Map<string, SettingsSchemaEntry>()
  private listeners = new Set<Listener>()

  register(entry: SettingsSchemaEntry): Disposable {
    this.entries.set(entry.extId, entry)
    this.fire()
    return {
      dispose: () => {
        const cur = this.entries.get(entry.extId)
        if (cur && cur.source === entry.source) {
          this.entries.delete(entry.extId)
          this.fire()
        }
      },
    }
  }

  list(): SettingsSchemaEntry[] {
    return Array.from(this.entries.values())
  }

  get(extId: string): SettingsSchemaEntry | undefined {
    return this.entries.get(extId)
  }

  removeByExt(extId: string): void {
    if (this.entries.delete(extId)) this.fire()
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

let schemaInstance: SettingsSchemaRegistry | null = null
export function getSettingsSchemaRegistry(): SettingsSchemaRegistry {
  if (!schemaInstance) schemaInstance = new SettingsSchemaRegistry()
  return schemaInstance
}
