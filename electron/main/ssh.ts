import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as nodePty from 'node-pty'
import {
  RingBuffer,
  SESSIONS,
  nextId,
  getMainWindow,
  type PtySession,
} from './sessions'
import { getHost, getHostPassword, touchLastUsed } from './hosts'

interface SshSpawnArgs {
  rows: number
  cols: number
  hostId: string
}

export interface HostMeta {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: string
  identityPath?: string
  savePassword?: boolean
}

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

export function sshArgs(host: HostMeta): string[] {
  const args: string[] = [
    '-t',
    '-o',
    'ServerAliveInterval=30',
    '-p',
    String(host.port),
  ]
  switch (host.auth) {
    case 'key':
      if (host.identityPath && host.identityPath.length > 0) {
        args.push('-i', host.identityPath, '-o', 'IdentitiesOnly=yes')
      }
      args.push('-o', 'PreferredAuthentications=publickey')
      break
    case 'password':
      args.push('-o', 'PubkeyAuthentication=no')
      args.push('-o', 'PreferredAuthentications=password')
      break
    case 'agent':
      args.push('-o', 'PreferredAuthentications=publickey')
      args.push('-o', 'IdentityAgent=$SSH_AUTH_SOCK')
      break
  }
  args.push(`${host.user}@${host.host}`)
  return args
}

export function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir()
  if (home) env.HOME = home
  for (const k of ['PATH', 'USER', 'LOGNAME', 'SSH_AUTH_SOCK', 'LANG']) {
    const v = process.env[k]
    if (typeof v === 'string') env[k] = v
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.MTERMINAL = '1'
  return env
}

function spawnRaw(opts: {
  rows: number
  cols: number
  command: string
  args: string[]
  env: Record<string, string>
}): number {
  const cwd =
    process.env.HOME || process.env.USERPROFILE || os.homedir() || process.cwd()
  const ptyProc = nodePty.spawn(opts.command, opts.args, {
    name: 'xterm-256color',
    cols: Math.max(1, opts.cols | 0),
    rows: Math.max(1, opts.rows | 0),
    cwd,
    env: opts.env,
  })

  const id = nextId()
  const ring = new RingBuffer()
  const session: PtySession = {
    id,
    pid: ptyProc.pid,
    pty: ptyProc,
    ringBuffer: ring,
    lastActivityMs: Date.now(),
    shell: opts.command,
  }
  SESSIONS.set(id, session)

  const channel = 'pty:event:' + id
  ptyProc.onData((chunk) => {
    const buf = Buffer.from(chunk, 'utf8')
    ring.push(buf)
    session.lastActivityMs = Date.now()
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, { kind: 'data', value: chunk })
    }
  })
  ptyProc.onExit(() => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, { kind: 'exit' })
    }
    SESSIONS.delete(id)
  })

  return id
}

function emitBanner(id: number, banner: string): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('pty:event:' + id, { kind: 'data', value: banner })
  }
}

export function registerSshHandlers(): void {
  ipcMain.handle('ssh:spawn', async (_e, args: SshSpawnArgs) => {
    const host = getHost(args.hostId) as HostMeta | null
    if (!host) throw new Error('host not found')

    let password: string | null = null
    if (host.auth === 'password') {
      if (!host.savePassword) {
        throw new Error(
          'password auth without saved password is not supported — save the password or use key auth'
        )
      }
      try {
        password = getHostPassword(host.id)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (/vault.*lock/i.test(msg)) throw new Error('vault locked')
        throw err
      }
      if (!password) throw new Error('no saved password for host')
    }

    const baseArgs = sshArgs(host)
    let command: string
    let argv: string[]
    let display: string[]
    if (host.auth === 'password') {
      const sshpassPath = whichOnPath('sshpass')
      if (!sshpassPath) throw new Error('sshpass missing on PATH')
      command = 'sshpass'
      argv = ['-p', password as string, 'ssh', ...baseArgs]
      display = ['sshpass', '-p', '***', 'ssh', ...baseArgs]
    } else {
      command = 'ssh'
      argv = baseArgs
      display = ['ssh', ...baseArgs]
    }

    const env = buildEnv()
    const id = spawnRaw({
      rows: args.rows,
      cols: args.cols,
      command,
      args: argv,
      env,
    })
    emitBanner(id, `\x1b[2m[exec] ${display.join(' ')}\x1b[0m\r\n`)

    try {
      await touchLastUsed(args.hostId)
    } catch {}
    return id
  })
}
