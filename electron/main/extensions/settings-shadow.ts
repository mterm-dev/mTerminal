import { EventEmitter } from 'node:events'
import { loadSettings, saveSettings } from '../settings-store'
import { getMainEventBus } from './event-bus-main'

/**
 * Main-side mirror of the renderer settings store.
 *
 * The renderer is the source of truth (it owns useSettings + UI), but the
 * extension host needs to:
 *   1. seed each plugin's settings at startup before the renderer is ready
 *   2. let main-side `activate(ctx)` read/write settings.extensions[<id>][...]
 *
 * Strategy: lazy-load from disk via loadSettings() (the same JSON file the
 * renderer reads), then watch the bus for `app:settings:changed` events
 * (fired by the renderer when it persists). Main-side writes go via
 * `saveSettings()` AND emit `app:settings:changed` so the renderer reloads.
 */

interface SettingsShape {
  // Free-form. We only manipulate the `extensions` sub-object here.
  [k: string]: unknown
  extensions?: Record<string, Record<string, unknown>>
}

export class SettingsShadow {
  private cache: SettingsShape = {}
  private loaded = false
  private emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  init(): void {
    this.reload()
    const bus = getMainEventBus()
    bus.on('app:settings:changed', (payload, origin) => {
      if (origin === 'main') return // we caused it; don't re-read
      // Renderer changed something; reload from disk to stay in sync.
      this.reload()
      const p = payload as { key?: string; value?: unknown } | undefined
      if (p && typeof p.key === 'string') {
        this.emitter.emit('change', p.key, p.value)
      }
    })
  }

  private reload(): void {
    const raw = loadSettings()
    if (!raw) {
      this.cache = {}
      this.loaded = true
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.cache = parsed as SettingsShape
      } else {
        this.cache = {}
      }
    } catch {
      this.cache = {}
    }
    this.loaded = true
  }

  get<T = unknown>(key: string): T | undefined {
    if (!this.loaded) this.reload()
    return this.cache[key] as T | undefined
  }

  /** Read everything under settings.extensions[id]. */
  readExtAll(id: string): Record<string, unknown> {
    if (!this.loaded) this.reload()
    const ext = this.cache.extensions?.[id]
    return ext ? { ...ext } : {}
  }

  readExt(id: string, key: string): unknown {
    if (!this.loaded) this.reload()
    return this.cache.extensions?.[id]?.[key]
  }

  async writeExt(id: string, key: string, value: unknown): Promise<void> {
    if (!this.loaded) this.reload()
    if (!this.cache.extensions) this.cache.extensions = {}
    if (!this.cache.extensions[id]) this.cache.extensions[id] = {}
    this.cache.extensions[id][key] = value
    saveSettings(JSON.stringify(this.cache))
    const fullKey = `extensions.${id}.${key}`
    this.emitter.emit('change', fullKey, value)
    // Notify renderer to refetch.
    getMainEventBus().emit('app:settings:changed', { key: fullKey, value })
  }

  onCoreChange(cb: (key: string, value: unknown) => void): () => void {
    this.emitter.on('change', cb)
    return () => this.emitter.off('change', cb)
  }

  onExtChange(id: string, cb: (key: string, value: unknown) => void): () => void {
    const wrapped = (key: string, value: unknown): void => {
      const prefix = `extensions.${id}.`
      if (!key.startsWith(prefix)) return
      cb(key.slice(prefix.length), value)
    }
    this.emitter.on('change', wrapped)
    return () => this.emitter.off('change', wrapped)
  }
}

let shadowInstance: SettingsShadow | null = null
export function getSettingsShadow(): SettingsShadow {
  if (!shadowInstance) {
    shadowInstance = new SettingsShadow()
  }
  return shadowInstance
}
