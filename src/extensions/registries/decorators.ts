/**
 * Terminal output decorators.
 *
 * Decorators receive `(tabId, chunk, absLine)` for each batched output piece
 * and may return decoration specs (overlays, badges, underlines) to anchor
 * at given line offsets.
 *
 * Performance: the host throttles `app:terminal:output` events to ~30Hz and
 * batches on `\n` boundaries before invoking decorators. Plugins can opt out
 * for high-volume tabs via `ctx.decorators.skip(tabId)`.
 */

import type { Disposable } from '../ctx-types'

export interface DecoratorSpec {
  id: string
  source: string
  onOutput(ctx: { tabId: number; chunk: string; absLine: number }): unknown
  hover?(ctx: { tabId: number; line: string; range: [number, number] }): unknown
}

type Listener = () => void

export class DecoratorRegistry {
  private decorators: DecoratorSpec[] = []
  private skipped = new Set<number>()
  private listeners = new Set<Listener>()

  register(spec: DecoratorSpec): Disposable {
    this.decorators.push(spec)
    this.fire()
    return {
      dispose: () => {
        const i = this.decorators.indexOf(spec)
        if (i >= 0) {
          this.decorators.splice(i, 1)
          this.fire()
        }
      },
    }
  }

  skip(tabId: number): Disposable {
    this.skipped.add(tabId)
    return { dispose: () => this.skipped.delete(tabId) }
  }

  list(): DecoratorSpec[] {
    return [...this.decorators]
  }

  isSkipped(tabId: number): boolean {
    return this.skipped.has(tabId)
  }

  removeBySource(source: string): void {
    const before = this.decorators.length
    this.decorators = this.decorators.filter((d) => d.source !== source)
    if (this.decorators.length !== before) this.fire()
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

let decInstance: DecoratorRegistry | null = null
export function getDecoratorRegistry(): DecoratorRegistry {
  if (!decInstance) decInstance = new DecoratorRegistry()
  return decInstance
}
