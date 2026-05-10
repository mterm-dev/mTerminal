import type { BrowserWindow } from 'electron'
import type { IPty } from 'node-pty'

export const RING_CAPACITY = 65536

export class RingBuffer {
  private capacity: number
  private chunks: Buffer[] = []
  private size = 0

  constructor(capacity: number = RING_CAPACITY) {
    this.capacity = capacity
  }

  push(chunk: Buffer): void {
    if (chunk.length === 0) return
    if (chunk.length >= this.capacity) {
      this.chunks = [chunk.subarray(chunk.length - this.capacity)]
      this.size = this.capacity
      return
    }
    this.chunks.push(chunk)
    this.size += chunk.length
    while (this.size > this.capacity && this.chunks.length > 0) {
      const head = this.chunks[0]!
      const overflow = this.size - this.capacity
      if (head.length <= overflow) {
        this.chunks.shift()
        this.size -= head.length
      } else {
        this.chunks[0] = head.subarray(overflow)
        this.size -= overflow
      }
    }
  }

  tail(maxBytes: number): string {
    const want = Math.max(0, Math.min(maxBytes, this.size))
    if (want === 0) return ''
    let need = want
    const slices: Buffer[] = []
    for (let i = this.chunks.length - 1; i >= 0 && need > 0; i--) {
      const c = this.chunks[i]!
      if (c.length <= need) {
        slices.unshift(c)
        need -= c.length
      } else {
        slices.unshift(c.subarray(c.length - need))
        need = 0
      }
    }
    return Buffer.concat(slices).toString('utf8')
  }

  get length(): number {
    return this.size
  }
}

export interface PtySession {
  id: number
  pid: number
  pty: IPty
  ringBuffer: RingBuffer
  lastActivityMs: number
  shell: string
  wslDistro?: string
}

export const SESSIONS: Map<number, PtySession> = new Map()

let nextIdCounter = 1
export function nextId(): number {
  return nextIdCounter++
}

export function sessionOutput(id: number, maxBytes?: number): string | null {
  const s = SESSIONS.get(id)
  if (!s) return null
  const cap = maxBytes ?? s.ringBuffer.length
  return s.ringBuffer.tail(cap)
}

export function sessionPid(id: number): number | null {
  const s = SESSIONS.get(id)
  return s ? s.pid : null
}

export function sessionWrite(id: number, data: string): boolean {
  const s = SESSIONS.get(id)
  if (!s) return false
  try {
    s.pty.write(data)
    return true
  } catch {
    return false
  }
}

export function sessionLastActivityMs(id: number): number | null {
  const s = SESSIONS.get(id)
  return s ? s.lastActivityMs : null
}

export function listSessionIds(): number[] {
  return Array.from(SESSIONS.keys()).sort((a, b) => a - b)
}

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}
