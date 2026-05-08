import { Ollama } from 'ollama'
import type { CompleteReq, ModelInfo, Provider, ResolveOptions, StreamReq } from '../types'

const DEFAULT_HOST = 'http://localhost:11434'
const STATIC_MODELS: ModelInfo[] = [
  { id: 'llama3.2', name: 'llama3.2' },
  { id: 'qwen2.5-coder', name: 'qwen2.5-coder' },
]

let cachedClient: Ollama | null = null
let cachedHost = ''

function buildClient(opts: ResolveOptions): Ollama {
  const host = opts.baseUrl || DEFAULT_HOST
  if (opts.baseUrl) return new Ollama({ host })
  if (!cachedClient || cachedHost !== host) {
    cachedClient = new Ollama({ host })
    cachedHost = host
  }
  return cachedClient
}

export const ollamaProvider: Provider = {
  id: 'ollama',
  label: 'Ollama',
  requiresVault: false,
  defaultModel: 'llama3.2',

  async listModels(opts) {
    try {
      const client = buildClient(opts)
      const res = await client.list()
      if (res.models?.length) {
        return res.models.map((m) => ({ id: m.name, name: m.name }))
      }
    } catch {
      /* fall through */
    }
    return STATIC_MODELS
  },

  async complete(req: CompleteReq) {
    const client = buildClient(req)
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...req.messages,
    ]
    const res = await client.chat({
      model: req.model || this.defaultModel,
      messages,
      stream: false,
    })
    return {
      text: res.message.content,
      usage: {
        inTokens: res.prompt_eval_count ?? 0,
        outTokens: res.eval_count ?? 0,
        costUsd: 0,
      },
    }
  },

  async stream(req: StreamReq, emit) {
    const client = buildClient(req)
    const messages = [
      ...(req.system ? [{ role: 'system', content: req.system }] : []),
      ...req.messages,
    ]
    const iter = await client.chat({
      model: req.model || this.defaultModel,
      messages,
      stream: true,
    })
    let inTokens = 0
    let outTokens = 0
    const onAbort = () => iter.abort()
    req.signal.addEventListener('abort', onAbort)
    try {
      for await (const chunk of iter) {
        if (chunk.message?.content) {
          emit({ id: req.id, kind: 'delta', value: chunk.message.content })
        }
        if (chunk.done) {
          inTokens = chunk.prompt_eval_count ?? 0
          outTokens = chunk.eval_count ?? 0
        }
      }
    } finally {
      req.signal.removeEventListener('abort', onAbort)
    }
    return { inTokens, outTokens, costUsd: 0 }
  },
}
