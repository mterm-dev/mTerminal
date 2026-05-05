import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  RingBuffer,
  RING_CAPACITY,
  SESSIONS,
  nextId,
  sessionOutput,
  sessionPid,
  sessionWrite,
  sessionLastActivityMs,
  listSessionIds,
  setMainWindow,
  getMainWindow,
  type PtySession,
} from '../../electron/main/sessions'

function makeSession(overrides: Partial<PtySession> = {}): PtySession {
  const id = overrides.id ?? 1
  return {
    id,
    pid: 0,
    pty: { write: vi.fn() } as any,
    ringBuffer: new RingBuffer(),
    lastActivityMs: Date.now(),
    shell: 'sh',
    ...overrides,
  }
}

describe('RingBuffer', () => {
  it('reports length 0 and tail "" when empty', () => {
    const rb = new RingBuffer(8)
    expect(rb.length).toBe(0)
    expect(rb.tail(100)).toBe('')
  })

  it('round-trips exact bytes when under capacity', () => {
    const rb = new RingBuffer(64)
    rb.push(Buffer.from('hello'))
    expect(rb.length).toBe(5)
    expect(rb.tail(64)).toBe('hello')
  })

  it('keeps only the newest bytes when push exceeds capacity over multiple writes', () => {
    const rb = new RingBuffer(8)
    rb.push(Buffer.from('abcd'))
    rb.push(Buffer.from('efgh'))
    rb.push(Buffer.from('ijkl'))
    expect(rb.length).toBe(8)
    expect(rb.tail(8)).toBe('efghijkl'.slice(-8))
    
    expect(rb.tail(8)).toBe('efghijkl'.slice(0)) // 8 bytes
    
    expect(rb.tail(8)).toBe('efghijkl'.slice(-8))
  })

  it('keeps only trailing capacity bytes when a single chunk exceeds capacity', () => {
    const rb = new RingBuffer(4)
    rb.push(Buffer.from('abcdefghij'))
    expect(rb.length).toBe(4)
    expect(rb.tail(4)).toBe('ghij')
  })

  it('drops oldest and truncates partial chunks on overflow', () => {
    const rb = new RingBuffer(6)
    rb.push(Buffer.from('aaa'))
    rb.push(Buffer.from('bbb'))
    rb.push(Buffer.from('ccc'))
    
    expect(rb.length).toBe(6)
    expect(rb.tail(6)).toBe('bbbccc')

    
    rb.push(Buffer.from('dd'))
    expect(rb.length).toBe(6)
    expect(rb.tail(6)).toBe('bcccdd')
  })

  it('caps tail() at min(maxBytes, length)', () => {
    const rb = new RingBuffer(64)
    rb.push(Buffer.from('hello world'))
    expect(rb.tail(5)).toBe('world')
    expect(rb.tail(1000)).toBe('hello world')
    expect(rb.tail(0)).toBe('')
    expect(rb.tail(-1)).toBe('')
  })

  it('treats zero-length push as a no-op', () => {
    const rb = new RingBuffer(8)
    rb.push(Buffer.from(''))
    expect(rb.length).toBe(0)
    rb.push(Buffer.from('hi'))
    rb.push(Buffer.from(''))
    expect(rb.length).toBe(2)
    expect(rb.tail(8)).toBe('hi')
  })

  it('treats UTF-8 input as bytes (no character-boundary guarantees)', () => {
    const rb = new RingBuffer(64)
    const text = 'héllo' // 'é' is 2 bytes in UTF-8
    const buf = Buffer.from(text, 'utf8')
    rb.push(buf)
    expect(rb.length).toBe(buf.length)
    
    expect(rb.tail(buf.length)).toBe(text)
  })

  it('uses default RING_CAPACITY when no constructor arg', () => {
    const rb = new RingBuffer()
    rb.push(Buffer.alloc(RING_CAPACITY + 100, 0x41))
    expect(rb.length).toBe(RING_CAPACITY)
  })
})

describe('session helpers', () => {
  afterEach(() => {
    SESSIONS.clear()
  })

  it('nextId() is monotonically increasing', () => {
    const a = nextId()
    const b = nextId()
    const c = nextId()
    expect(b).toBe(a + 1)
    expect(c).toBe(b + 1)
  })

  it('returns null/false for unknown ids', () => {
    expect(sessionOutput(9999)).toBeNull()
    expect(sessionPid(9999)).toBeNull()
    expect(sessionLastActivityMs(9999)).toBeNull()
    expect(sessionWrite(9999, 'hi')).toBe(false)
  })

  it('listSessionIds() returns sorted ascending', () => {
    SESSIONS.set(7, makeSession({ id: 7 }))
    SESSIONS.set(2, makeSession({ id: 2 }))
    SESSIONS.set(5, makeSession({ id: 5 }))
    expect(listSessionIds()).toEqual([2, 5, 7])
  })

  it('listSessionIds() returns [] when empty', () => {
    expect(listSessionIds()).toEqual([])
  })

  it('sessionOutput returns the ring buffer tail for a known id', () => {
    const s = makeSession({ id: 1 })
    s.ringBuffer.push(Buffer.from('hello'))
    SESSIONS.set(1, s)
    expect(sessionOutput(1)).toBe('hello')
    expect(sessionOutput(1, 3)).toBe('llo')
  })

  it('sessionPid returns the session pid', () => {
    SESSIONS.set(1, makeSession({ id: 1, pid: 4242 }))
    expect(sessionPid(1)).toBe(4242)
  })

  it('sessionLastActivityMs returns the last activity timestamp', () => {
    SESSIONS.set(1, makeSession({ id: 1, lastActivityMs: 12345 }))
    expect(sessionLastActivityMs(1)).toBe(12345)
  })

  it('sessionWrite returns true and calls pty.write on success', () => {
    const write = vi.fn()
    SESSIONS.set(1, makeSession({ id: 1, pty: { write } as any }))
    expect(sessionWrite(1, 'ls\n')).toBe(true)
    expect(write).toHaveBeenCalledWith('ls\n')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('sessionWrite returns false when pty.write throws', () => {
    const write = vi.fn().mockImplementation(() => {
      throw new Error('broken pipe')
    })
    SESSIONS.set(1, makeSession({ id: 1, pty: { write } as any }))
    expect(sessionWrite(1, 'ls\n')).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('setMainWindow / getMainWindow round-trip', () => {
    const stub = { id: 'fake-window' } as any
    setMainWindow(stub)
    expect(getMainWindow()).toBe(stub)
  })
})
