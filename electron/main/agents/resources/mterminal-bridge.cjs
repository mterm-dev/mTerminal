#!/usr/bin/env node
/**
 * Claude Code hook adapter.
 *
 * Spawned by Claude Code on each lifecycle event (PreToolUse, PostToolUse,
 * UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart,
 * SessionEnd). Reads the JSON event payload from stdin, maps it to an
 * `AgentEvent` shape, and posts one JSONL line to mTerminal's bridge socket.
 *
 * Argv layout:
 *   node mterminal-bridge.cjs <event_kind>
 *
 * Required env:
 *   MTERMINAL_TAB_ID  — integer tab id assigned at PTY spawn
 *   MTERMINAL_BRIDGE  — abs path to the Unix socket / named pipe
 *
 * Self-contained: zero deps.
 */

'use strict'

const net = require('node:net')

// Map Claude lifecycle hooks → AgentEvent kinds.
//
// Note: `post_tool_use` stays in `thinking` state on purpose — the turn is
// not over yet (Claude may invoke another tool or write the final response).
// Only `stop` / `subagent_stop` / `session_end` flip to `done`.
const HOOK_TO_EVENT = {
  pre_tool_use: 'thinking',
  post_tool_use: 'thinking',
  user_prompt_submit: 'thinking',
  notification: 'awaiting_input',
  stop: 'done',
  subagent_stop: 'done',
  session_start: 'session_start',
  session_end: 'done',
}

function main() {
  const hookKind = String(process.argv[2] || '').trim()
  const evKind = HOOK_TO_EVENT[hookKind]
  if (!evKind) process.exit(0)

  const tabId = Number(process.env.MTERMINAL_TAB_ID || 0)
  const sockPath = process.env.MTERMINAL_BRIDGE || ''
  if (!tabId || !sockPath) process.exit(0)

  let stdinBuf = ''
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    send(stdinBuf)
  }, 250)

  process.stdin.on('data', (chunk) => {
    stdinBuf += chunk.toString('utf8')
  })
  process.stdin.on('end', () => {
    if (!timedOut) {
      clearTimeout(timeout)
      send(stdinBuf)
    }
  })
  process.stdin.on('error', () => {
    clearTimeout(timeout)
    send(stdinBuf)
  })

  function send(payload) {
    let parsed = {}
    try {
      parsed = JSON.parse(payload || '{}')
    } catch {
      /* ignore */
    }
    const detail = {}
    if (parsed.tool_name) detail.tool = String(parsed.tool_name)
    if (parsed.message) detail.message = String(parsed.message)
    if (typeof parsed.exit_code === 'number') detail.exitCode = parsed.exit_code

    const line =
      JSON.stringify({
        tabId,
        agent: 'claude',
        event: evKind,
        ts: Date.now(),
        detail: Object.keys(detail).length ? detail : undefined,
      }) + '\n'

    const c = net.createConnection(sockPath, () => {
      c.write(line, () => c.end())
    })
    c.on('error', () => process.exit(0))
    c.on('close', () => process.exit(0))
    setTimeout(() => process.exit(0), 1000)
  }
}

try {
  main()
} catch {
  process.exit(0)
}
