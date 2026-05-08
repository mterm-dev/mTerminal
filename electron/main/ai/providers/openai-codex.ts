import { Codex } from '@openai/codex-sdk'
import { getAiKey } from '../vault-keys'
import type { CompleteReq, ModelInfo, Provider, ResolveOptions, StreamReq } from '../types'

const STATIC_MODELS: ModelInfo[] = [
  { id: 'gpt-5-codex', name: 'GPT-5 Codex' },
  { id: 'gpt-5', name: 'GPT-5' },
  { id: 'gpt-4.1', name: 'GPT-4.1' },
]

let cachedClient: Codex | null = null
let cachedKey = ''

function buildClient(opts: ResolveOptions): Codex {
  const apiKey = opts.apiKey ?? getAiKey('openai-codex') ?? ''
  if (!apiKey) {
    throw new Error('OpenAI Codex API key not set. Open Settings → AI to add one.')
  }
  if (opts.apiKey || opts.baseUrl) {
    return new Codex({ apiKey, baseUrl: opts.baseUrl || undefined })
  }
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Codex({ apiKey })
    cachedKey = apiKey
  }
  return cachedClient
}

/**
 * Codex is agentic and stateless from our side — every call starts a new
 * thread. Multi-turn chats fold prior assistant + user turns into the system
 * prompt; the latest user message is sent as the actual `Input`. This loses
 * Codex's native thread continuation for now (could persist `thread.id`
 * later) but keeps the wire shape compatible with the other providers.
 */
function buildInput(req: CompleteReq | StreamReq): { input: string; system: string } {
  const turns = req.messages
  let lastUser = ''
  const history: string[] = []
  for (const m of turns) {
    if (m.role === 'user') {
      if (lastUser) history.push('User: ' + lastUser)
      lastUser = m.content
    } else if (m.role === 'assistant') {
      history.push('Assistant: ' + m.content)
    }
  }
  const sys = [req.system ?? '', history.length ? '\n\n[Conversation so far]\n' + history.join('\n') : '']
    .filter(Boolean)
    .join('')
  return { input: lastUser || (turns[turns.length - 1]?.content ?? ''), system: sys }
}

export const codexProvider: Provider = {
  id: 'openai-codex',
  label: 'OpenAI Codex',
  requiresVault: true,
  vaultKeyPath: 'ai_keys.openai-codex',
  defaultModel: 'gpt-5-codex',

  async listModels() {
    return STATIC_MODELS
  },

  async complete(req: CompleteReq) {
    const client = buildClient(req)
    const { input } = buildInput(req)
    const thread = client.startThread({ model: req.model || this.defaultModel, skipGitRepoCheck: true })
    const turn = await thread.run(input, { signal: req.signal })
    return {
      text: turn.finalResponse ?? '',
      usage: {
        inTokens: turn.usage?.input_tokens ?? 0,
        outTokens: turn.usage?.output_tokens ?? 0,
        costUsd: 0,
      },
    }
  },

  async stream(req: StreamReq, emit) {
    const client = buildClient(req)
    const { input } = buildInput(req)
    const thread = client.startThread({ model: req.model || this.defaultModel, skipGitRepoCheck: true })
    const streamed = await thread.runStreamed(input, { signal: req.signal })
    let lastEmittedLen = 0
    let finalText = ''
    let inTokens = 0
    let outTokens = 0
    for await (const evt of streamed.events) {
      if (evt.type === 'item.completed' && evt.item.type === 'agent_message') {
        finalText = evt.item.text
        const delta = finalText.slice(lastEmittedLen)
        if (delta) emit({ id: req.id, kind: 'delta', value: delta })
        lastEmittedLen = finalText.length
      } else if (evt.type === 'item.updated' && evt.item.type === 'agent_message') {
        const next = evt.item.text
        const delta = next.slice(lastEmittedLen)
        if (delta) {
          emit({ id: req.id, kind: 'delta', value: delta })
          lastEmittedLen = next.length
        }
      } else if (evt.type === 'turn.completed' && evt.usage) {
        inTokens = evt.usage.input_tokens
        outTokens = evt.usage.output_tokens
      }
    }
    return { inTokens, outTokens, costUsd: 0 }
  },
}
