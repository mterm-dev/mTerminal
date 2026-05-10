/**
 * Local IPC server that listens for agent lifecycle events posted by the
 * Claude Code hook adapter (`mterminal-bridge.cjs`) and the Codex MCP server
 * (`mterminal-mcp.cjs`).
 *
 * Wire format: line-delimited JSON. Each line is one `AgentEvent`. Clients
 * connect, write one or more lines, and may close immediately (Claude hooks
 * are short-lived) or stay alive for the whole session (Codex MCP).
 */

import { EventEmitter } from 'node:events'
import { createServer, type Server, type Socket } from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, userInfo } from 'node:os'

export type AgentEventKind =
  | 'session_start'
  | 'thinking'
  | 'tool_use'
  | 'idle'
  | 'awaiting_input'
  | 'done'
  | 'error'

/**
 * Origin of an event. Distinguishes legitimate hook/MCP-driven completions
 * from incidental ones (process disappeared because the user killed the
 * terminal, session_end fired because the user typed `/exit`, etc.). The
 * renderer suppresses sound notifications when source is not `hook`.
 */
export type AgentEventSource = 'hook' | 'watcher' | 'shutdown'

export interface AgentEvent {
  /** Tab id assigned by `electron/main/sessions.ts` when spawning the PTY. */
  tabId: number
  agent: 'claude' | 'codex' | 'unknown'
  event: AgentEventKind
  ts: number
  source?: AgentEventSource
  detail?: { tool?: string; message?: string; exitCode?: number }
}

class AgentBridge extends EventEmitter {
  private server: Server | null = null
  private path = ''

  /**
   * Returns the socket path / pipe name. Idempotent.
   *
   * The path is stable per-user (uses uid/username, NOT process.pid) so the
   * Claude/Codex configs we write don't go stale on app restart. Stale socket
   * files left from a crashed previous run are unlinked before bind.
   */
  start(): string {
    if (this.server) return this.path
    const u = userInfo()
    const tag =
      typeof u.uid === 'number' && u.uid >= 0 ? String(u.uid) : (u.username || 'user')
    this.path =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\mterminal-agent-${tag}`
        : join(tmpdir(), `mterminal-agent-${tag}.sock`)
    if (process.platform !== 'win32' && existsSync(this.path)) {
      try {
        unlinkSync(this.path)
      } catch {
        /* ignore */
      }
    }
    this.server = createServer((sock) => this.handleClient(sock))
    this.server.on('error', (err) => {
      console.error('[agent-bridge] server error:', err)
    })
    this.server.listen(this.path, () => {
      console.log('[agent-bridge] listening on ' + this.path)
    })
    return this.path
  }

  stop(): void {
    if (!this.server) return
    this.server.close()
    this.server = null
    if (process.platform !== 'win32' && existsSync(this.path)) {
      try {
        unlinkSync(this.path)
      } catch {
        /* ignore */
      }
    }
    this.path = ''
  }

  socketPath(): string | null {
    return this.path || null
  }

  private handleClient(sock: Socket): void {
    let buf = ''
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line) continue
        try {
          const evt = JSON.parse(line) as Partial<AgentEvent>
          if (typeof evt.tabId === 'number' && evt.event && evt.agent) {
            this.emit('event', {
              tabId: evt.tabId,
              agent: evt.agent,
              event: evt.event,
              ts: typeof evt.ts === 'number' ? evt.ts : Date.now(),
              source: evt.source,
              detail: evt.detail,
            } as AgentEvent)
          }
        } catch {
          /* drop malformed line */
        }
      }
    })
    sock.on('error', () => {
      /* ignore — client may exit abruptly */
    })
  }
}

export const agentBridge = new AgentBridge()
