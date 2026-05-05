import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAiProvider } from '../../electron/main/ai/openai'
import { estimateCost, type AiEvent, type AbortFlag } from '../../electron/main/ai/provider'

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

describe('OpenAiProvider.streamComplete', () => {
  it('emits delta events and a done event with usage', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":3,"completion_tokens":2}}\n',
        'data: [DONE]\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk-test', 'https://api.example.com/v1', 'openai')
    const events: AiEvent[] = []
    const cancel: AbortFlag = { cancelled: false }

    await provider.streamComplete(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      cancel
    )

    const deltas = events.filter((e) => e.kind === 'delta')
    const dones = events.filter((e) => e.kind === 'done')
    expect(deltas).toHaveLength(2)
    expect((deltas[0] as { kind: 'delta'; value: string }).value).toBe('hello')
    expect((deltas[1] as { kind: 'delta'; value: string }).value).toBe(' world')
    expect(dones).toHaveLength(1)
    const done = dones[0] as { kind: 'done'; value: { inTokens: number; outTokens: number; costUsd: number } }
    expect(done.value.inTokens).toBe(3)
    expect(done.value.outTokens).toBe(2)
    expect(done.value.costUsd).toBeCloseTo(estimateCost('openai', 'gpt-4o', 3, 2), 10)
  })

  it('trailing [DONE] with no usage → done event with 0/0 tokens', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"x"}}]}\n',
        'data: [DONE]\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      { cancelled: false }
    )
    const done = events.find((e) => e.kind === 'done') as
      | { kind: 'done'; value: { inTokens: number; outTokens: number; costUsd: number } }
      | undefined
    expect(done).toBeDefined()
    expect(done!.value.inTokens).toBe(0)
    expect(done!.value.outTokens).toBe(0)
    expect(done!.value.costUsd).toBeCloseTo(0, 10)
  })

  it('HTTP 401 throws including the body text', async () => {
    const fetchMock = vi.fn(async () => plainResponse('invalid api key', 401))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    await expect(
      provider.streamComplete(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        { cancelled: false }
      )
    ).rejects.toThrow(/401/)

    await expect(
      provider.streamComplete(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
        () => {},
        { cancelled: false }
      )
    ).rejects.toThrow(/invalid api key/)
  })

  it('cancelled stream terminates cleanly without emitting done', async () => {
    
    
    const cancel: AbortFlag = { cancelled: true }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      
      const err = new Error('aborted')
      err.name = 'AbortError'
      
      if (init?.signal?.aborted) throw err
      throw err
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    const events: AiEvent[] = []
    await expect(
      provider.streamComplete(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
        (ev) => events.push(ev),
        cancel
      )
    ).resolves.toBeUndefined()
    expect(events.find((e) => e.kind === 'done')).toBeUndefined()
  })

  it('malformed JSON in a data: line is silently skipped', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"a"}}]}\n',
        'data: not-valid-json{\n',
        'data: {"choices":[{"delta":{"content":"b"}}]}\n',
        'data: [DONE]\n',
      ])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    const events: AiEvent[] = []
    await provider.streamComplete(
      { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
      (ev) => events.push(ev),
      { cancelled: false }
    )
    const deltas = events.filter((e) => e.kind === 'delta') as Array<{
      kind: 'delta'
      value: string
    }>
    expect(deltas.map((d) => d.value)).toEqual(['a', 'b'])
    expect(events.some((e) => e.kind === 'done')).toBe(true)
  })

  it('normalizes baseUrl trailing slashes', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse(['data: [DONE]\n'])
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider(
      'sk',
      'https://api.example.com/v1/',
      'openai'
    )
    await provider.streamComplete(
      { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      { cancelled: false }
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = (fetchMock.mock.calls[0] as [string, RequestInit])[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
  })

  it('omits authorization header when apiKey is null (ollama mode)', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]\n']))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider(null, 'http://localhost:11434/v1', 'ollama')
    await provider.streamComplete(
      { model: 'llama3', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      { cancelled: false }
    )
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    expect(headers['content-type']).toBe('application/json')
  })

  it('includes authorization header when apiKey is set', async () => {
    const fetchMock = vi.fn(async () => sseResponse(['data: [DONE]\n']))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk-secret', 'https://api.example.com/v1', 'openai')
    await provider.streamComplete(
      { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] },
      () => {},
      { cancelled: false }
    )
    const init = (fetchMock.mock.calls[0] as [string, RequestInit])[1]
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-secret')
  })
})

describe('OpenAiProvider.listModels', () => {
  it('calls ${base}/models and parses {data: [{id}]} into {id, name}', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'gpt-4' }, { id: 'gpt-4o-mini' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    const models = await provider.listModels()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://api.example.com/v1/models'
    )
    expect(models).toEqual([
      { id: 'gpt-4', name: 'gpt-4' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini' },
    ])
  })

  it('throws on non-ok response with status and body', async () => {
    const fetchMock = vi.fn(async () => plainResponse('forbidden', 403))
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OpenAiProvider('sk', 'https://api.example.com/v1', 'openai')
    await expect(provider.listModels()).rejects.toThrow(/403/)
  })
})
