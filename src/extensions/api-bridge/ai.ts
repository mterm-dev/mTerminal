/**
 * `ctx.ai` — exposes the host's AI surface to plugins.
 *
 * After the SDK-as-extension refactor there are no built-in providers. Every
 * AI provider in the system is contributed by an extension that called
 * `ctx.ai.registerProvider({...})` during activate(); the registry maps
 * provider id → impl. `complete()` and `stream()` resolve via that registry
 * and throw if no provider matches.
 *
 * The escape hatch for raw SDK access is `ctx.ai.getSdk(providerId)` which
 * peeks at the renderer-side service registry for the well-known service id
 * `ai.sdk.<providerId>` (typically published by the same extension that
 * registers the provider).
 */

import { getAiProviderRegistry, type AiProviderEntry } from '../registries/providers-ai'
import { getServiceRegistry } from '../services'
import type { AiApi, Disposable } from '../ctx-types'

export interface AiBridgeDeps {
  /** Source attribution used when registering plugin providers. */
  extId: string
}

interface AiUsage {
  inTokens: number
  outTokens: number
  costUsd: number
}

interface CompleteReq {
  provider?: string
  model?: string
  messages: Array<{ role: string; content: string }>
  system?: string | null
  signal?: AbortSignal
}

function resolveProvider(req: unknown): AiProviderEntry {
  const r = req as CompleteReq
  if (!r.provider) {
    throw new Error(
      'ai.complete: no provider specified. Install an AI provider extension and pass { provider: "<id>" }.',
    )
  }
  const entry = getAiProviderRegistry().get(r.provider)
  if (!entry) {
    throw new Error(
      `ai.complete: no AI provider registered with id "${r.provider}". Install the matching SDK extension from Settings → AI.`,
    )
  }
  return entry
}

export function createAiBridge({ extId }: AiBridgeDeps): AiApi {
  const registry = getAiProviderRegistry()

  return {
    async complete(req: unknown) {
      const entry = resolveProvider(req)
      const result = await entry.complete(req)
      return result as { text: string; usage: AiUsage }
    },

    async *stream(req: unknown): AsyncIterable<unknown> {
      const entry = resolveProvider(req)
      if (entry.stream) {
        for await (const delta of entry.stream(req)) yield delta
        return
      }
      // Provider didn't implement stream — fall back to one-shot complete and
      // emit a single delta + done.
      const result = await entry.complete(req)
      yield { text: result.text, finished: false }
      yield { text: '', finished: true, usage: result.usage }
    },

    registerProvider(p: unknown): Disposable {
      const provider = p as Omit<AiProviderEntry, 'source'>
      return registry.register({ ...provider, source: extId })
    },

    listProviders() {
      return registry.list().map((p) => ({
        id: p.id,
        label: p.label,
        source: p.source,
        models: p.models,
        requiresVault: p.requiresVault,
        vaultKeyPath: p.vaultKeyPath,
      }))
    },

    getSdk<T = unknown>(providerId: string): T | null {
      return getServiceRegistry().peekImpl<T>(`ai.sdk.${providerId}`)
    },
  }
}
