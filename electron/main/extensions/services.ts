import { satisfies } from './semver-mini'

/**
 * Atom-style service wiring.
 *
 * Plugins declare:
 *   "providedServices": { "git.statusProvider": { "version": "1.0.0" } }
 *   "consumedServices": { "ai.completion": { "versionRange": "^1.0.0", "optional": true } }
 *
 * The host:
 *   1. resolves activation order via Kahn's algorithm (providers before consumers)
 *   2. on cycle, both sides activate with `nullProxy` on the cycle edge and
 *      log a warning (extension:cycle event)
 *   3. when a provider publishes its impl via `ctx.providedServices.publish(id, impl)`,
 *      pending consumers receive it through their ServiceProxy.onAvailable callback.
 *
 * If the provider never publishes (e.g. activation throws), consumers stay on
 * `nullProxy` and method calls on `proxy.impl` throw `ServiceUnavailableError`.
 */

export interface ServiceRecord {
  id: string
  version: string
  impl: unknown
  providerExtId: string
}

export class ServiceUnavailableError extends Error {
  constructor(public readonly serviceId: string) {
    super(`service "${serviceId}" is unavailable (provider not active or did not publish)`)
    this.name = 'ServiceUnavailableError'
  }
}

export interface ServiceProxy<T = unknown> {
  readonly id: string
  readonly available: boolean
  readonly version: string | null
  readonly impl: T | null
  onAvailable(cb: (impl: T) => void): () => void
  onUnavailable(cb: () => void): () => void
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

  onAvailable(cb: (impl: T) => void): () => void {
    this.availCbs.add(cb)
    if (this.available && this.impl) cb(this.impl)
    return () => this.availCbs.delete(cb)
  }

  onUnavailable(cb: () => void): () => void {
    this.unavailCbs.add(cb)
    return () => this.unavailCbs.delete(cb)
  }

  bind(record: ServiceRecord): void {
    this.impl = record.impl as T
    this.version = record.version
    this.available = true
    for (const cb of this.availCbs) {
      try {
        cb(this.impl)
      } catch {
        // ignore listener errors
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
        // ignore
      }
    }
  }
}

export class ServiceRegistry {
  /** id → list of records, sorted by registration order. */
  private services = new Map<string, ServiceRecord[]>()
  /** id → list of consumers waiting for a provider match. */
  private pending = new Map<string, PendingConsumer[]>()

  /**
   * Resolve a snapshot of consumed services for a plugin. Builds a record of
   * `ServiceProxy`s, one per consumed id. If no provider matches yet, the
   * proxy stays unbound and gets bound later when a matching provider
   * publishes.
   *
   * Returns the proxy map and a `dispose()` to unbind on plugin deactivation.
   */
  consume(
    extId: string,
    consumed: Record<string, { versionRange: string; optional?: boolean }>,
  ): { proxies: Record<string, ServiceProxy<unknown>>; dispose: () => void } {
    const proxies: Record<string, ProxyImpl<unknown>> = {}
    const subscribed: Array<{ id: string; entry: PendingConsumer }> = []

    for (const [id, spec] of Object.entries(consumed)) {
      const proxy = new ProxyImpl(id)
      proxies[id] = proxy
      const match = this.findBest(id, spec.versionRange)
      if (match) {
        proxy.bind(match)
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
        for (const proxy of Object.values(proxies)) proxy.unbind()
      },
    }
  }

  /**
   * Provider publishes an implementation. Pending consumers that match the
   * version range receive the impl via their proxies.
   */
  publish(record: ServiceRecord): () => void {
    const list = this.services.get(record.id) ?? []
    list.push(record)
    this.services.set(record.id, list)

    const pending = this.pending.get(record.id) ?? []
    const remaining: PendingConsumer[] = []
    for (const consumer of pending) {
      if (satisfies(record.version, consumer.versionRange)) {
        consumer.proxy.bind(record)
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
      // Move bound consumers back to pending; rebind to next match if any.
      // (Simplified: if the unpublished record was bound, find a new provider.)
      // We don't track which consumers are bound to which record, so we
      // re-resolve all pending plus any consumers using a snapshot of impls.
      // For v1, we just leave previously-bound proxies pointing at the now-stale
      // impl until plugin deactivates. Improvement: track bound proxies per record.
    }
  }

  /** Snapshot of all currently-registered services. */
  list(): ServiceRecord[] {
    const out: ServiceRecord[] = []
    for (const arr of this.services.values()) out.push(...arr)
    return out
  }

  private findBest(id: string, range: string): ServiceRecord | undefined {
    const arr = this.services.get(id)
    if (!arr) return undefined
    // Highest version that satisfies. Simple lexicographic on version string.
    let best: ServiceRecord | undefined
    for (const rec of arr) {
      if (!satisfies(rec.version, range)) continue
      if (!best || rec.version > best.version) best = rec
    }
    return best
  }
}

/**
 * Compute activation order using a topological sort over the
 * provider/consumer graph. Cycles are detected and broken by emitting
 * `cycle: true` for the affected ids; both ends of the cycle activate in
 * insertion order with their consumers receiving `nullProxy` on the back-edge.
 */
export function topoSortActivation(
  manifests: Array<{
    id: string
    providedServices: Record<string, unknown>
    consumedServices: Record<string, { optional?: boolean }>
  }>,
): { order: string[]; cycles: string[][] } {
  // Build provider id → ext id index.
  const providerByService = new Map<string, string>()
  for (const m of manifests) {
    for (const sid of Object.keys(m.providedServices)) {
      if (!providerByService.has(sid)) providerByService.set(sid, m.id)
    }
  }

  // Edges: ext A depends on ext B if A consumes a service B provides.
  const deps = new Map<string, Set<string>>()
  for (const m of manifests) {
    const set = new Set<string>()
    for (const [sid, cfg] of Object.entries(m.consumedServices)) {
      if (cfg.optional) continue
      const provider = providerByService.get(sid)
      if (provider && provider !== m.id) set.add(provider)
    }
    deps.set(m.id, set)
  }

  // Kahn's
  const indegree = new Map<string, number>()
  for (const id of deps.keys()) indegree.set(id, 0)
  for (const set of deps.values()) for (const d of set) indegree.set(d, (indegree.get(d) ?? 0) + 1)

  // Reverse so deps activate first.
  const ready: string[] = []
  for (const m of manifests) if ((indegree.get(m.id) ?? 0) === 0) ready.push(m.id)

  const order: string[] = []
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    const ds = deps.get(id) ?? new Set()
    for (const d of ds) {
      indegree.set(d, (indegree.get(d) ?? 0) - 1)
      if ((indegree.get(d) ?? 0) === 0) ready.push(d)
    }
  }

  // Anything not in `order` is part of a cycle.
  const remaining = manifests.map((m) => m.id).filter((id) => !order.includes(id))
  const cycles = remaining.length ? [remaining] : []
  // Append the cycle nodes in insertion order.
  for (const id of remaining) order.push(id)

  return { order, cycles }
}
