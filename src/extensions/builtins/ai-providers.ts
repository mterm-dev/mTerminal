/**
 * Builtin AI provider seeder.
 *
 * After cofnięcie SDK-as-extension every first-party provider
 * (Anthropic, Codex, Ollama) is implemented inside `electron/main/ai/`. This
 * module registers three synthetic entries in the renderer-side registry so
 * the rest of the renderer (Settings → AI, AIPanel, ModelChooser, git-panel
 * binding) can pretend they look like extension-contributed providers.
 *
 * The `complete`/`stream` impls are thin wrappers around `ai()`: they
 * forward the request through IPC and re-emit `delta`/`done`/`error` events
 * matching the AsyncIterable shape the renderer registry expects.
 */

import { getAiProviderRegistry, type AiProviderEntry } from '../registries/providers-ai'

interface MtAiApi {
  stream(req: {
    id: string
    provider: string
    model?: string
    system?: string | null
    messages: Array<{ role: string; content: string }>
    apiKey?: string
    baseUrl?: string
  }): Promise<void>
  complete(req: {
    id: string
    provider: string
    model?: string
    system?: string | null
    messages: Array<{ role: string; content: string }>
    apiKey?: string
    baseUrl?: string
  }): Promise<{ text: string; usage: { inTokens: number; outTokens: number; costUsd: number } }>
  cancel(id: string): Promise<void>
  listModels(
    provider: string,
    opts?: { apiKey?: string; baseUrl?: string },
  ): Promise<Array<{ id: string; name: string }>>
  listProviders(): Promise<
    Array<{
      id: string
      label: string
      requiresVault: boolean
      vaultKeyPath?: string
      defaultModel: string
    }>
  >
  onEvent(cb: (ev: AiCoreEvent) => void): () => void
}

type AiCoreEvent =
  | { id: string; kind: 'delta'; value: string }
  | { id: string; kind: 'done'; value: { inTokens: number; outTokens: number; costUsd: number } }
  | { id: string; kind: 'error'; value: string }

function ai(): MtAiApi {
  return (window as unknown as { mt: { ai: MtAiApi } }).mt.ai
}

let nextId = 1
const inflight = new Map<
  string,
  {
    onDelta: (text: string) => void
    onDone: (usage: { inTokens: number; outTokens: number; costUsd: number }) => void
    onError: (err: string) => void
  }
>()
let busInstalled = false

function installEventBus(): void {
  if (busInstalled) return
  busInstalled = true
  const api = ai()
  if (!api?.onEvent) return
  api.onEvent((ev) => {
    const handler = inflight.get(ev.id)
    if (!handler) return
    if (ev.kind === 'delta') handler.onDelta(ev.value)
    else if (ev.kind === 'done') {
      handler.onDone(ev.value)
      inflight.delete(ev.id)
    } else if (ev.kind === 'error') {
      handler.onError(ev.value)
      inflight.delete(ev.id)
    }
  })
}

