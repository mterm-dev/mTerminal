/**
 * Custom settings renderer registry.
 *
 * Lets an extension supply its own React UI for the schema-properties block
 * inside Settings → Extensions → <ext>. The host still owns the card title,
 * AI bindings section, and secrets section — only the auto-rendered property
 * form is replaced.
 *
 * Mounted by `<PluginCustomSettingsSlot extId={...}>`, which mirrors the
 * `PluginPanelSlot` lifecycle: hand the plugin a bare `<div>`, call `render`,
 * keep the returned cleanup, run it on unmount.
 */

import type { Disposable } from '../ctx-types'

export interface SettingsRendererCtx {
  host: HTMLElement
  extId: string
  settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
    onChange(cb: (key: string, value: unknown) => void): Disposable
  }
}

export interface SettingsRendererSpec {
  render(host: HTMLElement, ctx: SettingsRendererCtx): void | (() => void)
}

export interface SettingsRendererEntry extends SettingsRendererSpec {
  extId: string
  source: string
}

type Listener = () => void

export class SettingsRendererRegistry {
  private entries = new Map<string, SettingsRendererEntry>()
  private listeners = new Set<Listener>()

  register(spec: SettingsRendererSpec & { extId: string; source: string }): Disposable {
    if (this.entries.has(spec.extId)) {
      console.warn(`[ext] settingsRenderer for "${spec.extId}" already registered, replacing`)
    }
    this.entries.set(spec.extId, { ...spec })
    this.fire()
    return {
      dispose: () => {
        const cur = this.entries.get(spec.extId)
        if (cur && cur.render === spec.render) {
          this.entries.delete(spec.extId)
          this.fire()
        }
      },
    }
  }

  get(extId: string): SettingsRendererEntry | undefined {
    return this.entries.get(extId)
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, e] of this.entries) {
      if (e.source === source) {
        this.entries.delete(id)
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

let instance: SettingsRendererRegistry | null = null
export function getSettingsRendererRegistry(): SettingsRendererRegistry {
  if (!instance) instance = new SettingsRendererRegistry()
  return instance
}
