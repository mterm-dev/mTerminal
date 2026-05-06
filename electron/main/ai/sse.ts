import { JsonValue } from './provider'

export type SseEvent =
  | { kind: 'data'; payload: string }
  | { kind: 'json'; value: { [k: string]: JsonValue } }

export interface ConsumeSseOptions {
  body: ReadableStream<Uint8Array>
  signal: AbortSignal
  /**
   * Called for each parsed `data:` line. Return `true` to stop consumption (e.g. on `[DONE]`).
   * If the payload is valid JSON, `event.kind === 'json'`. Otherwise (e.g. `[DONE]`), `event.kind === 'data'`.
   */
  onEvent: (event: SseEvent) => boolean | void
  /** Wraps low-level read errors with provider-specific context. */
  errorPrefix: string
}

export async function consumeServerSentEvents(opts: ConsumeSseOptions): Promise<void> {
  const { body, signal, onEvent, errorPrefix } = opts
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
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
      throw new Error(`${errorPrefix}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (chunk.done) return
    if (!chunk.value) continue
    buf += decoder.decode(chunk.value, { stream: true })

    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const rawLine = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      const line = rawLine.replace(/\r$/, '')
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6)
      if (payload.length === 0) continue
      let event: SseEvent
      try {
        event = { kind: 'json', value: JSON.parse(payload) as { [k: string]: JsonValue } }
      } catch {
        event = { kind: 'data', payload }
      }
      if (onEvent(event) === true) return
    }
  }
}
