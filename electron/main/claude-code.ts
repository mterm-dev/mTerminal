import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import pidtree from 'pidtree'
import {
  sessionPid,
  sessionOutput,
  sessionLastActivityMs,
} from './sessions'

const execFileP = promisify(execFile)

export type CcState = 'none' | 'idle' | 'thinking' | 'awaitingInput'

export interface CcStatus {
  state: CcState
  running: boolean
  binary: string | null
  lastActivityMs: number | null
}

interface TreeCacheEntry {
  ts: number
  promise: Promise<string | null>
}
const treeCache: Map<number, TreeCacheEntry> = new Map()
const TREE_CACHE_TTL_MS = 1500

export function isClaudeName(raw: string): boolean {
  let n = raw.trim()
  if (n.toLowerCase().endsWith('.exe')) n = n.slice(0, -4)
  n = n.toLowerCase()
  return n === 'claude' || n === 'claude-code' || n.startsWith('claude-')
}

async function readCommandName(pid: number): Promise<string | null> {
  try {
    if (process.platform === 'linux') {
      const txt = await fs.readFile(`/proc/${pid}/comm`, 'utf8')
      return txt.replace(/\n+$/, '').trim() || null
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileP('ps', ['-o', 'comm=', '-p', String(pid)])
      const line = stdout.trim().split('\n').pop() ?? ''
      const last = line.split('/').pop() ?? line
      return last || null
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileP('tasklist', [
        '/FI',
        `PID eq ${pid}`,
        '/FO',
        'CSV',
        '/NH',
      ])
      const line = stdout.trim().split('\n')[0] ?? ''
      const m = line.match(/^"([^"]+)"/)
      if (!m) return null
      let name = m[1]!
      if (name.toLowerCase().endsWith('.exe')) name = name.slice(0, -4)
      return name
    }
    return null
  } catch {
    return null
  }
}

async function findClaudeBinary(rootPid: number): Promise<string | null> {
  let descendants: number[]
  try {
    descendants = await pidtree(rootPid, { root: false })
  } catch {
    return null
  }
  if (descendants.length === 0) return null
  const names = await Promise.all(descendants.map((p) => readCommandName(p)))
  for (const n of names) {
    if (n && isClaudeName(n)) return n
  }
  return null
}

async function getCachedClaudeBinary(
  tabId: number,
  rootPid: number
): Promise<string | null> {
  const now = Date.now()
  const cached = treeCache.get(tabId)
  if (cached && now - cached.ts < TREE_CACHE_TTL_MS) {
    return cached.promise
  }
  const promise = findClaudeBinary(rootPid)
  treeCache.set(tabId, { ts: now, promise })
  return promise
}

export function stripAnsi(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const c = s.charCodeAt(i)
    if (c === 0x1b && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1)
      if (next === 0x5b /* '[' */) {
        i += 2
        while (
          i < s.length &&
          !((s.charCodeAt(i) >= 0x41 && s.charCodeAt(i) <= 0x5a) ||
            (s.charCodeAt(i) >= 0x61 && s.charCodeAt(i) <= 0x7a))
        ) {
          i++
        }
        if (i < s.length) i++
        continue
      } else if (next === 0x5d /* ']' */) {
        i += 2
        while (i < s.length && s.charCodeAt(i) !== 0x07) {
          if (s.charCodeAt(i) === 0x1b && i + 1 < s.length && s.charCodeAt(i + 1) === 0x5c) {
            i += 2
            break
          }
          i++
        }
        if (i < s.length && s.charCodeAt(i) === 0x07) i++
        continue
      } else {
        i += 2
        continue
      }
    }
    out += s[i]
    i++
  }
  return out
}

const AWAITING_MARKERS = [
  'do you want',
  'press enter',
  '(y/n)',
  '❯ 1.', // ❯ 1.
  'waiting for your input',
]
const THINKING_MARKERS = [
  'esc to interrupt',
  'thinking',
  '(↑↓ to navigate', // (↑↓ to navigate
]

export function classify(buffer: string): CcState | null {
  const lower = stripAnsi(buffer).toLowerCase()
  for (const m of AWAITING_MARKERS) {
    if (lower.includes(m)) return 'awaitingInput'
  }
  for (const m of THINKING_MARKERS) {
    if (lower.includes(m)) return 'thinking'
  }
  return null
}

export async function statusFor(tabId: number): Promise<CcStatus> {
  const pid = sessionPid(tabId)
  if (pid == null) {
    return { state: 'none', running: false, binary: null, lastActivityMs: null }
  }
  const lastMs = sessionLastActivityMs(tabId)
  const claudeBin = await getCachedClaudeBinary(tabId, pid)
  if (!claudeBin) {
    return {
      state: 'none',
      running: false,
      binary: null,
      lastActivityMs: lastMs,
    }
  }
  const tail = sessionOutput(tabId, 4096) ?? ''
  const parsed = classify(tail)
  const sinceLastMs = lastMs != null ? Date.now() - lastMs : null
  let state: CcState
  if (parsed) {
    state = parsed
  } else if (sinceLastMs != null && sinceLastMs < 600) {
    state = 'thinking'
  } else {
    state = 'idle'
  }
  return { state, running: true, binary: claudeBin, lastActivityMs: sinceLastMs }
}

export function registerClaudeCodeHandlers(): void {
  ipcMain.handle(
    'claude-code:status',
    async (_e, args: { tabId: number }): Promise<CcStatus> => {
      return statusFor(args.tabId)
    }
  )
}
