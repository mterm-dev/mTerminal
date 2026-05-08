import Anthropic from '@anthropic-ai/sdk'
import { getAiKey } from '../vault-keys'
import type { CompleteReq, ModelInfo, Provider, ResolveOptions, StreamReq } from '../types'

const STATIC_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
]

let cachedClient: Anthropic | null = null
let cachedKey = ''

function buildClient(opts: ResolveOptions): Anthropic {
  const apiKey = opts.apiKey ?? getAiKey('anthropic') ?? ''
  if (!apiKey) throw new Error('Anthropic API key not set. Open Settings → AI to add one.')
  if (opts.apiKey || opts.baseUrl) {
    return new Anthropic({ apiKey, baseURL: opts.baseUrl || undefined })
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Anthropic({ apiKey })
    cachedKey = apiKey
  }
  return cachedClient
}

function toAnthropicMessages(messages: { role: string; content: string }[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    }))
}

export const anthropicProvider: Provider = {
  id: 'anthropic',
  label: 'Anthropic',
  requiresVault: true,
  vaultKeyPath: 'ai_keys.anthropic',
  defaultModel: 'claude-opus-4-7',

  async listModels(opts) {
    try {
      const client = buildClient(opts)
      const list = await client.models.list({ limit: 100 })
      const data = (list as unknown as { data: Array<{ id: string; display_name?: string }> }).data
      if (Array.isArray(data) && data.length > 0) {
        return data.map((m) => ({ id: m.id, name: m.display_name ?? m.id }))
      }
    } catch {
      /* fall through to static */
    }
    return STATIC_MODELS
  },

  async complete(req: CompleteReq) {
    const client = buildClient(req)
    const res = await client.messages.create({
      model: req.model || this.defaultModel,
      max_tokens: 4096,
      system: req.system ?? undefined,
      messages: toAnthropicMessages(req.messages),
    })
    const text = res.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('')
    return {
      text,
      usage: {
        inTokens: res.usage.input_tokens,
        outTokens: res.usage.output_tokens,
        costUsd: 0,
      },
    }
  },

  async stream(req: StreamReq, emit) {
    const client = buildClient(req)
    const stream = client.messages.stream(
      {
        model: req.model || this.defaultModel,
        max_tokens: 4096,
        system: req.system ?? undefined,
        messages: toAnthropicMessages(req.messages),
      },
      { signal: req.signal },
    )
    for await (const evt of stream) {
      if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
        emit({ id: req.id, kind: 'delta', value: evt.delta.text })
      }
    }
    const final = await stream.finalMessage()
    return {
      inTokens: final.usage.input_tokens,
      outTokens: final.usage.output_tokens,
      costUsd: 0,
    }
  },
}
