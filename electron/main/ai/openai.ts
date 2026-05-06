import {
  AiProvider,
  CompleteRequest,
  EventSink,
  JsonValue,
  ModelInfo,
  estimateCost,
} from './provider'
import { consumeServerSentEvents } from './sse'

export class OpenAiProvider implements AiProvider {
  private apiKey: string | null
  private baseUrl: string
  private costLabel: string

  constructor(apiKey: string | null, baseUrl: string, costLabel: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.costLabel = costLabel
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey && this.apiKey.length > 0) {
      h['authorization'] = `Bearer ${this.apiKey}`
    }
    return h
  }

  async streamComplete(
    req: CompleteRequest,
    sink: EventSink,
    signal: AbortSignal
  ): Promise<void> {
    const messages: Array<{ role: string; content: string }> = []
    if (req.system != null) {
      messages.push({ role: 'system', content: req.system })
    }
    for (const m of req.messages) {
      messages.push({ role: m.role, content: m.content })
    }
    const body: { [k: string]: JsonValue } = {
      model: req.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (req.temperature != null) body.temperature = req.temperature
    if (req.maxTokens != null) body.max_tokens = req.maxTokens

    let resp: Response
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...this.headers(), accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (e) {
      if (signal.aborted) return
      throw new Error(`${this.costLabel}-compat request: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`${this.costLabel} ${resp.status}: ${text}`)
    }
    if (!resp.body) {
      throw new Error(`${this.costLabel}: empty response body`)
    }

    let inTokens = 0
    let outTokens = 0
    let stopped = false

    await consumeServerSentEvents({
      body: resp.body,
      signal,
      errorPrefix: 'read sse',
      onEvent: (event) => {
        if (event.kind === 'data') {
          if (event.payload === '[DONE]') {
            const cost = estimateCost(this.costLabel, req.model, inTokens, outTokens)
            sink({ kind: 'done', value: { inTokens, outTokens, costUsd: cost } })
            stopped = true
            return true
          }
          return
        }
        const v = event.value
        const choices = v.choices as Array<{ [k: string]: JsonValue }> | undefined
        if (Array.isArray(choices)) {
          for (const choice of choices) {
            const delta = choice.delta as { [k: string]: JsonValue } | undefined
            const text = delta?.content
            if (typeof text === 'string' && text.length > 0) {
              sink({ kind: 'delta', value: text })
            }
          }
        }
        const u = v.usage as { [k: string]: JsonValue } | undefined
        if (u) {
          if (typeof u.prompt_tokens === 'number') inTokens = u.prompt_tokens as number
          if (typeof u.completion_tokens === 'number') outTokens = u.completion_tokens as number
        }
      },
    })

    if (stopped) return
    const cost = estimateCost(this.costLabel, req.model, inTokens, outTokens)
    sink({ kind: 'done', value: { inTokens, outTokens, costUsd: cost } })
  }

  async listModels(): Promise<ModelInfo[]> {
    const resp = await fetch(`${this.baseUrl}/models`, {
      headers: this.headers(),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`${this.costLabel} models ${resp.status}: ${text}`)
    }
    const parsed = (await resp.json()) as { data: Array<{ id: string }> }
    return parsed.data.map((m) => ({ id: m.id, name: m.id }))
  }
}
