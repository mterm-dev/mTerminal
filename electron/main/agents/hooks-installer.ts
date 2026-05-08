/**
 * Idempotent install/uninstall of agent bridge integrations.
 *
 *   - Claude Code: edits `~/.claude/settings.json` to add lifecycle hooks
 *     (PreToolUse / PostToolUse / UserPromptSubmit / Notification / Stop /
 *     SubagentStop / SessionStart / SessionEnd). Each entry is tagged with
 *     `_mterminal: <version>` so uninstall can target only our additions
 *     while leaving any user-defined hooks alone.
 *
 *   - Codex: edits `~/.codex/config.toml` to add an `[mcp_servers.mterminal]`
 *     section pointing at `mterminal-mcp.cjs`. Codex inherits the parent
 *     PTY's env, which carries `MTERMINAL_TAB_ID` (and we additionally pin
 *     `MTERMINAL_BRIDGE` in the section's `env` table).
 *
 * The bridge scripts ship inside the app — `getResourcePath()` resolves to
 * `<app>/out/main/resources/agent-bridge/<name>` in dev and inside
 * `process.resourcesPath` (or app.getAppPath fallback) when packaged.
 */

import { app, ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import TOML from '@iarna/toml'
import { agentBridge } from './bridge-server'

export const BRIDGE_VERSION = '1.0.0'

interface ClaudeHookEntry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string; timeout?: number }>
  _mterminal?: string
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeHookEntry[]>
  [k: string]: unknown
}

const CLAUDE_LIFECYCLE_EVENTS: Array<{ key: string; cli: string }> = [
  { key: 'PreToolUse', cli: 'pre_tool_use' },
  { key: 'PostToolUse', cli: 'post_tool_use' },
  { key: 'UserPromptSubmit', cli: 'user_prompt_submit' },
  { key: 'Notification', cli: 'notification' },
  { key: 'Stop', cli: 'stop' },
  { key: 'SubagentStop', cli: 'subagent_stop' },
  { key: 'SessionStart', cli: 'session_start' },
  { key: 'SessionEnd', cli: 'session_end' },
]

function claudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json')
}

function codexConfigPath(): string {
  return join(homedir(), '.codex', 'config.toml')
}

function readJsonSafe<T = unknown>(path: string): T {
  if (!existsSync(path)) return {} as T
  try {
    const txt = readFileSync(path, 'utf8')
    return JSON.parse(txt) as T
  } catch {
    return {} as T
  }
}

