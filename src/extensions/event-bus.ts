/**
 * Renderer-side event bus that mirrors the main-side bus over IPC.
 *
 * Lifecycle:
 *   - global singleton (one bus per renderer)
 *   - subscribes once to `window.mt.ext.onBus` to receive events from main
 *     and from other renderers
 *   - when a listener is added, the local emitter dispatches both local and
 *     remote events
 *   - `emit()` sends via `window.mt.ext.emit()` which round-trips through
 *     main and re-broadcasts to the other side
 *
 * Plugins access this through `ctx.events`, which adds:
 *   - auto-prefixing unprefixed events with `<extId>:`
 *   - rejection of `app:*` emits (those are reserved to the host)
 *   - automatic cleanup on `deactivate()` via `ctx.subscribe`
 */

type Cb = (payload: unknown, origin: string) => void

class RendererEventBus {
  private listeners = new Map<string, Set<Cb>>()
  private detach: (() => void) | null = null

  ensureBound(): void {
    if (this.detach) return
    if (typeof window === 'undefined' || !window.mt?.ext?.onBus) return
    this.detach = window.mt.ext.onBus((env) => {
      this.dispatch(env.event, env.payload, env.origin)
    })
  }

  on(event: string, cb: Cb): () => void {
    this.ensureBound()
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(cb)
    return () => {
      const s = this.listeners.get(event)
      if (!s) return
      s.delete(cb)
      if (s.size === 0) this.listeners.delete(event)
    }
  }

  once(event: string, cb: Cb): () => void {
    const off = this.on(event, (payload, origin) => {
      off()
      cb(payload, origin)
    })
    return off
  }

  emit(event: string, payload: unknown): void {
    // Local listeners first.
    this.dispatch(event, payload, 'r')
    if (typeof window !== 'undefined' && window.mt?.ext?.emit) {
      void window.mt.ext.emit(event, payload).catch(() => {})
    }
  }

  /** Internal: deliver an event to local listeners. */
  private dispatch(event: string, payload: unknown, origin: string): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return
    for (const cb of Array.from(set)) {
      try {
        cb(payload, origin)
      } catch (err) {
        // listener threw — log and continue
        console.error('[ext bus listener]', err)
      }
    }
  }

  destroy(): void {
    if (this.detach) {
      this.detach()
      this.detach = null
    }
    this.listeners.clear()
  }
}

let busInstance: RendererEventBus | null = null
export function getRendererEventBus(): RendererEventBus {
  if (!busInstance) busInstance = new RendererEventBus()
  return busInstance
}

export type { Cb as BusCallback }
