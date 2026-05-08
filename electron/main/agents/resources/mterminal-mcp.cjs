#!/usr/bin/env node
/**
 * Codex MCP server adapter.
 *
 * Spawned by the Codex CLI as a long-lived stdio child when registered via
 * `~/.codex/config.toml` under `[mcp_servers.mterminal]`. Implements the
 * minimal subset of MCP protocol needed to be a valid server (initialize,
 * tools/list, tools/call) while emitting agent lifecycle events to
 * mTerminal's bridge socket.
 *
 * Wire-level: line-delimited JSON-RPC 2.0 over stdin/stdout.
 *
 * Tools exposed to Codex:
 *   - notify_user(message, level?) — posts an `awaiting_input` (level=warn) or
 *     `done` (level=info) event so the user sees a notification when the
 *     agent finishes a task or wants attention.
 *
 * Lifecycle:
 *   - on `initialize`        → send `session_start`
 *   - on every `tools/call`  → send `tool_use` (and `awaiting_input`/`done`
 *                              if it was `notify_user`)
 *   - on stdin close         → send `done`, exit
 *   - 30s idle heartbeat     → send `idle`
 *
 * Self-contained — uses Node built-ins only. Hand-rolled JSON-RPC keeps the
 * resource bundle tiny and avoids dragging the MCP SDK into a packaged CJS
 * resource. Can be swapped to `@modelcontextprotocol/sdk` later if more of
 * the protocol surface is needed.
 *
 * Required env:
 *   MTERMINAL_TAB_ID  — integer tab id
 *   MTERMINAL_BRIDGE  — abs path to the Unix socket / named pipe
 */

'use strict'

const net = require('node:net')
const fs = require('node:fs')

/**
 * Codex spawns MCP children with a clean env (only what's in the
 * [mcp_servers.<name>.env] TOML table reaches us). MTERMINAL_BRIDGE is
 * pinned by the installer, but MTERMINAL_TAB_ID is per-tab — it lives in
 * the PTY shell's env. We walk up the process tree on Linux reading
 * /proc/<pid>/environ to find the first ancestor that has it set.
 */
function findTabIdFromAncestors() {
  const own = Number(process.env.MTERMINAL_TAB_ID || 0)
  if (own > 0) return own
  if (process.platform !== 'linux') return 0
  let pid = process.ppid
  for (let i = 0; i < 32 && pid > 1; i++) {
    try {
      const env = fs.readFileSync('/proc/' + pid + '/environ', 'utf8')
      for (const entry of env.split('\0')) {
        if (entry.startsWith('MTERMINAL_TAB_ID=')) {
          const v = Number(entry.slice('MTERMINAL_TAB_ID='.length))
          if (v > 0) return v
        }
      }
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8')
      // stat format: <pid> (<comm>) <state> <ppid> ...
      const closeParen = stat.lastIndexOf(')')
      if (closeParen < 0) break
      const fields = stat.slice(closeParen + 2).split(' ')
      const ppid = Number(fields[1])
      if (!ppid || ppid === pid) break
      pid = ppid
    } catch {
      break
    }
  }
  return 0
}

function findBridgeFromAncestors() {
  const own = process.env.MTERMINAL_BRIDGE || ''
  if (own) return own
  if (process.platform !== 'linux') return ''
  let pid = process.ppid
  for (let i = 0; i < 32 && pid > 1; i++) {
    try {
      const env = fs.readFileSync('/proc/' + pid + '/environ', 'utf8')
      for (const entry of env.split('\0')) {
        if (entry.startsWith('MTERMINAL_BRIDGE=')) {
          return entry.slice('MTERMINAL_BRIDGE='.length)
        }
      }
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8')
      const closeParen = stat.lastIndexOf(')')
      if (closeParen < 0) break
      const fields = stat.slice(closeParen + 2).split(' ')
      const ppid = Number(fields[1])
      if (!ppid || ppid === pid) break
      pid = ppid
    } catch {
      break
    }
  }
  return ''
}

const tabId = findTabIdFromAncestors()
const sockPath = findBridgeFromAncestors()

let bridgeSock = null
let bridgeReady = false
let bridgeBacklog = []

function ensureBridge() {
  if (bridgeReady || !sockPath || !tabId) return
  bridgeSock = net.createConnection(sockPath, () => {
    bridgeReady = true
    for (const line of bridgeBacklog) bridgeSock.write(line)
    bridgeBacklog = []
  })
  bridgeSock.on('error', () => {
    bridgeReady = false
    bridgeSock = null
  })
  bridgeSock.on('close', () => {
    bridgeReady = false
    bridgeSock = null
  })
}

