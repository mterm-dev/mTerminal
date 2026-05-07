/**
 * Theme registry — additive layer over the core THEMES list in
 * src/settings/themes.ts. Plugins contribute additional themes either via
 * manifest (`contributes.themes` declarative — loaded as JSON files) or via
 * imperative `ctx.themes.register(theme)`.
 */

import type { Disposable, ThemeDefinition } from '../ctx-types'

export interface ThemeEntry extends ThemeDefinition {
  source: 'core' | string
}

type Listener = () => void

export class ThemeRegistry {
  private themes = new Map<string, ThemeEntry>()
  private listeners = new Set<Listener>()
  private active = ''

  registerCore(theme: ThemeDefinition): Disposable {
    return this.register(theme, 'core')
  }

  register(theme: ThemeDefinition, source: 'core' | string): Disposable {
    if (this.themes.has(theme.id)) {
      console.warn(`[ext] theme "${theme.id}" already registered, replacing`)
    }
    this.themes.set(theme.id, { ...theme, source })
    this.fire()
    return {
      dispose: () => {
        const cur = this.themes.get(theme.id)
        if (cur && cur.source === source) {
          this.themes.delete(theme.id)
          this.fire()
        }
      },
    }
  }

  list(): ThemeEntry[] {
    return Array.from(this.themes.values())
  }

  get(id: string): ThemeEntry | undefined {
    return this.themes.get(id)
  }

  setActive(id: string): void {
    if (!this.themes.has(id)) return
    this.active = id
    this.fire()
  }

  getActive(): string {
    return this.active
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, t] of this.themes) {
      if (t.source === source) {
        this.themes.delete(id)
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

let themeInstance: ThemeRegistry | null = null
export function getThemeRegistry(): ThemeRegistry {
  if (!themeInstance) themeInstance = new ThemeRegistry()
  return themeInstance
}
