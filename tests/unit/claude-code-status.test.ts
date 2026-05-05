import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { PtySession } from '../../electron/main/sessions'


let pidtreeQueue: number[][] = []
let pidtreeCallCount = 0
const commNames = new Map<number, string>()

interface LoadedModules {
  statusFor: (
    tabId: number
  ) => Promise<{
    state: 'none' | 'idle' | 'thinking' | 'awaitingInput'
    running: boolean
    binary: string | null
    lastActivityMs: number | null
  }>
  SESSIONS: Map<number, PtySession>
  RingBuffer: typeof import('../../electron/main/sessions').RingBuffer
}

async function loadModules(): Promise<LoadedModules> {
  vi.resetModules()
  pidtreeCallCount = 0

  vi.doMock('pidtree', () => {
    const fn = async (_pid: number, _opts?: { root?: boolean }): Promise<number[]> => {
      pidtreeCallCount++
      const next = pidtreeQueue.shift()
      if (next === undefined) return []
      return next
    }
    return { default: fn }
  })

  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    return {
      ...actual,
      promises: {
        ...actual.promises,
        readFile: async (p: unknown, _enc?: unknown): Promise<string> => {
          const s = String(p)
          
          const m = s.match(/^\/proc\/(\d+)\/comm$/)
          if (m) {
            const pid = Number(m[1])
            const name = commNames.get(pid)
            if (name == null) throw new Error('ENOENT')
            return name + '\n'
          }
          
          return actual.promises.readFile(p as string, _enc as never) as Promise<string>
        },
      },
    }
  })

  const sessions = await import('../../electron/main/sessions')
  const cc = await import('../../electron/main/claude-code')
  return {
    statusFor: cc.statusFor,
    SESSIONS: sessions.SESSIONS,
    RingBuffer: sessions.RingBuffer,
  }
}

function makeSession(
  RingBuffer: typeof import('../../electron/main/sessions').RingBuffer,
  over: { id: number; pid: number; lastActivityMs: number; tail?: string }
): PtySession {
  const rb = new RingBuffer()
  if (over.tail != null) rb.push(Buffer.from(over.tail, 'utf8'))
  return {
    id: over.id,
    pid: over.pid,
    pty: { write: () => {} } as never,
    ringBuffer: rb,
    lastActivityMs: over.lastActivityMs,
    shell: 'sh',
  }
}

describe('claude-code statusFor', () => {
  beforeEach(() => {
    pidtreeQueue = []
    pidtreeCallCount = 0
    commNames.clear()
  })

  afterEach(() => {
    vi.doUnmock('pidtree')
    vi.doUnmock('node:fs')
  })

  it('no session for tabId → state:none, all nulls', async () => {
    const { statusFor } = await loadModules()
    const res = await statusFor(42)
    expect(res).toEqual({
      state: 'none',
      running: false,
      binary: null,
      lastActivityMs: null,
    })
  })

  it('session exists, no descendants → state:none with lastActivityMs', async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    const ts = Date.now() - 5000
    SESSIONS.set(
      1,
      makeSession(RingBuffer, { id: 1, pid: 100, lastActivityMs: ts })
    )
    pidtreeQueue.push([])
    const res = await statusFor(1)
    expect(res.state).toBe('none')
    expect(res.running).toBe(false)
    expect(res.binary).toBeNull()
    
    
    expect(res.lastActivityMs).toBe(ts)
  })

  it('descendants exist but none are claude → state:none', async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, { id: 1, pid: 100, lastActivityMs: 99 })
    )
    pidtreeQueue.push([200, 201])
    commNames.set(200, 'bash')
    commNames.set(201, 'vim')
    const res = await statusFor(1)
    expect(res.state).toBe('none')
    expect(res.binary).toBeNull()
    expect(res.running).toBe(false)
  })

  it('claude descendant + empty tail + activity > 600 ms ago → state:idle', async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    const ts = Date.now() - 5000
    SESSIONS.set(
      1,
      makeSession(RingBuffer, { id: 1, pid: 100, lastActivityMs: ts })
    )
    pidtreeQueue.push([200, 201])
    commNames.set(200, 'node')
    commNames.set(201, 'claude')
    const res = await statusFor(1)
    expect(res.state).toBe('idle')
    expect(res.binary).toBe('claude')
    expect(res.running).toBe(true)
    
    expect(res.lastActivityMs).toBeGreaterThanOrEqual(4000)
    expect(res.lastActivityMs).toBeLessThan(7000)
  })

  it("tail contains 'do you want' → state:awaitingInput", async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, {
        id: 1,
        pid: 100,
        lastActivityMs: 99999,
        tail: 'some output\ndo you want to continue?',
      })
    )
    pidtreeQueue.push([300])
    commNames.set(300, 'claude')
    const res = await statusFor(1)
    expect(res.state).toBe('awaitingInput')
    expect(res.binary).toBe('claude')
  })

  it("tail contains 'esc to interrupt' → state:thinking", async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, {
        id: 1,
        pid: 100,
        lastActivityMs: 99999,
        tail: 'thinking... esc to interrupt',
      })
    )
    pidtreeQueue.push([300])
    commNames.set(300, 'claude-code')
    const res = await statusFor(1)
    expect(res.state).toBe('thinking')
    expect(res.binary).toBe('claude-code')
  })

  it('empty tail + activity < 600 ms ago → state:thinking (recently active)', async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, {
        id: 1,
        pid: 100,
        lastActivityMs: Date.now() - 100,
      })
    )
    pidtreeQueue.push([300])
    commNames.set(300, 'claude')
    const res = await statusFor(1)
    expect(res.state).toBe('thinking')
    expect(res.binary).toBe('claude')
  })

  it('regression: large absolute lastActivityMs no longer wrongly classified as thinking', async () => {
    
    
    
    
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, {
        id: 1,
        pid: 100,
        lastActivityMs: Date.now() - 60_000,
      })
    )
    pidtreeQueue.push([300])
    commNames.set(300, 'claude')
    const res = await statusFor(1)
    expect(res.state).toBe('idle')
  })

  it('cache: two consecutive calls within 1500ms invoke pidtree only once', async () => {
    const { statusFor, SESSIONS, RingBuffer } = await loadModules()
    SESSIONS.set(
      1,
      makeSession(RingBuffer, { id: 1, pid: 100, lastActivityMs: 99999 })
    )
    pidtreeQueue.push([300])
    commNames.set(300, 'claude')
    await statusFor(1)
    await statusFor(1)
    expect(pidtreeCallCount).toBe(1)
  })

  it(
    'cache: after 1500ms, another call re-invokes pidtree',
    { timeout: 5000 },
    async () => {
      const { statusFor, SESSIONS, RingBuffer } = await loadModules()
      SESSIONS.set(
        1,
        makeSession(RingBuffer, { id: 1, pid: 100, lastActivityMs: 99999 })
      )
      
      pidtreeQueue.push([300])
      pidtreeQueue.push([300])
      commNames.set(300, 'claude')

      await statusFor(1)
      expect(pidtreeCallCount).toBe(1)

      await new Promise((r) => setTimeout(r, 1600))

      await statusFor(1)
      expect(pidtreeCallCount).toBe(2)
    }
  )
})