function makeBuiltinEntry(meta: {
  id: string
  label: string
  requiresVault: boolean
  vaultKeyPath?: string
  defaultModel: string
}): AiProviderEntry {
  const baseUrlAware = (req: unknown): { apiKey?: string; baseUrl?: string } => {
    const r = req as { apiKey?: string; baseUrl?: string }
    return {
      apiKey: typeof r.apiKey === 'string' ? r.apiKey : undefined,
      baseUrl: typeof r.baseUrl === 'string' ? r.baseUrl : undefined,
    }
  }
  return {
    id: meta.id,
    label: meta.label,
    source: 'core',
    requiresVault: meta.requiresVault,
    vaultKeyPath: meta.vaultKeyPath,
    listModels: async () => {
      installEventBus()
      const list = await ai().listModels(meta.id)
      return list.map((m) => ({ id: m.id, label: m.name }))
    },
    async complete(req: unknown) {
      installEventBus()
      const r = req as {
        model?: string
        system?: string | null
        messages: Array<{ role: string; content: string }>
        apiKey?: string
        baseUrl?: string
      }
      const id = String(nextId++)
      const result = await ai().complete({
        id,
        provider: meta.id,
        model: r.model || meta.defaultModel,
        system: r.system,
        messages: r.messages,
        ...baseUrlAware(r),
      })
      return result as { text: string; usage: unknown }
    },
    stream(req: unknown): AsyncIterable<unknown> {
      installEventBus()
      const r = req as {
        model?: string
        system?: string | null
        messages: Array<{ role: string; content: string }>
        apiKey?: string
        baseUrl?: string
        signal?: AbortSignal
      }
      const id = String(nextId++)
      const queue: Array<{ text?: string; finished?: boolean; usage?: unknown }> = []
      let resolveNext: ((v: { value: unknown; done: boolean }) => void) | null = null
      let errored: Error | null = null
      let finished = false

      const push = (item: { text?: string; finished?: boolean; usage?: unknown }): void => {
        if (resolveNext) {
          const r2 = resolveNext
          resolveNext = null
          r2({ value: item, done: false })
        } else {
          queue.push(item)
        }
      }

      inflight.set(id, {
        onDelta: (text) => push({ text }),
        onDone: (usage) => {
          push({ text: '', finished: true, usage })
          finished = true
          if (resolveNext) {
            const r2 = resolveNext
            resolveNext = null
            r2({ value: undefined, done: true })
          }
        },
        onError: (err) => {
          errored = new Error(err)
          finished = true
          if (resolveNext) {
            const r2 = resolveNext
            resolveNext = null
            r2({ value: undefined, done: true })
          }
        },
      })

      // Fire the request. Errors before the first IPC reply rarely happen but
      // surface them as a synthetic error event.
      void ai()
        .stream({
          id,
          provider: meta.id,
          model: r.model || meta.defaultModel,
          system: r.system,
          messages: r.messages,
          ...baseUrlAware(r),
        })
        .catch((e: unknown) => {
          const handler = inflight.get(id)
          if (handler) handler.onError(e instanceof Error ? e.message : String(e))
        })

      const onAbort = (): void => {
        void ai().cancel(id)
      }
      r.signal?.addEventListener('abort', onAbort)

      return {
        [Symbol.asyncIterator](): AsyncIterator<unknown> {
          return {
            next: () => {
              if (errored) {
                const err = errored
                errored = null
                return Promise.reject(err)
              }
              if (queue.length > 0) {
                return Promise.resolve({ value: queue.shift()!, done: false })
              }
              if (finished) return Promise.resolve({ value: undefined, done: true })
              return new Promise<{ value: unknown; done: boolean }>((res) => {
                resolveNext = res
              })
            },
            return: () => {
              r.signal?.removeEventListener('abort', onAbort)
              void ai().cancel(id)
              inflight.delete(id)
              return Promise.resolve({ value: undefined, done: true })
            },
            throw: (e: unknown) => {
              r.signal?.removeEventListener('abort', onAbort)
              return Promise.reject(e)
            },
          }
        },
      }
    },
  }
}

let seeded = false

export function seedBuiltinAiProviders(): void {
  if (seeded) return
  seeded = true

  const registry = getAiProviderRegistry()
  const builtins = [
    {
      id: 'anthropic',
      label: 'Anthropic',
      requiresVault: true,
      vaultKeyPath: 'ai_keys.anthropic',
      defaultModel: 'claude-opus-4-7',
    },
    {
      id: 'openai-codex',
      label: 'OpenAI Codex',
      requiresVault: true,
      vaultKeyPath: 'ai_keys.openai-codex',
      defaultModel: 'gpt-5-codex',
    },
    {
      id: 'ollama',
      label: 'Ollama',
      requiresVault: false,
      defaultModel: 'llama3.2',
    },
  ] as const

  for (const m of builtins) {
    registry.register(makeBuiltinEntry(m))
  }
}
