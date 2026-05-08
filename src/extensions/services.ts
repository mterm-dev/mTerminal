/**
 * Renderer-side service registry.
 *
 * Mirrors the main-side `ServiceRegistry` (electron/main/extensions/services.ts)
 * but for renderer-side providers/consumers. Implementations on the renderer
 * never cross to main automatically — if a provider lives in main, it must
 * register a consumer-callable IPC handler and the renderer-side service is
 * a thin wrapper that bounces calls through `ctx.ipc.invoke`.
 */

import { satisfies } from './semver-mini'
import type { Disposable, ServiceProxy } from './ctx-types'

export interface ServiceRecord {
  id: string
  version: string
  impl: unknown
  providerExtId: string
}

export class ServiceUnavailableError extends Error {
  constructor(public readonly serviceId: string) {
    super(`service "${serviceId}" is unavailable`)
    this.name = 'ServiceUnavailableError'
  }
}

interface PendingConsumer {
  extId: string
  versionRange: string
  optional: boolean
  proxy: ProxyImpl<unknown>
}

class ProxyImpl<T> implements ServiceProxy<T> {
  available = false
  version: string | null = null
  impl: T | null = null
  private availCbs = new Set<(impl: T) => void>()
  private unavailCbs = new Set<() => void>()

  constructor(public readonly id: string) {}

  onAvailable(cb: (impl: T) => void): Disposable {
    this.availCbs.add(cb)
    if (this.available && this.impl) cb(this.impl)
    return { dispose: () => this.availCbs.delete(cb) }
  }
  onUnavailable(cb: () => void): Disposable {
    this.unavailCbs.add(cb)
    return { dispose: () => this.unavailCbs.delete(cb) }
  }
  bind(record: ServiceRecord): void {
    this.impl = record.impl as T
    this.version = record.version
    this.available = true
    for (const cb of this.availCbs) {
      try {
        cb(this.impl)
      } catch {
        /* ignore */
      }
    }
  }
  unbind(): void {
    if (!this.available) return
    this.impl = null
    this.version = null
    this.available = false
    for (const cb of this.unavailCbs) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }
}

export class RendererServiceRegistry {
  private services = new Map<string, ServiceRecord[]>()
  private pending = new Map<string, PendingConsumer[]>()
  /** Tracks which proxies are bound to which record so dispose+republish can rebind. */
  private boundProxies = new Map<ServiceRecord, Set<ProxyImpl<unknown>>>()
  /** Versioned consumer specs so we can re-resolve a proxy after its record disappears. */
  private proxySpec = new WeakMap<ProxyImpl<unknown>, { id: string; versionRange: string }>()

  consume(
    extId: string,
    consumed: Record<string, { versionRange: string; optional?: boolean }>,
  ): { proxies: Record<string, ServiceProxy<unknown>>; dispose: () => void } {
    const proxies: Record<string, ProxyImpl<unknown>> = {}
    const subscribed: Array<{ id: string; entry: PendingConsumer }> = []

    for (const [id, spec] of Object.entries(consumed)) {
      const proxy = new ProxyImpl(id)
      proxies[id] = proxy
      this.proxySpec.set(proxy, { id, versionRange: spec.versionRange })
      const match = this.findBest(id, spec.versionRange)
      if (match) {
        this.bindProxy(proxy, match)
      } else {
        const entry: PendingConsumer = {
          extId,
          versionRange: spec.versionRange,
          optional: !!spec.optional,
          proxy,
        }
        const list = this.pending.get(id) ?? []
        list.push(entry)
        this.pending.set(id, list)
        subscribed.push({ id, entry })
      }
    }

    return {
      proxies,
      dispose: () => {
        for (const { id, entry } of subscribed) {
          const list = this.pending.get(id)
          if (!list) continue
          const i = list.indexOf(entry)
          if (i >= 0) list.splice(i, 1)
        }
        for (const proxy of Object.values(proxies)) {
          this.releaseProxy(proxy)
          proxy.unbind()
        }
      },
    }
  }

  publish(record: ServiceRecord): () => void {
    const list = this.services.get(record.id) ?? []
    list.push(record)
    this.services.set(record.id, list)
    const pending = this.pending.get(record.id) ?? []
    const remaining: PendingConsumer[] = []
    for (const consumer of pending) {
      if (satisfies(record.version, consumer.versionRange)) {
        this.bindProxy(consumer.proxy, record)
      } else {
        remaining.push(consumer)
      }
    }
    this.pending.set(record.id, remaining)
    return () => {
      const arr = this.services.get(record.id)
      if (!arr) return
      const i = arr.indexOf(record)
      if (i < 0) return
      arr.splice(i, 1)
      // Rebind any consumers that were bound to this record onto another
      // matching record (or back to pending). Critical for "republish on key
      // rotation" — without this, consumers keep a reference to the now-stale
      // SDK client that the provider extension just disposed.
      const bound = this.boundProxies.get(record)
      this.boundProxies.delete(record)
      if (!bound) return
      for (const proxy of bound) {
        const spec = this.proxySpec.get(proxy)
        if (!spec) {
          proxy.unbind()
          continue
        }
        const next = this.findBest(spec.id, spec.versionRange)
        if (next) {
          this.bindProxy(proxy, next)
        } else {
          proxy.unbind()
          const list = this.pending.get(spec.id) ?? []
          list.push({
            extId: '',
            versionRange: spec.versionRange,
            optional: false,
            proxy,
          })
          this.pending.set(spec.id, list)
        }
      }
    }
  }

  private bindProxy(proxy: ProxyImpl<unknown>, record: ServiceRecord): void {
    // If proxy was already bound to another record, drop it from that set first.
    for (const [rec, set] of this.boundProxies) {
      if (set.has(proxy) && rec !== record) set.delete(proxy)
    }
    let set = this.boundProxies.get(record)
    if (!set) {
      set = new Set()
      this.boundProxies.set(record, set)
    }
    set.add(proxy)
    proxy.bind(record)
  }

  private releaseProxy(proxy: ProxyImpl<unknown>): void {
    for (const set of this.boundProxies.values()) set.delete(proxy)
  }

  private findBest(id: string, range: string): ServiceRecord | undefined {
    const arr = this.services.get(id)
    if (!arr) return undefined
    let best: ServiceRecord | undefined
    for (const rec of arr) {
      if (!satisfies(rec.version, range)) continue
      if (!best || rec.version > best.version) best = rec
    }
    return best
  }

  /**
   * Highest-version registered impl for a service id, or null. Used by
   * `ctx.ai.getSdk(<id>)` as an escape hatch — bypasses the manifest
   * `consumedServices` declaration.
   */
  peekImpl<T = unknown>(id: string): T | null {
    const arr = this.services.get(id)
    if (!arr || arr.length === 0) return null
    let best: ServiceRecord | undefined
    for (const rec of arr) {
      if (!best || rec.version > best.version) best = rec
    }
    return (best?.impl as T) ?? null
  }
}

let registryInstance: RendererServiceRegistry | null = null
export function getServiceRegistry(): RendererServiceRegistry {
  if (!registryInstance) registryInstance = new RendererServiceRegistry()
  return registryInstance
}