function writeJson(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function readTomlSafe(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const txt = readFileSync(path, 'utf8')
    return TOML.parse(txt) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeToml(path: string, obj: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, TOML.stringify(obj as TOML.JsonMap), 'utf8')
}

function getResourcePath(name: string): string {
  if (app.isPackaged) {
    const inResources = join(process.resourcesPath, 'agent-bridge', name)
    if (existsSync(inResources)) return inResources
    return join(app.getAppPath(), 'out/main/resources/agent-bridge', name)
  }
  return join(app.getAppPath(), 'out/main/resources/agent-bridge', name)
}

function nodeBinary(): { command: string; envExtra: Record<string, string> } {
  // Prefer system `node` if on PATH (Claude Code hooks run outside Electron).
  // Fall back to the bundled Electron binary with ELECTRON_RUN_AS_NODE=1.
  const fromPath = which('node')
  if (fromPath) return { command: fromPath, envExtra: {} }
  return { command: process.execPath, envExtra: { ELECTRON_RUN_AS_NODE: '1' } }
}

function which(bin: string): string | null {
  const path = process.env.PATH || ''
  const sep = process.platform === 'win32' ? ';' : ':'
  for (const dir of path.split(sep)) {
    if (!dir) continue
    const candidate = join(dir, bin)
    if (existsSync(candidate)) return candidate
    if (process.platform === 'win32') {
      if (existsSync(candidate + '.exe')) return candidate + '.exe'
      if (existsSync(candidate + '.cmd')) return candidate + '.cmd'
    }
  }
  return null
}

// ── Claude hooks install/uninstall ─────────────────────────────────────────

export function installClaudeHooks(): void {
  const settingsPath = claudeSettingsPath()
  const settings = readJsonSafe<ClaudeSettings>(settingsPath)
  const { command, envExtra } = nodeBinary()
  const script = getResourcePath('mterminal-bridge.cjs')
  const sock = agentBridge.socketPath() || ''
  const envPrefix = Object.entries(envExtra)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ')

  const exportSock = `MTERMINAL_BRIDGE=${shellQuote(sock)}`
  const cmdPrefix =
    (envPrefix ? envPrefix + ' ' : '') + exportSock + ' ' + shellQuote(command) + ' ' + shellQuote(script)

  if (!settings.hooks) settings.hooks = {}

  for (const ev of CLAUDE_LIFECYCLE_EVENTS) {
    const list = settings.hooks[ev.key] ?? []
    const filtered = list.filter((e) => !e._mterminal)
    filtered.push({
      matcher: '*',
      _mterminal: BRIDGE_VERSION,
      hooks: [{ type: 'command', command: `${cmdPrefix} ${ev.cli}` }],
    })
    settings.hooks[ev.key] = filtered
  }

  writeJson(settingsPath, settings)
}

export function uninstallClaudeHooks(): void {
  const settingsPath = claudeSettingsPath()
  if (!existsSync(settingsPath)) return
  const settings = readJsonSafe<ClaudeSettings>(settingsPath)
  if (!settings.hooks) return
  for (const ev of CLAUDE_LIFECYCLE_EVENTS) {
    const list = settings.hooks[ev.key]
    if (!Array.isArray(list)) continue
    const filtered = list.filter((e) => !e._mterminal)
    if (filtered.length === 0) {
      delete settings.hooks[ev.key]
    } else {
      settings.hooks[ev.key] = filtered
    }
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks
  writeJson(settingsPath, settings)
}

export function getClaudeHooksStatus(): 'missing' | 'installed' | 'mismatch' {
  const settings = readJsonSafe<ClaudeSettings>(claudeSettingsPath())
  if (!settings.hooks) return 'missing'
  let foundAny = false
  let foundOurs = false
  let outdated = false
  for (const ev of CLAUDE_LIFECYCLE_EVENTS) {
    const list = settings.hooks[ev.key]
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      foundAny = true
      if (entry._mterminal) {
        foundOurs = true
        if (entry._mterminal !== BRIDGE_VERSION) outdated = true
      }
    }
  }
  if (!foundOurs) return foundAny ? 'missing' : 'missing'
  return outdated ? 'mismatch' : 'installed'
}

// ── Codex MCP install/uninstall ────────────────────────────────────────────

const AGENTS_BLOCK_BEGIN = '<!-- mterminal-agent-bridge:begin -->'
const AGENTS_BLOCK_END = '<!-- mterminal-agent-bridge:end -->'
const AGENTS_INSTRUCTIONS = `${AGENTS_BLOCK_BEGIN}
## mTerminal integration

You are running inside mTerminal, which exposes an MCP server named \`mterminal\` with a single tool \`status\`. This tool drives the per-tab activity indicator in the sidebar.

Call \`mterminal.status\` at minimum TWICE per turn:

1. **Beginning of every turn** — \`status({ phase: "start", message: "<one-sentence preview of what you are about to do>" })\`, BEFORE any other tool call or reasoning output.
2. **End of every turn** — \`status({ phase: "complete", message: "<one-sentence summary of what you accomplished>" })\`, as the very last thing you do before yielding control.

If you need the user to make a decision before continuing, call \`status({ phase: "awaiting_input", message: "<the question>" })\` instead of just printing the question.

Skipping these calls breaks the UI — the user will not see that you are working or finished, and notifications will not fire. Always include them, even for trivial turns.
${AGENTS_BLOCK_END}
`

function codexAgentsPath(): string {
  return join(homedir(), '.codex', 'AGENTS.md')
}

function writeAgentsBlock(): void {
  const path = codexAgentsPath()
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const beginIdx = existing.indexOf(AGENTS_BLOCK_BEGIN)
  const endIdx = existing.indexOf(AGENTS_BLOCK_END)
  let next: string
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    next =
      existing.slice(0, beginIdx) +
      AGENTS_INSTRUCTIONS.trim() +
      existing.slice(endIdx + AGENTS_BLOCK_END.length)
  } else {
    next = (existing.trimEnd() + '\n\n' + AGENTS_INSTRUCTIONS).trimStart()
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, next.endsWith('\n') ? next : next + '\n', 'utf8')
}

