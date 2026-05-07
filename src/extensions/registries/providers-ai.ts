/**
 * AI provider plugin extensions.
 *
 * Plugins register additional AI providers (e.g. Groq, local LLaMA.cpp). The
 * core AI surface (`ctx.ai.complete`) consults this registry alongside the
 * built-in providers (anthropic, openai, ollama). Provider selection in the
 * Settings UI is the union.
 *
 * The actual `complete` / `stream` calls happen through whichever transport
 * the provider implementation exposes — typically `fetch()` against an API
 * endpoint, gated by user-supplied keys read from the vault.
 */

import type { Disposable } from '../ctx-types'

export interface AiProviderEntry {
  id: string
  label: string
  source: string
  models?: Array<{ id: string; label?: string }>
  complete(req: unknown): Promise<{ text: string; usage: unknown }>
  stream?(req: unknown): AsyncIterable<unknown>
}

type Listener = () => void

export class AiProviderRegistry {
  private providers = new Map<string, AiProviderEntry>()
  private listeners = new Set<Listener>()

  register(provider: AiProviderEntry): Disposable {
    if (this.providers.has(provider.id)) {
      console.warn(`[ext] AI provider "${provider.id}" already registered, replacing`)
    }
    this.providers.set(provider.id, provider)
    this.fire()
    return {
      dispose: () => {
        const cur = this.providers.get(provider.id)
        if (cur === provider) {
          this.providers.delete(provider.id)
          this.fire()
        }
      },
    }
  }

  get(id: string): AiProviderEntry | undefined {
    return this.providers.get(id)
  }

  list(): AiProviderEntry[] {
    return Array.from(this.providers.values())
  }

  removeBySource(source: string): void {
    let changed = false
    for (const [id, p] of this.providers) {
      if (p.source === source) {
        this.providers.delete(id)
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

let aiInstance: AiProviderRegistry | null = null
export function getAiProviderRegistry(): AiProviderRegistry {
  if (!aiInstance) aiInstance = new AiProviderRegistry()
  return aiInstance
}
