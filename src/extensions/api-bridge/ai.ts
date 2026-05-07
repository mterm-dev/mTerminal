/**
 * `ctx.ai` — exposes the host's AI surface to plugins.
 *
 * For the built-in providers (anthropic, openai, ollama) we delegate to
 * `window.mt.ai`. For provider plugins (registered via
 * `ctx.ai.registerProvider`) the call is dispatched to the plugin's own
 * `complete()` / `stream()`.
 *
 * NOTE: streaming over IPC has a hand-rolled protocol in `useAI` — for v1
 * `ctx.ai.stream` returns the same async iterable surface but uses a simple
 * polling fallback. A proper streaming bridge will land alongside the
 * AI plugin migration.
 */

import { getAiProviderRegistry, type AiProviderEntry } from '../registries/providers-ai'
import type { AiApi, Disposable } from '../ctx-types'

export interface AiBridgeDeps {
  /** Source attribution used when registering plugin providers. */
  extId: string
}

export function createAiBridge({ extId }: AiBridgeDeps): AiApi {
  const registry = getAiProviderRegistry()

  return {
    async complete(req: unknown) {
      const r = req as { provider?: string }
      if (r.provider) {
        const plugin = registry.get(r.provider)
        if (plugin) return plugin.complete(req)
      }
      const mt = window.mt as unknown as {
        ai?: { streamComplete?: (req: unknown) => Promise<{ text: string; usage: unknown }> }
      }
      if (mt.ai?.streamComplete) {
        return mt.ai.streamComplete(req)
      }
      throw new Error('no AI provider available')
    },

    async *stream(req: unknown): AsyncIterable<unknown> {
      const r = req as { provider?: string }
      if (r.provider) {
        const plugin = registry.get(r.provider)
        if (plugin?.stream) {
          for await (const delta of plugin.stream(req)) yield delta
          return
        }
      }
      // Fallback: complete and emit a single delta.
      const mt = window.mt as unknown as {
        ai?: { streamComplete?: (req: unknown) => Promise<{ text: string; usage: unknown }> }
      }
      if (!mt.ai?.streamComplete) throw new Error('no AI provider available')
      const result = await mt.ai.streamComplete(req)
      yield { text: result.text, finished: true, usage: result.usage }
    },

    registerProvider(p: unknown): Disposable {
      const provider = p as Omit<AiProviderEntry, 'source'>
      return registry.register({ ...provider, source: extId })
    },

    listProviders() {
      const out: Array<{ id: string; label: string; source: 'core' | string }> = []
      // Core providers exposed by window.mt; they are not enumerated here for v1.
      // Plugin Manager fetches the full list from the AI settings instead.
      for (const p of registry.list()) {
        out.push({ id: p.id, label: p.label, source: p.source })
      }
      return out
    },
  }
}
