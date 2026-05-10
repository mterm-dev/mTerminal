import { ipcMain } from 'electron'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
import * as nodePty from 'node-pty'
import pidtree from 'pidtree'
import {
  RingBuffer,
  SESSIONS,
  nextId,
  getMainWindow,
  type PtySession,
} from './sessions'
import {
  buildWslSpawnArgs,
  readWslProcInfo,
  newestWslChildPid,
} from './wsl'

export { setMainWindow } from './sessions'

export function whichOnPath(prog: string): string | null {
  const PATH = process.env.PATH
  if (!PATH) return null
  const sep = process.platform === 'win32' ? ';' : ':'
  const isWin = process.platform === 'win32'
  const exts = isWin
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT')
        .split(';')
        .filter((s) => s.length > 0)
    : ['']
  for (const dir of PATH.split(sep)) {
    if (!dir) continue
    const base = path.join(dir, prog)
    for (const ext of exts) {
      const candidate = ext ? base + ext : base
      try {
        const st = fs.statSync(candidate)
        if (st.isFile()) return candidate
      } catch {}
    }
  }
  return null
}

function loginShellUnix(): string {
  let username: string | null = null
  try {
    username = os.userInfo().username
  } catch {
    username = process.env.USER || process.env.LOGNAME || null
  }
  if (username && process.platform === 'darwin') {
    try {
      const out = execFileSync(
        'dscl',
        ['.', '-read', `/Users/${username}`, 'UserShell'],
        { encoding: 'utf8', timeout: 1000 }
      )
      const m = /UserShell:\s*(.+)/.exec(out)
      if (m && m[1]) {
        const shell = m[1].trim()
        try {
          fs.statSync(shell)
          return shell
        } catch {}
      }
    } catch {}
  }
  if (username) {
    try {
      const passwd = fs.readFileSync('/etc/passwd', 'utf8')
      for (const line of passwd.split('\n')) {
        const fields = line.split(':')
        if (fields[0] === username) {
          const shell = fields[6] || ''
          if (shell) {
            try {
              fs.statSync(shell)
              return shell
            } catch {}
          }
        }
      }
    } catch {}
  }
  return process.env.SHELL || '/bin/bash'
}

function loginShellWindows(): string {
  const candidates: (string | undefined | null)[] = [
    process.env.MTERMINAL_SHELL,
    whichOnPath('pwsh.exe'),
    whichOnPath('powershell.exe'),
    process.env.COMSPEC,
    'cmd.exe',
  ]
  for (const c of candidates) {
    if (!c) continue
    try {
      fs.statSync(c)
      return c
    } catch {
      const resolved = whichOnPath(c)
      if (resolved) return resolved
    }
  }
  return 'cmd.exe'
}

function loginShell(): string {
  return process.platform === 'win32' ? loginShellWindows() : loginShellUnix()
}

interface SpawnArgs {
  rows: number
  cols: number
  shell?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export function resolveSpawnCwd(requested?: string | null): string {
  const home =
    process.env.HOME || process.env.USERPROFILE || os.homedir() || process.cwd()
  if (requested && requested.length > 0) {
    try {
      const st = fs.statSync(requested)
      if (st.isDirectory()) return requested
    } catch {}
  }
  return home
}

export function buildEnv(
  shell: string,
  extra: Record<string, string> | undefined
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v
  }
  env.SHELL = shell
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.MTERMINAL = '1'
  if (extra) {
    for (const [k, v] of Object.entries(extra)) env[k] = v
  }
  return env
}

