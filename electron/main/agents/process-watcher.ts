/**
 * Process-tree watcher that emits synthetic AgentEvents for AI CLI binaries
 * running inside a PTY tab.
 *
 * Why this exists: Claude Code has a rich hooks system (PreToolUse / Stop /
 * Notification / …) that fires on every lifecycle moment, so the bridge gets
 * a precise "thinking → done" trace for free. Codex has no equivalent — its
 * MCP integration only surfaces `initialize` and stdio-close, with nothing
 * in between unless the agent voluntarily calls our `notify_user` tool.
 *
 * To get a usable yellow/green dot for Codex (and as a fallback for Claude
 * if the user hasn't installed hooks yet) we poll `pidtree` for AI CLI
 * descendants and synthesize:
 *
 *    - process appears  → `thinking` event
 *    - process disappears (with no replacement) → `done`
 *
 * The interval is intentionally low-frequency (2s) — we're catching launches
 * and exits, not per-tool transitions. The hooks-based path covers the fast
 * stuff for Claude.
 */

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import pidtree from 'pidtree'
import { agentBridge, type AgentEvent } from './bridge-server'
import { listSessionIds, sessionPid } from '../sessions'

const execFileP = promisify(execFile)

const POLL_MS = 2000

type Agent = 'claude' | 'codex'

function classify(name: string): Agent | null {
  let n = name.trim().toLowerCase()
  if (n.endsWith('.exe')) n = n.slice(0, -4)
  if (n === 'claude' || n === 'claude-code' || n.startsWith('claude-')) return 'claude'
  if (n === 'codex' || n === 'codex-cli' || n.startsWith('codex-')) return 'codex'
  return null
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
      return (line.split('/').pop() || line) || null
    }
    if (process.platform === 'win32') {
      const { stdout } = await execFileP('tasklist', [
        '/FI',
        `PID eq ${pid}`,
        '/FO',
        'CSV',
        '/NH',
      ])
      const m = stdout.trim().split('\n')[0]?.match(/^"([^"]+)"/)
      if (!m) return null
      let name = m[1]!
      if (name.toLowerCase().endsWith('.exe')) name = name.slice(0, -4)
      return name
    }
  } catch {
    /* fall through */
  }
  return null
}

async function detectAgent(rootPid: number): Promise<Agent | null> {
  let descendants: number[] = []
  try {
    descendants = await pidtree(rootPid, { root: false })
  } catch {
    return null
  }
  if (descendants.length === 0) return null
  const names = await Promise.all(descendants.map(readCommandName))
  for (const n of names) {
    if (!n) continue
    const a = classify(n)
    if (a) return a
  }
  return null
}

const lastSeen = new Map<number, Agent | null>()
let timer: NodeJS.Timeout | null = null

function emit(tabId: number, agent: Agent, event: AgentEvent['event']): void {
  agentBridge.emit('event', {
    tabId,
    agent,
    event,
    ts: Date.now(),
  } satisfies AgentEvent)
}

async function tick(): Promise<void> {
  for (const tabId of listSessionIds()) {
    const pid = sessionPid(tabId)
    if (pid == null) {
      lastSeen.delete(tabId)
      continue
    }
    const agent = await detectAgent(pid)
    const prev = lastSeen.get(tabId) ?? null

    if (agent && !prev) {
      // Newly appeared.
      emit(tabId, agent, 'thinking')
    } else if (!agent && prev) {
      // Just disappeared.
      emit(tabId, prev, 'done')
    }
    // If `prev === agent`, no transition; the hook stream (for Claude) keeps
    // refreshing the state with finer-grained events. For Codex, the dot
    // stays "thinking" until the process exits — that's the trade-off of
    // not having native hooks.

    if (agent) lastSeen.set(tabId, agent)
    else lastSeen.delete(tabId)
  }
}

export function startProcessWatcher(): void {
  if (timer) return
  timer = setInterval(() => {
    void tick().catch((err) => console.error('[agent-watcher] tick failed:', err))
  }, POLL_MS)
}

export function stopProcessWatcher(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  lastSeen.clear()
}
