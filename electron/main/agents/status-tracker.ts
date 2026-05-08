/**
 * Per-tab agent state machine. Subscribes to `agentBridge` events and
 * pushes the resulting status changes to the renderer over the
 * `agent:status` IPC channel.
 *
 * Forms the replacement for the old polling/marker system in
 * `electron/main/claude-code.ts`.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { agentBridge, type AgentEvent } from './bridge-server'
import { recordCodexSession } from './codex-rollout-watcher'

export type AgentState = 'idle' | 'thinking' | 'awaitingInput' | 'done'

export interface AgentStatus {
  state: AgentState
  agent: 'claude' | 'codex' | null
  lastChangeMs: number
  detail?: { tool?: string; message?: string }
}

const THINKING_DECAY_MS = 30_000
const DONE_FLASH_MS = 3_000

interface TabRecord {
  status: AgentStatus
  decayTimer: NodeJS.Timeout | null
}

const records = new Map<number, TabRecord>()
let getWin: () => BrowserWindow | null = () => null

function emit(tabId: number, status: AgentStatus): void {
  getWin()?.webContents.send('agent:status', { tabId, ...status })
}

function clearDecay(rec: TabRecord): void {
  if (rec.decayTimer) {
    clearTimeout(rec.decayTimer)
    rec.decayTimer = null
  }
}

function set(tabId: number, status: AgentStatus): void {
  const prev = records.get(tabId)
  if (prev) clearDecay(prev)
  const rec: TabRecord = { status, decayTimer: null }
  records.set(tabId, rec)

  if (status.state === 'thinking') {
    rec.decayTimer = setTimeout(() => {
      const cur = records.get(tabId)
      if (cur && cur.status === status) {
        set(tabId, { ...status, state: 'idle', lastChangeMs: Date.now() })
      }
    }, THINKING_DECAY_MS)
  } else if (status.state === 'done') {
    rec.decayTimer = setTimeout(() => {
      const cur = records.get(tabId)
      if (cur && cur.status === status) {
        set(tabId, { ...status, state: 'idle', lastChangeMs: Date.now() })
      }
    }, DONE_FLASH_MS)
  }

  emit(tabId, status)
}

function handle(evt: AgentEvent): void {
  const agent = evt.agent === 'claude' || evt.agent === 'codex' ? evt.agent : null
  const ts = evt.ts ?? Date.now()
  const detail = evt.detail

  // Hook payloads carry sessionId — feed it into the rollout watcher so we
  // can route TurnAborted events back to the right tab.
  if (agent === 'codex') {
    const sessionId = (detail as { sessionId?: string } | undefined)?.sessionId
    if (sessionId) recordCodexSession(sessionId, evt.tabId)
  }

  switch (evt.event) {
    case 'session_start':
      set(evt.tabId, { state: 'thinking', agent, lastChangeMs: ts, detail })
      return
    case 'thinking':
    case 'tool_use':
      set(evt.tabId, { state: 'thinking', agent, lastChangeMs: ts, detail })
      return
    case 'awaiting_input':
      set(evt.tabId, { state: 'awaitingInput', agent, lastChangeMs: ts, detail })
      return
    case 'done':
      set(evt.tabId, { state: 'done', agent, lastChangeMs: ts, detail })
      return
    case 'idle':
      set(evt.tabId, { state: 'idle', agent, lastChangeMs: ts, detail })
      return
    case 'error':
      // Treat as done so the UI stops spinning; detail.message carries info.
      set(evt.tabId, { state: 'done', agent, lastChangeMs: ts, detail })
      return
  }
}

export function snapshotStatuses(): Array<[number, AgentStatus]> {
  return [...records.entries()].map(([k, v]) => [k, v.status])
}

export function clearTabStatus(tabId: number): void {
  const rec = records.get(tabId)
  if (rec) clearDecay(rec)
  records.delete(tabId)
}

export function registerStatusTracker(getMainWin: () => BrowserWindow | null): void {
  getWin = getMainWin
  agentBridge.on('event', handle)

  ipcMain.handle('agent:status:snapshot', () => snapshotStatuses())
}
