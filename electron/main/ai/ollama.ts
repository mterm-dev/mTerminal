import {
  AiProvider,
  CompleteRequest,
  EventSink,
  JsonValue,
  ModelInfo,
} from './provider'

const DEFAULT_NUM_CTX = 16384

export class OllamaProvider implements AiProvider {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
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

    const options: { [k: string]: JsonValue } = { num_ctx: DEFAULT_NUM_CTX }
    if (req.temperature != null) options.temperature = req.temperature
    if (req.topP != null) options.top_p = req.topP
    if (req.maxTokens != null) options.num_predict = req.maxTokens

    const body: { [k: string]: JsonValue } = {
      model: req.model,
      messages,
      stream: true,
      think: false,
      options,
    }

    const thinkFilter = createThinkTagFilter()

    let resp: Response
    try {
      resp = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (e) {
      if (signal.aborted) return
      throw new Error(
        `ollama request: ${e instanceof Error ? e.message : String(e)}`
      )
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`ollama ${resp.status}: ${text}`)
    }
    if (!resp.body) {
      throw new Error('ollama: empty response body')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buf = ''
    let inTokens = 0
    let outTokens = 0

    while (true) {
      if (signal.aborted) {
        try { await reader.cancel() } catch {}
        return
      }
      let chunk: { done: boolean; value?: Uint8Array }
      try {
        chunk = await reader.read()
      } catch (e) {
        if (signal.aborted) return
        throw new Error(
          `ollama read: ${e instanceof Error ? e.message : String(e)}`
        )
      }
      if (chunk.done) break
      if (!chunk.value) continue
      buf += decoder.decode(chunk.value, { stream: true })

      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '').trim()
        buf = buf.slice(nl + 1)
        if (line.length === 0) continue
        let v: { [k: string]: JsonValue }
        try {
          v = JSON.parse(line) as { [k: string]: JsonValue }
        } catch {
          continue
        }
        const msg = v.message as { [k: string]: JsonValue } | undefined
        const text = msg?.content
        if (typeof text === 'string' && text.length > 0) {
          const filtered = thinkFilter.feed(text)
          if (filtered.length > 0) sink({ kind: 'delta', value: filtered })
        }
        if (typeof v.prompt_eval_count === 'number') {
          inTokens = v.prompt_eval_count as number
        }
        if (typeof v.eval_count === 'number') {
          outTokens = v.eval_count as number
        }
        if (v.done === true) {
          const tail = thinkFilter.flush()
          if (tail.length > 0) sink({ kind: 'delta', value: tail })
          sink({ kind: 'done', value: { inTokens, outTokens, costUsd: 0 } })
          return
        }
      }
    }

    const tail = thinkFilter.flush()
    if (tail.length > 0) sink({ kind: 'delta', value: tail })
    sink({ kind: 'done', value: { inTokens, outTokens, costUsd: 0 } })
  }

  async listModels(): Promise<ModelInfo[]> {
    const resp = await fetch(`${this.baseUrl}/api/tags`)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`ollama models ${resp.status}: ${text}`)
    }
    const parsed = (await resp.json()) as {
      models: Array<{ name: string; model?: string }>
    }
    return parsed.models.map((m) => {
      const id = m.model ?? m.name
      return { id, name: m.name }
    })
  }
}

const OPEN = '<think>'
const CLOSE = '</think>'

function createThinkTagFilter(): {
  feed: (chunk: string) => string
  flush: () => string
} {
  let buf = ''
  let inThink = false
  return {
    feed(chunk: string): string {
      buf += chunk
      let out = ''
      while (true) {
        if (inThink) {
          const close = buf.indexOf(CLOSE)
          if (close === -1) {
            if (buf.length > CLOSE.length) buf = buf.slice(-CLOSE.length)
            return out
          }
          buf = buf.slice(close + CLOSE.length)
          inThink = false
        } else {
          const open = buf.indexOf(OPEN)
          if (open === -1) {
            if (buf.length > OPEN.length) {
              out += buf.slice(0, buf.length - OPEN.length)
              buf = buf.slice(-OPEN.length)
            }
            return out
          }
          out += buf.slice(0, open)
          buf = buf.slice(open + OPEN.length)
          inThink = true
        }
      }
    },
    flush(): string {
      if (inThink) {
        buf = ''
        return ''
      }
      const out = buf
      buf = ''
      return out
    },
  }
}
