/**
 * Tails Codex CLI rollout JSONL files as a safety net for cases where the
 * native `Stop` hook is bypassed (aborts, stream errors — verified at
 * https://github.com/openai/codex/issues/14203).
 *
 * Codex writes interactive session events to
 * `~/.codex/sessions/YYYY/MM/DD/rollout-<RFC3339>-<uuid>.jsonl`. The persist
 * policy (codex-rs/rollout/src/policy.rs) records `TurnComplete` AND
 * `TurnAborted` unconditionally — including the abort path where Stop never
 * fires.
 *
 * Strategy: chokidar-watch the sessions tree. For every appended line that
 * contains an `EventMsg::TurnAborted`, emit a synthetic `done` event tagged
 * with the session id. We don't try to map sessionId → tabId here — the
 * status-tracker handles that via a session→tab map populated when the hook
 * `SessionStart` event arrives carrying both ids.
 *
 * Latency: filesystem flush is ~1s, so this is only a fallback. Hooks fire
 * sub-100ms when they fire at all.
 */

import chokidar, { type FSWatcher } from 'chokidar'
import { createReadStream, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { agentBridge, type AgentEvent } from './bridge-server'

interface RolloutEntry {
  type?: string
  payload?: { type?: string; [k: string]: unknown }
  session_id?: string
  [k: string]: unknown
}

const SESSIONS_ROOT = join(homedir(), '.codex', 'sessions')

// Track per-file read offsets so we don't re-emit on every chokidar tick.
const fileOffsets = new Map<string, number>()

// Map sessionId → tabId, populated by status-tracker when a Codex
// SessionStart hook arrives. Without this we'd emit synthetic done events
// with no way to route them.
const sessionToTab = new Map<string, number>()

export function recordCodexSession(sessionId: string, tabId: number): void {
  if (!sessionId) return
  sessionToTab.set(sessionId, tabId)
}

let watcher: FSWatcher | null = null

export function startCodexRolloutWatcher(): void {
  if (watcher) return
  // chokidar handles the case where the directory doesn't yet exist.
  watcher = chokidar.watch(SESSIONS_ROOT, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  })

  watcher.on('add', (file: string) => {
    if (!file.endsWith('.jsonl')) return
    fileOffsets.set(file, 0)
    void readNewLines(file)
  })

  watcher.on('change', (file: string) => {
    if (!file.endsWith('.jsonl')) return
    void readNewLines(file)
  })

  watcher.on('error', (err: unknown) => {
    console.error('[codex-rollout] watcher error:', err)
  })
}

export function stopCodexRolloutWatcher(): void {
  if (!watcher) return
  void watcher.close()
  watcher = null
  fileOffsets.clear()
  sessionToTab.clear()
}

async function readNewLines(file: string): Promise<void> {
  let size: number
  try {
    size = statSync(file).size
  } catch {
    return
  }
  const start = fileOffsets.get(file) ?? 0
  if (size <= start) return
  fileOffsets.set(file, size)

  const stream = createReadStream(file, { start, end: size - 1, encoding: 'utf8' })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line) continue
    try {
      const entry = JSON.parse(line) as RolloutEntry
      handleEntry(entry)
    } catch {
      /* skip malformed line */
    }
  }
}

function handleEntry(entry: RolloutEntry): void {
  // Codex's rollout format wraps EventMsg variants. Tolerate both shallow
  // and nested shapes — the format has been refactored across versions.
  const sessionId =
    typeof entry.session_id === 'string' ? entry.session_id : undefined
  const inner = (entry.payload && typeof entry.payload === 'object'
    ? entry.payload
    : entry) as RolloutEntry

  const evType = String(inner.type ?? entry.type ?? '').toLowerCase()
  if (!evType) return

  // Match TurnAborted explicitly. TurnComplete is already reported by the
  // Stop hook in the happy path, so we skip it here to avoid double-firing.
  if (!evType.includes('aborted') && !evType.includes('failed')) return

  const tabId = sessionId ? sessionToTab.get(sessionId) : undefined
  if (tabId == null) return

  const evt: AgentEvent = {
    tabId,
    agent: 'codex',
    event: 'done',
    ts: Date.now(),
    detail: { message: '(turn aborted)' },
  }
  agentBridge.emit('event', evt)
}
