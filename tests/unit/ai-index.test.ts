import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const TEST_TIMEOUT = 30000

let currentInvoke: (channel: string, ...args: unknown[]) => unknown = () => {
  throw new Error('mock not loaded yet')
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await currentInvoke(channel, ...args)
}

function freshTmpDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-${prefix}-test-${process.pid}-${crypto.randomUUID()}`
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

interface SentEvent {
  channel: string
  payload: unknown
}

interface AnthropicCtorCall {
  apiKey: string
}
interface OpenAiCtorCall {
  apiKey: string | null
  baseUrl: string
  costLabel: string
}

interface LoadedModules {
  sentEvents: SentEvent[]
  anthropicCalls: AnthropicCtorCall[]
  openAiCalls: OpenAiCtorCall[]
  setProviderBehavior: (b: ProviderBehavior) => void
}

interface ProviderBehavior {
  stream?: (sink: (ev: unknown) => void, signal: AbortSignal) => Promise<void>
  models?: Array<{ id: string; name: string }>
}

let cfgDir: string

async function loadModules(): Promise<LoadedModules> {
  vi.resetModules()

  
  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  currentInvoke = electronMock.__invoke

  const sentEvents: SentEvent[] = []
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload })
      },
    },
  }

  
  vi.doMock('../../electron/main/sessions', () => ({
    getMainWindow: () => fakeWindow,
  }))

  const anthropicCalls: AnthropicCtorCall[] = []
  const openAiCalls: OpenAiCtorCall[] = []
  let providerBehavior: ProviderBehavior = {
    stream: async (sink) => {
      sink({ kind: 'delta', value: 'x' })
      sink({ kind: 'done', value: { inTokens: 0, outTokens: 0, costUsd: 0 } })
    },
    models: [{ id: 'm', name: 'M' }],
  }

  vi.doMock('../../electron/main/ai/anthropic', () => {
    class AnthropicProvider {
      constructor(apiKey: string) {
        anthropicCalls.push({ apiKey })
      }
      async streamComplete(
        _req: unknown,
        sink: (ev: unknown) => void,
        signal: AbortSignal
      ): Promise<void> {
        if (providerBehavior.stream) {
          await providerBehavior.stream(sink, signal)
        }
      }
      async listModels(): Promise<Array<{ id: string; name: string }>> {
        return providerBehavior.models ?? []
      }
    }
    return { AnthropicProvider }
  })

  vi.doMock('../../electron/main/ai/openai', () => {
    class OpenAiProvider {
      constructor(apiKey: string | null, baseUrl: string, costLabel: string) {
        openAiCalls.push({ apiKey, baseUrl, costLabel })
      }
      async streamComplete(
        _req: unknown,
        sink: (ev: unknown) => void,
        signal: AbortSignal
      ): Promise<void> {
        if (providerBehavior.stream) {
          await providerBehavior.stream(sink, signal)
        }
      }
      async listModels(): Promise<Array<{ id: string; name: string }>> {
        return providerBehavior.models ?? []
      }
    }
    return { OpenAiProvider }
  })

  const vault = await import('../../electron/main/vault')
  const ai = await import('../../electron/main/ai/index')
  vault.registerVaultHandlers()
  ai.registerAiHandlers()

  return {
    sentEvents,
    anthropicCalls,
    openAiCalls,
    setProviderBehavior: (b: ProviderBehavior) => {
      providerBehavior = b
    },
  }
}


async function waitForEvent(
  sentEvents: SentEvent[],
  channel: string,
  timeoutMs = 1000
): Promise<SentEvent> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ev = sentEvents.find((e) => e.channel === channel)
    if (ev) return ev
    await new Promise((r) => setImmediate(r))
  }
  throw new Error(`timeout waiting for event on ${channel}`)
}

async function waitForAllEvents(
  sentEvents: SentEvent[],
  channel: string,
  count: number,
  timeoutMs = 1000
): Promise<SentEvent[]> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const evs = sentEvents.filter((e) => e.channel === channel)
    if (evs.length >= count) return evs
    await new Promise((r) => setImmediate(r))
  }
  throw new Error(
    `timeout waiting for ${count} events on ${channel} (got ${sentEvents.filter((e) => e.channel === channel).length})`
  )
}

describe('ai/index IPC handlers', () => {
  beforeEach(() => {
    cfgDir = freshTmpDir('ai-index')
    process.env.XDG_CONFIG_HOME = cfgDir
  })

  afterEach(() => {
    vi.doUnmock('../../electron/main/sessions')
    vi.doUnmock('../../electron/main/ai/anthropic')
    vi.doUnmock('../../electron/main/ai/openai')
    try {
      fs.rmSync(cfgDir, { recursive: true, force: true })
    } catch {
      
    }
  })

  it('ai:stream-complete with anthropic + locked vault → emits error', async () => {
    const { sentEvents } = await loadModules()
    const taskId = (await invoke('ai:stream-complete', {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      messages: [{ role: 'user', content: 'hi' }],
    })) as number
    expect(typeof taskId).toBe('number')
    const ev = await waitForEvent(sentEvents, 'ai:event:' + taskId)
    expect(ev.payload).toEqual({
      kind: 'error',
      value: 'vault locked — unlock to use anthropic',
    })
  })

  it(
    'ai:stream-complete with anthropic + unlocked + no key → emits "api key not set" error',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { sentEvents } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      const taskId = (await invoke('ai:stream-complete', {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'hi' }],
      })) as number
      const ev = await waitForEvent(sentEvents, 'ai:event:' + taskId)
      expect(ev.payload).toEqual({
        kind: 'error',
        value: 'anthropic api key not set — open settings → ai',
      })
    }
  )

  it(
    'ai:stream-complete with anthropic + key set → emits delta then done',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { sentEvents, anthropicCalls } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('ai:set-key', { provider: 'anthropic', key: 'sk-ant-xxx' })
      const taskId = (await invoke('ai:stream-complete', {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        messages: [{ role: 'user', content: 'hi' }],
      })) as number
      const evs = await waitForAllEvents(sentEvents, 'ai:event:' + taskId, 2)
      expect(evs[0]!.payload).toEqual({ kind: 'delta', value: 'x' })
      expect(evs[1]!.payload).toEqual({
        kind: 'done',
        value: { inTokens: 0, outTokens: 0, costUsd: 0 },
      })
      expect(anthropicCalls).toHaveLength(1)
      expect(anthropicCalls[0]!.apiKey).toBe('sk-ant-xxx')
    }
  )

  it(
    'ai:stream-complete with openai uses default baseUrl, override respected',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { openAiCalls } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('ai:set-key', { provider: 'openai', key: 'sk-o' })

      
      await invoke('ai:stream-complete', {
        provider: 'openai',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
      })
      
      await invoke('ai:stream-complete', {
        provider: 'openai',
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hi' }],
        baseUrl: 'https://custom.example/v1',
      })
      expect(openAiCalls).toHaveLength(2)
      expect(openAiCalls[0]!.baseUrl).toBe('https://api.openai.com/v1')
      expect(openAiCalls[0]!.costLabel).toBe('openai')
      expect(openAiCalls[0]!.apiKey).toBe('sk-o')
      expect(openAiCalls[1]!.baseUrl).toBe('https://custom.example/v1')
    }
  )

  it('ai:stream-complete with unknown provider → emits error', async () => {
    const { sentEvents } = await loadModules()
    const taskId = (await invoke('ai:stream-complete', {
      provider: 'bogus',
      model: 'm',
      messages: [],
    })) as number
    const ev = await waitForEvent(sentEvents, 'ai:event:' + taskId)
    expect(ev.payload).toEqual({
      kind: 'error',
      value: 'unknown provider: bogus',
    })
  })

  it('ai:cancel for unknown taskId is a no-op', async () => {
    await loadModules()
    await expect(
      invoke('ai:cancel', { taskId: 99999 })
    ).resolves.not.toThrow()
  })

  it(
    'ai:set-key writes through to vault and is retrievable via ai:has-key',
    { timeout: TEST_TIMEOUT },
    async () => {
      await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(false)

      await invoke('ai:set-key', { provider: 'anthropic', key: 'sk-ant-zzz' })
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(true)
    }
  )

  it(
    'ai:has-key always true for ollama, false for anthropic when locked, true after set+unlocked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await loadModules()
      
      expect(await invoke('ai:has-key', { provider: 'ollama' })).toBe(true)
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(false)

      await invoke('vault:init', { masterPassword: 'pw' })
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(false)
      await invoke('ai:set-key', { provider: 'anthropic', key: 'k' })
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(true)

      await invoke('vault:lock')
      
      expect(await invoke('ai:has-key', { provider: 'ollama' })).toBe(true)
      expect(await invoke('ai:has-key', { provider: 'anthropic' })).toBe(false)
    }
  )
})
