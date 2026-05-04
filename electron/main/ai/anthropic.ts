import {
  AbortFlag,
  AiEvent,
  AiProvider,
  CompleteRequest,
  EventSink,
  ModelInfo,
  estimateCost,
} from './provider'

const ANTHROPIC_VERSION = '2023-06-01'
const BASE = 'https://api.anthropic.com/v1'

interface JsonValue {
  [k: string]: unknown
}

export class AnthropicProvider implements AiProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async streamComplete(
    req: CompleteRequest,
    sink: EventSink,
    cancel: AbortFlag
  ): Promise<void> {
    const body: JsonValue = {
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      stream: true,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    }
    if (req.system != null) body.system = req.system
    if (req.temperature != null) body.temperature = req.temperature

    const controller = new AbortController()
    const cancelPoll = setInterval(() => {
      if (cancel.cancelled) controller.abort()
    }, 100)

    let resp: Response
    try {
      resp = await fetch(`${BASE}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      clearInterval(cancelPoll)
      if (cancel.cancelled) return
      throw new Error(`anthropic request: ${(e as Error).message}`)
    }

    if (!resp.ok) {
      clearInterval(cancelPoll)
      const text = await resp.text().catch(() => '')
      throw new Error(`anthropic ${resp.status}: ${text}`)
    }
    if (!resp.body) {
      clearInterval(cancelPoll)
      throw new Error('anthropic: empty response body')
    }

    let inTokens = 0
    let outTokens = 0
    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''

    try {
      while (true) {
        if (cancel.cancelled) {
          try {
            await reader.cancel()
          } catch {}
          return
        }
        let chunk: { done: boolean; value?: Uint8Array }
        try {
          chunk = await reader.read()
        } catch (e) {
          if (cancel.cancelled) return
          throw new Error(`read sse: ${(e as Error).message}`)
        }
        if (chunk.done) break
        if (!chunk.value) continue
        buf += decoder.decode(chunk.value, { stream: true })

        let nl: number
        // eslint-disable-next-line no-cond-assign
        while ((nl = buf.indexOf('\n')) >= 0) {
          const rawLine = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          const line = rawLine.replace(/\r$/, '')
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload.length === 0) continue
          let v: JsonValue
          try {
            v = JSON.parse(payload) as JsonValue
          } catch {
            continue
          }
          const t = typeof v.type === 'string' ? (v.type as string) : ''
          if (t === 'content_block_delta') {
            const delta = v.delta as JsonValue | undefined
            const text = delta?.text
            if (typeof text === 'string') {
              const ev: AiEvent = { kind: 'delta', value: text }
              sink(ev)
            }
          } else if (t === 'message_start') {
            const msg = v.message as JsonValue | undefined
            const u = msg?.usage as JsonValue | undefined
            if (u) {
              if (typeof u.input_tokens === 'number')
                inTokens = u.input_tokens as number
              if (typeof u.output_tokens === 'number')
                outTokens = u.output_tokens as number
            }
          } else if (t === 'message_delta') {
            const u = v.usage as JsonValue | undefined
            if (u && typeof u.output_tokens === 'number') {
              outTokens = u.output_tokens as number
            }
          } else if (t === 'message_stop') {
            const cost = estimateCost(
              'anthropic',
              req.model,
              inTokens,
              outTokens
            )
            sink({
              kind: 'done',
              value: { inTokens, outTokens, costUsd: cost },
            })
            return
          }
        }
      }
    } finally {
      clearInterval(cancelPoll)
    }

    const cost = estimateCost('anthropic', req.model, inTokens, outTokens)
    sink({ kind: 'done', value: { inTokens, outTokens, costUsd: cost } })
  }

  async listModels(): Promise<ModelInfo[]> {
    const resp = await fetch(`${BASE}/models`, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`anthropic models ${resp.status}: ${text}`)
    }
    const parsed = (await resp.json()) as {
      data: Array<{ id: string; display_name?: string }>
    }
    return parsed.data.map((m) => ({
      id: m.id,
      name: m.display_name ?? m.id,
    }))
  }
}
