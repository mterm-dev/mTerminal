/**
 * Trust modal flow.
 *
 * On first activation of an untrusted extension we show a modal listing the
 * declared capabilities. The user clicks Trust or Cancel; the choice is
 * persisted in `~/.mterminal/trust.json` via `window.mt.ext.setTrusted`.
 *
 * Anti-spam: prompts are queued. If multiple plugins want to activate at the
 * same time (e.g. all `onStartupFinished`), the user sees a single stacked
 * dialog with per-row toggles. The full UI lives in `components/TrustModal.tsx`.
 *
 * For v1 we expose a programmatic interface here; the modal renderer is wired
 * up by `<PluginUiHost>` (task #8 / #10).
 */

export interface TrustRequest {
  id: string
  displayName: string
  source: 'built-in' | 'user'
  capabilities: string[]
}

export interface TrustDecision {
  trusted: boolean
}

type Listener = () => void

class TrustQueue {
  private pending = new Map<string, { req: TrustRequest; resolve: (d: TrustDecision) => void }>()
  private listeners = new Set<Listener>()

  request(req: TrustRequest): Promise<TrustDecision> {
    return new Promise((resolve) => {
      const existing = this.pending.get(req.id)
      if (existing) {
        // Resolve the older request as cancelled to avoid leaks.
        existing.resolve({ trusted: false })
      }
      this.pending.set(req.id, { req, resolve })
      this.fire()
    })
  }

  decide(id: string, trusted: boolean): void {
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    entry.resolve({ trusted })
    this.fire()
  }

  decideAll(trusted: boolean): void {
    for (const [id, entry] of Array.from(this.pending)) {
      this.pending.delete(id)
      entry.resolve({ trusted })
    }
    this.fire()
  }

  list(): TrustRequest[] {
    return Array.from(this.pending.values()).map((p) => p.req)
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
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

let trustQueue: TrustQueue | null = null
export function getTrustQueue(): TrustQueue {
  if (!trustQueue) trustQueue = new TrustQueue()
  return trustQueue
}

/** Persist a trust decision via the main process. */
export async function persistTrust(id: string, trusted: boolean): Promise<void> {
  await window.mt.ext.setTrusted(id, trusted)
}
