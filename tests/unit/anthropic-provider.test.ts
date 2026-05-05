import { describe, it, expect, vi, afterEach } from 'vitest'
import { AnthropicProvider } from '../../electron/main/ai/anthropic'
import { estimateCost, type AiEvent } from '../../electron/main/ai/provider'

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function plainResponse(text: string, status = 200): Response {
  return new Response(text, { status })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

type DeltaEv = { kind: 'delta'; value: string }
type DoneEv = { kind: 'done'; value: { inTokens: number; outTokens: number; costUsd: number } }

describe('AnthropicProvider.streamComplete', () => {
  it('emits delta events and a done event with usage on full happy path', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0}}}\n',
        'data: {"type":"content_block_delta","delta":{"text":"hello"}}\n',
        'data: {"type":"content_block_delta","delta":{"text":" world"}}\n',
        'data: {"type":"message_delta","usage":{"output_tokens":8}}\n',
        'data: {"type":"message_stop"}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant-test')
    const events: AiEvent[] = []
    const signal = new AbortController().signal

    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      signal
    )

    const deltas = events.filter((e) => e.kind === 'delta') as DeltaEv[]
    const dones = events.filter((e) => e.kind === 'done') as DoneEv[]
    expect(deltas).toHaveLength(2)
    expect(deltas[0].value).toBe('hello')
    expect(deltas[1].value).toBe(' world')
    expect(deltas.map((d) => d.value).join('')).toBe('hello world')
    expect(dones).toHaveLength(1)
    expect(dones[0].value.inTokens).toBe(5)
    expect(dones[0].value.outTokens).toBe(8)
    expect(dones[0].value.costUsd).toBeCloseTo(
      estimateCost('anthropic', 'claude-sonnet-4', 5, 8),
      10
    )
  })

  it('falls through to post-loop done when stream ends without message_stop', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"type":"message_start","message":{"usage":{"input_tokens":3,"output_tokens":0}}}\n',
        'data: {"type":"content_block_delta","delta":{"text":"x"}}\n',
        'data: {"type":"message_delta","usage":{"output_tokens":4}}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'claude-haiku-3', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      new AbortController().signal
    )
    const dones = events.filter((e) => e.kind === 'done') as DoneEv[]
    expect(dones).toHaveLength(1)
    expect(dones[0].value.inTokens).toBe(3)
    expect(dones[0].value.outTokens).toBe(4)
    expect(dones[0].value.costUsd).toBeCloseTo(
      estimateCost('anthropic', 'claude-haiku-3', 3, 4),
      10
    )
  })

  it('HTTP 401 throws including the body text and "anthropic" label', async () => {
    const fetchMock = vi.fn(async () => plainResponse('invalid api key', 401))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    await expect(
      provider.streamComplete(
        { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        new AbortController().signal
      )
    ).rejects.toThrow(/anthropic/)

    await expect(
      provider.streamComplete(
        { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        new AbortController().signal
      )
    ).rejects.toThrow(/401/)

    await expect(
      provider.streamComplete(
        { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        new AbortController().signal
      )
    ).rejects.toThrow(/invalid api key/)
  })

  it('throws "anthropic: empty response body" when resp.body is null', async () => {
    const fetchMock = vi.fn(async () => {
      const resp = new Response('', { status: 200 })
      Object.defineProperty(resp, 'body', { value: null, configurable: true })
      return resp
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    await expect(
      provider.streamComplete(
        { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        new AbortController().signal
      )
    ).rejects.toThrow(/anthropic: empty response body/)
  })

  it('malformed JSON in a data: line is silently skipped; valid lines still produce deltas', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"text":"a"}}\n',
        'data: not-valid-json{\n',
        'data: {"type":"content_block_delta","delta":{"text":"b"}}\n',
        'data: {"type":"message_stop"}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      new AbortController().signal
    )
    const deltas = events.filter((e) => e.kind === 'delta') as DeltaEv[]
    expect(deltas.map((d) => d.value)).toEqual(['a', 'b'])
    expect(events.some((e) => e.kind === 'done')).toBe(true)
  })

  it('empty data line is skipped', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: \n',
        'data: {"type":"content_block_delta","delta":{"text":"ok"}}\n',
        'data: {"type":"message_stop"}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      new AbortController().signal
    )
    const deltas = events.filter((e) => e.kind === 'delta') as DeltaEv[]
    expect(deltas).toHaveLength(1)
    expect(deltas[0].value).toBe('ok')
  })

  it('ignores ping / content_block_start / content_block_stop event types', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"type":"ping"}\n',
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
        'data: {"type":"content_block_delta","delta":{"text":"hi"}}\n',
        'data: {"type":"content_block_stop","index":0}\n',
        'data: {"type":"message_stop"}\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      new AbortController().signal
    )
    const deltas = events.filter((e) => e.kind === 'delta') as DeltaEv[]
    expect(deltas).toHaveLength(1)
    expect(deltas[0].value).toBe('hi')
    expect(events.filter((e) => e.kind === 'done')).toHaveLength(1)
  })

  it('cancelled stream terminates cleanly without emitting done', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      if (init?.signal?.aborted) throw err
      throw err
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const events: AiEvent[] = []
    await expect(
      provider.streamComplete(
        { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
        (ev) => events.push(ev),
        controller.signal
      )
    ).resolves.toBeUndefined()
    expect(events.find((e) => e.kind === 'done')).toBeUndefined()
  })

  it('sends the correct Anthropic headers', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(['data: {"type":"message_stop"}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant-secret')
    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      new AbortController().signal
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages')
    const headers = call[1].headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-secret')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['content-type']).toBe('application/json')
    expect(headers.accept).toBe('text/event-stream')
  })

  it('body includes model, default max_tokens=4096, stream=true, messages; omits system/temperature when unset', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(['data: {"type":"message_stop"}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    await provider.streamComplete(
      { model: 'claude-sonnet-4', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      new AbortController().signal
    )
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    const body = JSON.parse(init.body as string)
    expect(body.model).toBe('claude-sonnet-4')
    expect(body.max_tokens).toBe(4096)
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
    expect(body.system).toBeUndefined()
    expect(body.temperature).toBeUndefined()
  })

  it('body includes system and temperature only when provided; honors maxTokens override', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(['data: {"type":"message_stop"}\n'])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    await provider.streamComplete(
      {
        model: 'claude-opus-4',
        messages: [{ role: 'user', content: 'hi' }],
        system: 'you are helpful',
        temperature: 0.7,
        maxTokens: 2048,
      },
      () => {},
      new AbortController().signal
    )
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    const body = JSON.parse(init.body as string)
    expect(body.system).toBe('you are helpful')
    expect(body.temperature).toBe(0.7)
    expect(body.max_tokens).toBe(2048)
  })
})

describe('AnthropicProvider.listModels', () => {
  it('uses display_name when present, else id', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'claude-sonnet-4', display_name: 'Claude Sonnet 4' },
              { id: 'claude-haiku-3' },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    const models = await provider.listModels()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://api.anthropic.com/v1/models'
    )
    expect(models).toEqual([
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'claude-haiku-3', name: 'claude-haiku-3' },
    ])
  })

  it('throws on non-ok response with status and body', async () => {
    const fetchMock = vi.fn(async () => plainResponse('forbidden', 403))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('sk-ant')
    await expect(provider.listModels()).rejects.toThrow(/403/)
  })
})
