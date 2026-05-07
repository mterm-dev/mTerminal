import { EventEmitter } from 'node:events'
import type { ExtensionManifest } from './manifest'

export type ExtensionState =
  | 'installed' // manifest read, not active
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'error'
  | 'disabled'

export interface ExtensionRecord {
  manifest: ExtensionManifest
  state: ExtensionState
  enabled: boolean
  trusted: boolean
  /** Most recent error from the lifecycle (manifest validation, activate, deactivate). */
  lastError: { message: string; stack?: string } | null
  /** Activation timestamp (ms). */
  activatedAt: number | null
}

export type RegistryEvent =
  | { type: 'added'; id: string }
  | { type: 'removed'; id: string }
  | { type: 'state-changed'; id: string; state: ExtensionState; prev: ExtensionState }
  | { type: 'manifest-updated'; id: string }
  | { type: 'enabled-changed'; id: string; enabled: boolean }
  | { type: 'trust-changed'; id: string; trusted: boolean }
  | { type: 'error'; id: string; error: { message: string; stack?: string } }

export class ExtensionRegistry {
  private records = new Map<string, ExtensionRecord>()
  private emitter = new EventEmitter()

  on(cb: (event: RegistryEvent) => void): () => void {
    this.emitter.on('event', cb)
    return () => this.emitter.off('event', cb)
  }

  private emit(event: RegistryEvent): void {
    this.emitter.emit('event', event)
  }

  add(manifest: ExtensionManifest, opts: { enabled: boolean; trusted: boolean }): void {
    const existing = this.records.get(manifest.id)
    if (existing) {
      existing.manifest = manifest
      this.emit({ type: 'manifest-updated', id: manifest.id })
      return
    }
    this.records.set(manifest.id, {
      manifest,
      state: opts.enabled ? 'installed' : 'disabled',
      enabled: opts.enabled,
      trusted: opts.trusted,
      lastError: null,
      activatedAt: null,
    })
    this.emit({ type: 'added', id: manifest.id })
  }

  remove(id: string): void {
    if (!this.records.delete(id)) return
    this.emit({ type: 'removed', id })
  }

  get(id: string): ExtensionRecord | undefined {
    return this.records.get(id)
  }

  has(id: string): boolean {
    return this.records.has(id)
  }

  list(): ExtensionRecord[] {
    return Array.from(this.records.values())
  }

  setState(id: string, state: ExtensionState): void {
    const rec = this.records.get(id)
    if (!rec) return
    const prev = rec.state
    if (prev === state) return
    rec.state = state
    if (state === 'active') rec.activatedAt = Date.now()
    if (state !== 'error') rec.lastError = null
    this.emit({ type: 'state-changed', id, state, prev })
  }

  setEnabled(id: string, enabled: boolean): void {
    const rec = this.records.get(id)
    if (!rec) return
    if (rec.enabled === enabled) return
    rec.enabled = enabled
    if (!enabled && rec.state !== 'disabled') {
      rec.state = 'disabled'
    } else if (enabled && rec.state === 'disabled') {
      rec.state = 'installed'
    }
    this.emit({ type: 'enabled-changed', id, enabled })
  }

  setTrusted(id: string, trusted: boolean): void {
    const rec = this.records.get(id)
    if (!rec) return
    if (rec.trusted === trusted) return
    rec.trusted = trusted
    this.emit({ type: 'trust-changed', id, trusted })
  }

  setError(id: string, error: Error): void {
    const rec = this.records.get(id)
    if (!rec) return
    rec.lastError = { message: error.message, stack: error.stack }
    rec.state = 'error'
    this.emit({ type: 'error', id, error: rec.lastError })
  }
}
