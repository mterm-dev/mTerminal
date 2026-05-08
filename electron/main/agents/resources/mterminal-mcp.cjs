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

const tabId = Number(process.env.MTERMINAL_TAB_ID || 0)
const sockPath = process.env.MTERMINAL_BRIDGE || ''

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
    name: 'notify_user',
    description:
      'Send a notification to the mTerminal user when the agent finishes a task or wants attention. Use level="info" for completion, level="warn" for awaiting input/clarification, level="error" for failures.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Short message shown to the user.' },
        level: {
          type: 'string',
          enum: ['info', 'warn', 'error'],
          description: 'Severity of the notification.',
        },
      },
      required: ['message'],
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

  if (name === 'notify_user') {
    const message = String(args.message || '')
    const level = String(args.level || 'info')
    const evKind = level === 'warn' ? 'awaiting_input' : level === 'error' ? 'done' : 'done'
    postEvent(evKind, { message })
    ok(req.id, {
      content: [{ type: 'text', text: 'Notified user: ' + message }],
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