function postEvent(event, detail) {
  if (!sockPath || !tabId) return
  const line =
    JSON.stringify({ tabId, agent: 'codex', event, ts: Date.now(), detail }) + '\n'
  ensureBridge()
  if (bridgeReady && bridgeSock) {
    try {
      bridgeSock.write(line)
    } catch {
      bridgeBacklog.push(line)
    }
  } else {
    bridgeBacklog.push(line)
  }
}

let lastActivityTs = Date.now()
const HEARTBEAT_MS = 30_000
const HEARTBEAT_IDLE_AFTER_MS = 30_000
const heartbeat = setInterval(() => {
  if (Date.now() - lastActivityTs >= HEARTBEAT_IDLE_AFTER_MS) {
    postEvent('idle')
  }
}, HEARTBEAT_MS)

// ── JSON-RPC over stdio ────────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function err(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } })
}

const TOOLS = [
  {
    name: 'status',
    description:
      'REQUIRED — drives the per-tab activity indicator in mTerminal. Call this tool TWICE per turn:\n  1. With phase="start" at the very beginning, before any other tool call or reasoning output.\n  2. With phase="complete" as the very last thing before yielding control.\nUse phase="awaiting_input" when you need the user to make a decision before you can continue. Use phase="progress" for optional mid-task updates.\nThe `message` is a one-sentence summary of what you are doing / did / need.',
    inputSchema: {
      type: 'object',
      properties: {
        phase: {
          type: 'string',
          enum: ['start', 'progress', 'complete', 'awaiting_input'],
          description:
            'Lifecycle phase. "start" at the very start of a turn, "complete" at the end, "awaiting_input" when blocked on the user, "progress" for optional mid-task updates.',
        },
        message: {
          type: 'string',
          description:
            'One-sentence description (preview at start, summary at complete, question at awaiting_input).',
        },
      },
      required: ['phase', 'message'],
    },
  },
]

function handleInitialize(req) {
  postEvent('session_start')
  ok(req.id, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'mterminal', version: '1.0.0' },
  })
}

function handleListTools(req) {
  ok(req.id, { tools: TOOLS })
}

function handleCallTool(req) {
  const params = req.params || {}
  const name = String(params.name || '')
  const args = params.arguments || {}
  lastActivityTs = Date.now()
  postEvent('tool_use', { tool: name })

  if (name === 'status') {
    const phase = String(args.phase || 'progress')
    const message = String(args.message || '')
    const evKind =
      phase === 'complete'
        ? 'done'
        : phase === 'awaiting_input'
          ? 'awaiting_input'
          : 'thinking'
    postEvent(evKind, { message })
    ok(req.id, {
      content: [{ type: 'text', text: 'ack' }],
    })
    return
  }

  err(req.id, -32601, 'Unknown tool: ' + name)
}

function dispatch(req) {
  if (req.method === 'initialize') return handleInitialize(req)
  if (req.method === 'tools/list') return handleListTools(req)
  if (req.method === 'tools/call') return handleCallTool(req)
  if (req.method === 'notifications/initialized') return // notification, no response
  if (req.method === 'ping') return ok(req.id, {})
  // Unknown method — respond with -32601 if request, drop if notification.
  if (typeof req.id !== 'undefined') err(req.id, -32601, 'Method not found: ' + req.method)
}

// ── stdin pump ─────────────────────────────────────────────────────────────

let stdinBuf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk
  let nl
  while ((nl = stdinBuf.indexOf('\n')) !== -1) {
    const line = stdinBuf.slice(0, nl).trim()
    stdinBuf = stdinBuf.slice(nl + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      lastActivityTs = Date.now()
      dispatch(msg)
    } catch {
      /* drop malformed */
    }
  }
})

process.stdin.on('end', () => {
  postEvent('done')
  setTimeout(() => process.exit(0), 50)
})

process.on('SIGTERM', () => {
  postEvent('done')
  setTimeout(() => process.exit(0), 50)
})

process.on('SIGINT', () => {
  postEvent('done')
  setTimeout(() => process.exit(0), 50)
})

// Lifetime safety: in case stdin never closes but parent dies.
process.on('beforeExit', () => {
  clearInterval(heartbeat)
})

ensureBridge()