function removeAgentsBlock(): void {
  const path = codexAgentsPath()
  if (!existsSync(path)) return
  const existing = readFileSync(path, 'utf8')
  const beginIdx = existing.indexOf(AGENTS_BLOCK_BEGIN)
  const endIdx = existing.indexOf(AGENTS_BLOCK_END)
  if (beginIdx === -1 || endIdx === -1 || endIdx <= beginIdx) return
  const next = (
    existing.slice(0, beginIdx).trimEnd() +
    '\n' +
    existing.slice(endIdx + AGENTS_BLOCK_END.length).trimStart()
  ).trim()
  writeFileSync(path, next ? next + '\n' : '', 'utf8')
}

export function installCodexMcp(): void {
  const path = codexConfigPath()
  const cfg = readTomlSafe(path)
  const { command, envExtra } = nodeBinary()
  const script = getResourcePath('mterminal-mcp.cjs')
  const sock = agentBridge.socketPath() || ''

  if (!cfg.mcp_servers || typeof cfg.mcp_servers !== 'object') cfg.mcp_servers = {}
  const servers = cfg.mcp_servers as Record<string, unknown>
  servers.mterminal = {
    command,
    args: [script],
    env: { ...envExtra, MTERMINAL_BRIDGE: sock, _MTERMINAL_VERSION: BRIDGE_VERSION },
  }
  writeToml(path, cfg)

  // Inject (or refresh) the AGENTS.md instruction that nudges Codex to call
  // task_complete at end of every turn — without it the agent has no reason
  // to invoke our tool.
  try {
    writeAgentsBlock()
  } catch (err) {
    console.error('[agent] writing AGENTS.md block failed:', err)
  }
}

export function uninstallCodexMcp(): void {
  const path = codexConfigPath()
  if (existsSync(path)) {
    const cfg = readTomlSafe(path)
    if (cfg.mcp_servers && typeof cfg.mcp_servers === 'object') {
      delete (cfg.mcp_servers as Record<string, unknown>).mterminal
      if (Object.keys(cfg.mcp_servers as Record<string, unknown>).length === 0) {
        delete cfg.mcp_servers
      }
    }
    writeToml(path, cfg)
  }
  try {
    removeAgentsBlock()
  } catch {
    /* ignore */
  }
}

export function getCodexMcpStatus(): 'missing' | 'installed' | 'mismatch' {
  const cfg = readTomlSafe(codexConfigPath())
  const servers = cfg.mcp_servers as Record<string, unknown> | undefined
  const ours = servers?.mterminal as { env?: Record<string, string> } | undefined
  if (!ours) return 'missing'
  if (ours.env?._MTERMINAL_VERSION !== BRIDGE_VERSION) return 'mismatch'
  return 'installed'
}

// ── IPC ────────────────────────────────────────────────────────────────────

function shellQuote(v: string): string {
  if (process.platform === 'win32') {
    return '"' + v.replace(/(["\\])/g, '\\$1') + '"'
  }
  return "'" + v.replace(/'/g, "'\\''") + "'"
}

/**
 * On startup, refresh existing installations with the current bridge socket
 * path. The socket path is stable per-user but the resource paths or node
 * binary location may have changed (dev vs packaged). Idempotent.
 */
export function refreshAgentInstalls(): void {
  if (getClaudeHooksStatus() !== 'missing') {
    try {
      installClaudeHooks()
    } catch (err) {
      console.error('[agent] refresh Claude hooks failed:', err)
    }
  }
  if (getCodexMcpStatus() !== 'missing') {
    try {
      installCodexMcp()
    } catch (err) {
      console.error('[agent] refresh Codex MCP failed:', err)
    }
  }
}

export function registerHooksInstallerHandlers(): void {
  ipcMain.handle('agent:hooks:status', () => ({
    claude: getClaudeHooksStatus(),
    codex: getCodexMcpStatus(),
    bridgeSocket: agentBridge.socketPath(),
    version: BRIDGE_VERSION,
  }))

  ipcMain.handle('agent:hooks:install', (_e, args: { target: 'claude' | 'codex' }) => {
    if (args.target === 'claude') installClaudeHooks()
    else if (args.target === 'codex') installCodexMcp()
    else throw new Error('Unknown target: ' + args.target)
  })

  ipcMain.handle('agent:hooks:uninstall', (_e, args: { target: 'claude' | 'codex' }) => {
    if (args.target === 'claude') uninstallClaudeHooks()
    else if (args.target === 'codex') uninstallCodexMcp()
    else throw new Error('Unknown target: ' + args.target)
  })
}
