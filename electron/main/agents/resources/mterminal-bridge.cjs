#!/usr/bin/env node
/**
 * Universal hook adapter for Claude Code AND OpenAI Codex CLI.
 *
 * Both CLIs ship a structurally identical hooks system — they spawn this
 * script as a short-lived subprocess on each lifecycle event (PreToolUse,
 * PostToolUse, UserPromptSubmit, PermissionRequest/Notification, Stop,
 * SubagentStop, SessionStart, SessionEnd) and feed it a JSON payload on
 * stdin. We map the event to an `AgentEvent` and post one JSONL line to
 * mTerminal's bridge socket.
 *
 * Argv layout:
 *   node mterminal-bridge.cjs <event_kind> <agent>
 *     event_kind: pre_tool_use | post_tool_use | user_prompt_submit |
 *                 notification | permission_request | stop | subagent_stop |
 *                 session_start | session_end
 *     agent:      claude | codex   (defaults to claude)
 *
 * Required env:
 *   MTERMINAL_TAB_ID  — integer tab id assigned at PTY spawn
 *   MTERMINAL_BRIDGE  — abs path to the Unix socket / named pipe
 *
 * Self-contained: zero deps.
 */

'use strict'

const net = require('node:net')

// Map Claude / Codex lifecycle hook event names → AgentEvent kinds.
//
// Note: `post_tool_use` stays in `thinking` state on purpose — the turn is
// not over yet (the agent may invoke another tool or write the final
// response). Only `stop` / `subagent_stop` / `session_end` flip to `done`.
const HOOK_TO_EVENT = {
  pre_tool_use: 'thinking',
  post_tool_use: 'thinking',
  user_prompt_submit: 'thinking',
  notification: 'awaiting_input',
  permission_request: 'awaiting_input',
  stop: 'done',
  subagent_stop: 'done',
  session_start: 'session_start',
  session_end: 'done',
}

function main() {
  const hookKind = String(process.argv[2] || '').trim()
  const agent = String(process.argv[3] || 'claude').trim() || 'claude'
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

    // Codex includes session_id / turn_id / hook_event_name in payload —
    // surface useful fields in detail for debugging.
    if (parsed.session_id) detail.sessionId = String(parsed.session_id)
    if (parsed.turn_id) detail.turnId = String(parsed.turn_id)

    const line =
      JSON.stringify({
        tabId,
        agent,
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