export function spawnSession(opts: {
  rows: number
  cols: number
  shell: string
  args: string[]
  env: Record<string, string>
  cwd?: string
  wslDistro?: string
}): number {
  const cwd = resolveSpawnCwd(opts.cwd)
  const id = nextId()
  // Inject the bridge env so AI agents started inside this PTY (claude /
  // codex) can talk back to mTerminal. Lazy-required to avoid pulling the
  // agents subsystem into the PTY bootstrap path during early init.
  let bridgePath = ''
  try {
    const { agentBridge } = require('./agents/bridge-server') as typeof import('./agents/bridge-server')
    bridgePath = agentBridge.socketPath() ?? ''
  } catch {
    /* bridge optional */
  }
  const env = {
    ...opts.env,
    MTERMINAL_TAB_ID: String(id),
    ...(bridgePath ? { MTERMINAL_BRIDGE: bridgePath } : {}),
  }
  const ptyProc = nodePty.spawn(opts.shell, opts.args, {
    name: 'xterm-256color',
    cols: Math.max(1, opts.cols | 0),
    rows: Math.max(1, opts.rows | 0),
    cwd,
    env,
  })


  const ring = new RingBuffer()
  const session: PtySession = {
    id,
    pid: ptyProc.pid,
    pty: ptyProc,
    ringBuffer: ring,
    lastActivityMs: Date.now(),
    shell: opts.shell,
    ...(opts.wslDistro ? { wslDistro: opts.wslDistro } : {}),
  }
  SESSIONS.set(id, session)

  const channel = 'pty:event:' + id
  // Lazy import to avoid a circular dependency between extensions and PTY
  // bootstrap. Throttle the bus broadcast so high-frequency producers (yes,
  // tail -f, etc.) don't flood the renderer; chunks accumulate between ticks.
  let extBus: { emitThrottled: (event: string, payload: unknown, intervalMs: number) => void; emit: (event: string, payload: unknown) => void } | null = null
  const ensureExtBus = (): typeof extBus => {
    if (extBus) return extBus
    try {
      const mod = require('./extensions/event-bus-main') as {
        getMainEventBus: () => NonNullable<typeof extBus>
      }
      extBus = mod.getMainEventBus()
    } catch {
      extBus = null
    }
    return extBus
  }
  // Announce the new PTY to extensions. tabId is unknown here — the renderer
  // associates ptyId with tabId via setPtyMap; plugins that care about tabId
  // should listen on `app:terminal:created` and look up tabId via
  // `ctx.workspace.tabs()` afterwards.
  {
    const bus = ensureExtBus()
    if (bus) bus.emit('app:terminal:created', { ptyId: id, kind: 'local' })
  }
  ptyProc.onData((chunk) => {
    const buf = Buffer.from(chunk, 'utf8')
    ring.push(buf)
    session.lastActivityMs = Date.now()
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, { kind: 'data', value: chunk })
    }
    const bus = ensureExtBus()
    if (bus) {
      bus.emitThrottled('app:terminal:output', { ptyId: id, chunk }, 33)
    }
  })
  ptyProc.onExit(() => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, { kind: 'exit' })
    }
    const bus = ensureExtBus()
    if (bus) bus.emit('app:terminal:exit', { ptyId: id })
    SESSIONS.delete(id)
    WSL_INFO_CACHE.delete(id)
  })

  return id
}

export interface NodeInfo {
  pid: number
  ppid: number
}

export function pickNewestLeaf(
  rootPid: number,
  nodes: NodeInfo[],
  startTimes: Map<number, number>
): number {
  const children = new Map<number, NodeInfo[]>()
  for (const n of nodes) {
    const arr = children.get(n.ppid)
    if (arr) arr.push(n)
    else children.set(n.ppid, [n])
  }
  let current = rootPid
  for (let depth = 0; depth <= 16; depth++) {
    const kids = children.get(current)
    if (!kids || kids.length === 0) return current
    let best: NodeInfo | null = null
    let bestStart = -1
    for (const k of kids) {
      if (k.pid === current) continue
      const st = startTimes.get(k.pid) ?? 0
      if (best === null || st >= bestStart) {
        best = k
        bestStart = st
      }
    }
    if (!best) return current
    current = best.pid
  }
  return current
}

function startTimesLinux(pids: number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const pid of pids) {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
      const close = stat.lastIndexOf(')')
      if (close < 0) continue
      const tail = stat.slice(close + 2).split(' ')
      const v = Number(tail[19])
      if (Number.isFinite(v)) m.set(pid, v)
    } catch {}
  }
  return m
}

function readLinuxComm(pid: number): string | null {
  try {
    return fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() || null
  } catch {
    return null
  }
}

function readLinuxCwd(pid: number): string | null {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    return null
  }
}

export interface ProcInfo {
  cwd: string | null
  cmd: string | null
}

export async function readProcInfo(pid: number): Promise<ProcInfo> {
  if (process.platform === 'linux') {
    return { cwd: readLinuxCwd(pid), cmd: readLinuxComm(pid) }
  }
  if (process.platform === 'darwin') {
    let cwd: string | null = null
    let cmd: string | null = null
    try {
      const { stdout } = await execFileP(
        'lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
        { encoding: 'utf8' }
      )
      for (const line of stdout.split('\n')) {
        if (line.startsWith('n')) {
          cwd = line.slice(1)
          break
        }
      }
    } catch {}
    try {
      const { stdout } = await execFileP(
        'ps',
        ['-o', 'comm=', '-p', String(pid)],
        { encoding: 'utf8' }
      )
      const out = stdout.trim()
      if (out) cmd = path.basename(out)
    } catch {}
    return { cwd, cmd }
  }
  if (process.platform === 'win32') {
    let cwd: string | null = null
    let cmd: string | null = null
    try {
      const { stdout } = await execFileP(
        'wmic',
        ['process', 'where', `ProcessId=${pid}`, 'get', 'Name,ExecutablePath', '/format:list'],
        { encoding: 'utf8' }
      )
      for (const rawLine of stdout.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (line.startsWith('Name=')) {
          let name = line.slice('Name='.length)
          if (name.toLowerCase().endsWith('.exe')) name = name.slice(0, -4)
          if (name) cmd = name
        }
        if (line.startsWith('ExecutablePath=')) {
          const p = line.slice('ExecutablePath='.length)
          if (p) cwd = path.dirname(p)
        }
      }
    } catch {
      try {
        const { stdout } = await execFileP(
          'tasklist',
          ['/fi', `PID eq ${pid}`, '/fo', 'csv', '/nh'],
          { encoding: 'utf8' }
        )
        const first = stdout.split('\n')[0]?.trim()
        if (first) {
          const m = /^"([^"]+)"/.exec(first)
          if (m) {
            let name = m[1]!
            if (name.toLowerCase().endsWith('.exe')) name = name.slice(0, -4)
            cmd = name
          }
        }
      } catch {}
    }
    return { cwd, cmd }
  }
  return { cwd: null, cmd: null }
}

