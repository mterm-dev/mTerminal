/**
 * AI provider plugin registry.
 *
 * Every AI provider in mTerminal is contributed by an extension that calls
 * `ctx.ai.registerProvider({...})` during activate(). The renderer-side
 * registry tracks them and surfaces them to:
 *   - the Settings → AI panel (provider list, model picker, vault key entry)
 *   - the chat panel / command palette / explain popover (which provider to
 *     dispatch a completion to)
 *   - any consumer extension that wants the full SDK client via
 *     `ctx.services['ai.sdk.<id>']` or `ctx.ai.getSdk(<id>)`
 *
 * There are no built-in providers — installing the marketplace SDK extension
 * (Anthropic, OpenAI Codex, Ollama, …) is what makes a provider available.
 */

import type { Disposable } from '../ctx-types'

export interface AiProviderEntry {
  id: string
  label: string
  source: string
  models?: Array<{ id: string; label?: string }>
  /** Default true. When false, no vault-stored API key is required (e.g. local Ollama). */
  requiresVault?: boolean
  /** Vault path where the API key lives, e.g. 'ai_keys.anthropic'. */
  vaultKeyPath?: string
  /** Optional dynamic model fetch — powers the "refresh models" button in Settings. */
  listModels?(): Promise<Array<{ id: string; label?: string }>>
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
