import {
  AbortFlag,
  AiProvider,
  CompleteRequest,
  EventSink,
  ModelInfo,
  estimateCost,
} from './provider'

interface JsonValue {
  [k: string]: unknown
}

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
    cancel: AbortFlag
  ): Promise<void> {
    const messages: Array<{ role: string; content: string }> = []
    if (req.system != null) {
      messages.push({ role: 'system', content: req.system })
    }
    for (const m of req.messages) {
      messages.push({ role: m.role, content: m.content })
    }
    const body: JsonValue = {
      model: req.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }
    if (req.temperature != null) body.temperature = req.temperature
    if (req.maxTokens != null) body.max_tokens = req.maxTokens

    const controller = new AbortController()
    const cancelPoll = setInterval(() => {
      if (cancel.cancelled) controller.abort()
    }, 100)

    let resp: Response
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...this.headers(), accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      clearInterval(cancelPoll)
      if (cancel.cancelled) return
      throw new Error(`${this.costLabel}-compat request: ${(e as Error).message}`)
    }

    if (!resp.ok) {
      clearInterval(cancelPoll)
      const text = await resp.text().catch(() => '')
      throw new Error(`${this.costLabel} ${resp.status}: ${text}`)
    }
    if (!resp.body) {
      clearInterval(cancelPoll)
      throw new Error(`${this.costLabel}: empty response body`)
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
          if (payload === '[DONE]') {
            const cost = estimateCost(
              this.costLabel,
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
          let v: JsonValue
          try {
            v = JSON.parse(payload) as JsonValue
          } catch {
            continue
          }
          const choices = v.choices as Array<JsonValue> | undefined
          if (Array.isArray(choices)) {
            for (const choice of choices) {
              const delta = choice.delta as JsonValue | undefined
              const text = delta?.content
              if (typeof text === 'string' && text.length > 0) {
                sink({ kind: 'delta', value: text })
              }
            }
          }
          const u = v.usage as JsonValue | undefined
          if (u) {
            if (typeof u.prompt_tokens === 'number')
              inTokens = u.prompt_tokens as number
            if (typeof u.completion_tokens === 'number')
              outTokens = u.completion_tokens as number
          }
        }
      }
    } finally {
      clearInterval(cancelPoll)
    }

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