async function ptyInfo(
  rootPid: number
): Promise<{ cwd: string | null; cmd: string | null; pid: number }> {
  let leaf = rootPid
  try {
    const advanced = (await pidtree(rootPid, {
      root: false,
      advanced: true,
    } as never)) as unknown as Array<{ pid: number; ppid: number }>
    const nodes = advanced.map((n) => ({ pid: n.pid, ppid: n.ppid }))
    const allPids = [rootPid, ...nodes.map((n) => n.pid)]
    const starts =
      process.platform === 'linux' ? startTimesLinux(allPids) : new Map<number, number>()
    leaf = pickNewestLeaf(rootPid, nodes, starts)
  } catch {
    leaf = rootPid
  }
  const info = await readProcInfo(leaf)
  if (info.cwd === null && info.cmd === null && leaf !== rootPid) {
    const fallback = await readProcInfo(rootPid)
    return { cwd: fallback.cwd, cmd: fallback.cmd, pid: leaf }
  }
  return { cwd: info.cwd, cmd: info.cmd, pid: leaf }
}

interface WslInfoCacheEntry {
  expiresAt: number
  promise: Promise<{ cwd: string | null; cmd: string | null; pid: number }>
}
const WSL_INFO_CACHE = new Map<number, WslInfoCacheEntry>()
const WSL_INFO_TTL_MS = 1500

async function wslPtyInfo(
  sessionId: number,
  distro: string
): Promise<{ cwd: string | null; cmd: string | null; pid: number }> {
  const now = Date.now()
  const cached = WSL_INFO_CACHE.get(sessionId)
  if (cached && cached.expiresAt > now) return cached.promise
  const promise = (async () => {
    const pid = await newestWslChildPid(distro)
    if (pid === null) return { cwd: null, cmd: null, pid: 0 }
    const info = await readWslProcInfo(distro, pid)
    return { cwd: info.cwd, cmd: info.cmd, pid }
  })()
  WSL_INFO_CACHE.set(sessionId, { expiresAt: now + WSL_INFO_TTL_MS, promise })
  promise.catch(() => {
    WSL_INFO_CACHE.delete(sessionId)
  })
  return promise
}

export function resolveWslSentinel(
  shell: string
): { shell: string; args: string[]; wslDistro: string } | null {
  const m = /^wsl:\/\/(.*)$/.exec(shell)
  if (!m) return null
  const distro = (m[1] ?? '').trim()
  const built = buildWslSpawnArgs(distro || null, null)
  if (!built) return null
  return { shell: built.shell, args: built.args, wslDistro: distro }
}

export function registerPtyHandlers(): void {
  ipcMain.handle('pty:spawn', (_e, args: SpawnArgs) => {
    const requested =
      args.shell && args.shell.trim().length > 0 ? args.shell : loginShell()
    const wsl = resolveWslSentinel(requested)
    const shell = wsl ? wsl.shell : requested
    const passedArgs = (args.args ?? []).filter((a) => a !== '')
    const finalArgs = wsl ? wsl.args : passedArgs
    const env = buildEnv(shell, args.env)
    return spawnSession({
      rows: args.rows,
      cols: args.cols,
      shell,
      args: finalArgs,
      env,
      cwd: args.cwd,
      ...(wsl ? { wslDistro: wsl.wslDistro } : {}),
    })
  })

  ipcMain.handle(
    'pty:write',
    (_e, args: { id: number; data: string }) => {
      const s = SESSIONS.get(args.id)
      if (!s) throw new Error(`no pty session ${args.id}`)
      s.pty.write(args.data)
    }
  )

  ipcMain.handle(
    'pty:resize',
    (_e, args: { id: number; rows: number; cols: number }) => {
      const s = SESSIONS.get(args.id)
      if (!s) throw new Error(`no pty session ${args.id}`)
      s.pty.resize(Math.max(1, args.cols | 0), Math.max(1, args.rows | 0))
    }
  )

  ipcMain.handle('pty:kill', (_e, args: { id: number }) => {
    const s = SESSIONS.get(args.id)
    if (!s) return
    try {
      s.pty.kill()
    } catch {}
    SESSIONS.delete(args.id)
    WSL_INFO_CACHE.delete(args.id)
  })

  ipcMain.handle('pty:info', async (_e, args: { id: number }) => {
    const s = SESSIONS.get(args.id)
    if (!s) throw new Error(`no pty session ${args.id}`)
    if (s.wslDistro !== undefined) {
      return wslPtyInfo(s.id, s.wslDistro)
    }
    return ptyInfo(s.pid)
  })

  ipcMain.handle(
    'pty:recent-output',
    (_e, args: { id: number; maxBytes?: number }) => {
      const s = SESSIONS.get(args.id)
      if (!s) throw new Error(`no pty session ${args.id}`)
      const cap = args.maxBytes ?? s.ringBuffer.length
      return s.ringBuffer.tail(cap)
    }
  )
}
