/**
 * `ctx.ai` — exposes the host's AI surface to plugins.
 *
 * For the built-in providers (anthropic, openai, ollama) we delegate to
 * `window.mt.ai` via the renderer `invoke()` helper, so that the vault-gate
 * auto-retry catches "vault locked" and prompts the user. For provider plugins
 * (registered via `ctx.ai.registerProvider`) the call is dispatched to the
 * plugin's own `complete()` / `stream()`.
 */

import { Channel, invoke } from '../../lib/ipc'
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

type AiEvent =
  | { kind: 'delta'; value: string }
  | { kind: 'done'; value: AiUsage }
  | { kind: 'error'; value: string }

interface CoreCompleteReq {
  provider: string
  model: string
  messages: Array<{ role: string; content: string }>
  system?: string | null
  maxTokens?: number | null
  temperature?: number | null
  topP?: number | null
  baseUrl?: string | null
}

function toCoreReq(req: unknown): CoreCompleteReq {
  const r = req as CoreCompleteReq
  return {
    provider: r.provider,
    model: r.model,
    messages: r.messages,
    system: r.system ?? null,
    maxTokens: r.maxTokens ?? null,
    temperature: r.temperature ?? null,
    topP: r.topP ?? null,
    baseUrl: r.baseUrl ?? null,
  }
}

async function streamCore(
  req: CoreCompleteReq,
  onDelta: (text: string) => void,
): Promise<{ text: string; usage: AiUsage }> {
  const channel = new Channel<AiEvent>()
  let text = ''
  let usage: AiUsage = { inTokens: 0, outTokens: 0, costUsd: 0 }
  let resolveDone: () => void = () => {}
  let rejectDone: (err: Error) => void = () => {}
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  channel.onmessage = (msg) => {
    if (msg.kind === 'delta') {
      text += msg.value
      onDelta(msg.value)
    } else if (msg.kind === 'done') {
      usage = msg.value
      resolveDone()
    } else if (msg.kind === 'error') {
      rejectDone(new Error(msg.value))
    }
  }
  await invoke<number>('ai_stream_complete', { events: channel, ...req })
  try {
    await done
  } finally {
    channel.unsubscribe?.()
  }
  return { text, usage }
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
      return streamCore(toCoreReq(req), () => {})
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
      const queue: Array<{ text: string; finished: false } | { text: string; finished: true; usage: AiUsage }> = []
      let resolve: (() => void) | null = null
      let error: Error | null = null
      const wait = () => new Promise<void>((r2) => { resolve = r2 })
      const onDelta = (text: string) => {
        queue.push({ text, finished: false })
        resolve?.()
      }
      const finalPromise = streamCore(toCoreReq(req), onDelta)
        .then((res) => {
          queue.push({ text: '', finished: true, usage: res.usage })
          resolve?.()
        })
        .catch((e: Error) => {
          error = e
          resolve?.()
        })
      while (true) {
        if (queue.length === 0) {
          if (error) throw error
          await wait()
          continue
        }
        const next = queue.shift()!
        yield next
        if (next.finished) break
      }
      await finalPromise
      if (error) throw error
    },

    registerProvider(p: unknown): Disposable {
      const provider = p as Omit<AiProviderEntry, 'source'>
      return registry.register({ ...provider, source: extId })
    },

    listProviders() {
      const out: Array<{ id: string; label: string; source: 'core' | string }> = []
      for (const p of registry.list()) {
        out.push({ id: p.id, label: p.label, source: p.source })
      }
      return out
    },
  }
}
