/**
 * `ctx.ai` — exposes the host's AI surface to plugins.
 *
 * Three first-party providers (Anthropic / OpenAI Codex / Ollama) live in
 * mTerminal core and are seeded into the renderer-side registry on boot.
 * Extensions can additionally register their own providers via
 * `ctx.ai.registerProvider({...})`. `complete()` and `stream()` resolve via
 * the registry and forward through the host IPC for built-ins, or to the
 * extension's own impl for plugin-registered providers.
 */

import { getAiProviderRegistry, type AiProviderEntry } from '../registries/providers-ai'
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
      'ai.complete: no provider specified. Pass { provider: "anthropic" | "openai-codex" | "ollama" | <custom> }.',
    )
  }
  const entry = getAiProviderRegistry().get(r.provider)
  if (!entry) {
    throw new Error(
      `ai.complete: no AI provider registered with id "${r.provider}".`,
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
  }
}
