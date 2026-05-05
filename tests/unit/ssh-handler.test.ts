import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const TEST_TIMEOUT = 30000

let currentInvoke: (channel: string, ...args: unknown[]) => unknown = () => {
  throw new Error('mock not loaded yet')
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await currentInvoke(channel, ...args)
}

function freshTmpDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-${prefix}-test-${process.pid}-${crypto.randomUUID()}`
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

interface SentEvent {
  channel: string
  payload: unknown
}

interface FakePtySpawnCall {
  command: string
  args: string[]
  options: Record<string, unknown>
}

interface FakePty {
  pid: number
  onData: (cb: (chunk: string) => void) => void
  onExit: (cb: () => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
}

interface HostStub {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: string
  identityPath?: string
  savePassword?: boolean
}

interface LoadedModules {
  sentEvents: SentEvent[]
  ptyCalls: FakePtySpawnCall[]
  setHost: (h: HostStub | null) => void
  setHostPassword: (
    impl: (id: string) => string | null | never
  ) => void
  setTouchLastUsed: (impl: (id: string) => Promise<void>) => void
  touchCalls: string[]
  SESSIONS: Map<number, unknown>
}

let cfgDir: string

async function loadModules(): Promise<LoadedModules> {
  vi.resetModules()

  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  currentInvoke = electronMock.__invoke

  const sentEvents: SentEvent[] = []
  const fakeWindow = {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => {
        sentEvents.push({ channel, payload })
      },
    },
  }

  const ptyCalls: FakePtySpawnCall[] = []
  vi.doMock('node-pty', () => ({
    spawn: (command: string, args: string[], options: Record<string, unknown>): FakePty => {
      ptyCalls.push({ command, args, options })
      const pid = 10000 + ptyCalls.length
      return {
        pid,
        onData: (_cb: (chunk: string) => void) => {},
        onExit: (_cb: () => void) => {},
        write: (_data: string) => {},
        resize: (_cols: number, _rows: number) => {},
        kill: (_signal?: string) => {},
      }
    },
  }))

  const sessionsReal = await import('../../electron/main/sessions')
  vi.doMock('../../electron/main/sessions', () => ({
    ...sessionsReal,
    getMainWindow: () => fakeWindow,
  }))

  let host: HostStub | null = null
  let hostPasswordImpl: (id: string) => string | null = () => null
  let touchImpl: (id: string) => Promise<void> = async () => {}
  const touchCalls: string[] = []
  vi.doMock('../../electron/main/hosts', () => ({
    getHost: (id: string) => (host && host.id === id ? host : null),
    getHostPassword: (id: string) => hostPasswordImpl(id),
    touchLastUsed: async (id: string) => {
      touchCalls.push(id)
      await touchImpl(id)
    },
  }))

  const ssh = await import('../../electron/main/ssh')
  ssh.registerSshHandlers()
  const sessionsMod = await import('../../electron/main/sessions')

  return {
    sentEvents,
    ptyCalls,
    setHost: (h: HostStub | null) => {
      host = h
    },
    setHostPassword: (impl: (id: string) => string | null) => {
      hostPasswordImpl = impl
    },
    setTouchLastUsed: (impl: (id: string) => Promise<void>) => {
      touchImpl = impl
    },
    touchCalls,
    SESSIONS: sessionsMod.SESSIONS as Map<number, unknown>,
  }
}

function makeHost(over: Partial<HostStub> = {}): HostStub {
  return {
    id: 'h1',
    name: 'h1',
    host: 'example.com',
    port: 22,
    user: 'alice',
    auth: 'key',
    savePassword: false,
    ...over,
  }
}

describe('ssh:spawn IPC handler', () => {
  let prevPath: string | undefined
  let savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    cfgDir = freshTmpDir('ssh-handler')
    process.env.XDG_CONFIG_HOME = cfgDir
    prevPath = process.env.PATH
    savedEnv = {
      HOME: process.env.HOME,
      USER: process.env.USER,
    }
  })

  afterEach(() => {
    vi.doUnmock('node-pty')
    vi.doUnmock('../../electron/main/sessions')
    vi.doUnmock('../../electron/main/hosts')
    if (prevPath === undefined) delete process.env.PATH
    else process.env.PATH = prevPath
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    try {
      fs.rmSync(cfgDir, { recursive: true, force: true })
    } catch {}
  })

  it('non-existent host throws "host not found"', async () => {
    const { setHost } = await loadModules()
    setHost(null)
    await expect(
      invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'missing' })
    ).rejects.toThrow(/host not found/)
  })

  it("auth='key' spawns ssh directly with proper argv and emits banner", async () => {
    const { setHost, ptyCalls, sentEvents } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'key', user: 'alice', host: 'srv.test', port: 2222 }))

    const id = (await invoke('ssh:spawn', {
      rows: 24,
      cols: 80,
      hostId: 'h1',
    })) as number
    expect(typeof id).toBe('number')

    expect(ptyCalls).toHaveLength(1)
    const call = ptyCalls[0]!
    expect(call.command).toBe('ssh')
    
    expect(call.args.slice(0, 5)).toEqual([
      '-t',
      '-o',
      'ServerAliveInterval=30',
      '-p',
      '2222',
    ])
    
    expect(call.args[call.args.length - 1]).toBe('alice@srv.test')

    
    const channel = 'pty:event:' + id
    const banners = sentEvents.filter((e) => e.channel === channel)
    expect(banners.length).toBeGreaterThan(0)
    const banner = banners[0]!.payload as { kind: string; value: string }
    expect(banner.kind).toBe('data')
    expect(banner.value).toContain('[exec] ssh')
    
    expect(banner.value).toContain('\x1b[2m')
  })

  it("auth='password' with savePassword=false throws", async () => {
    const { setHost } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'password', savePassword: false }))
    await expect(
      invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'h1' })
    ).rejects.toThrow(/password auth without saved password is not supported/)
  })

  it("auth='password' + savePassword + locked vault rethrows as 'vault locked'", async () => {
    const { setHost, setHostPassword } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'password', savePassword: true }))
    setHostPassword(() => {
      throw new Error('vault is locked')
    })
    await expect(
      invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'h1' })
    ).rejects.toThrow(/^vault locked$/)
  })

  it("auth='password' + savePassword + no stored password throws 'no saved password'", async () => {
    const { setHost, setHostPassword } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'password', savePassword: true }))
    setHostPassword(() => null)
    await expect(
      invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'h1' })
    ).rejects.toThrow(/no saved password for host/)
  })

  it("auth='password' but sshpass missing on PATH throws 'sshpass missing on PATH'", async () => {
    const { setHost, setHostPassword } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'password', savePassword: true }))
    setHostPassword(() => 'sekrit')
    
    const emptyDir = freshTmpDir('ssh-empty-path')
    process.env.PATH = emptyDir
    try {
      await expect(
        invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'h1' })
      ).rejects.toThrow(/sshpass missing on PATH/)
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it(
    "auth='password' with sshpass on PATH spawns sshpass with masked banner",
    { timeout: TEST_TIMEOUT },
    async () => {
      const { setHost, setHostPassword, ptyCalls, sentEvents } = await loadModules()
      setHost(
        makeHost({
          id: 'h1',
          auth: 'password',
          savePassword: true,
          user: 'bob',
          host: 'srv.test',
          port: 22,
        })
      )
      setHostPassword(() => 'TopSecretPwd')

      
      const binDir = freshTmpDir('ssh-bin')
      const isWin = process.platform === 'win32'
      const exeName = isWin ? 'sshpass.exe' : 'sshpass'
      const exePath = path.join(binDir, exeName)
      fs.writeFileSync(exePath, isWin ? '' : '#!/bin/sh\nexit 0\n')
      if (!isWin) fs.chmodSync(exePath, 0o755)
      process.env.PATH = binDir

      try {
        const id = (await invoke('ssh:spawn', {
          rows: 24,
          cols: 80,
          hostId: 'h1',
        })) as number
        expect(typeof id).toBe('number')

        expect(ptyCalls).toHaveLength(1)
        const call = ptyCalls[0]!
        expect(call.command).toBe('sshpass')

        expect(call.args[0]).toBe('-e')
        expect(call.args[1]).toBe('ssh')
        expect(call.args[call.args.length - 1]).toBe('bob@srv.test')

        expect((call.options as { env?: Record<string, string> }).env?.['SSHPASS']).toBe('TopSecretPwd')
        expect(call.args).not.toContain('TopSecretPwd')


        const banner = sentEvents.find((e) => e.channel === 'pty:event:' + id)!
          .payload as { kind: string; value: string }
        expect(banner.value).toContain('sshpass -e ssh')
        expect(banner.value).not.toContain('TopSecretPwd')
      } finally {
        fs.rmSync(binDir, { recursive: true, force: true })
      }
    }
  )

  it('successful spawn calls touchLastUsed(hostId)', async () => {
    const { setHost, touchCalls } = await loadModules()
    setHost(makeHost({ id: 'host-xyz', auth: 'key' }))
    await invoke('ssh:spawn', { rows: 24, cols: 80, hostId: 'host-xyz' })
    expect(touchCalls).toEqual(['host-xyz'])
  })

  it('touchLastUsed rejection is swallowed; handler still resolves with id', async () => {
    const { setHost, setTouchLastUsed } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'key' }))
    setTouchLastUsed(async () => {
      throw new Error('disk full')
    })
    const id = (await invoke('ssh:spawn', {
      rows: 24,
      cols: 80,
      hostId: 'h1',
    })) as number
    expect(typeof id).toBe('number')
  })

  it('returned id is a number registered in SESSIONS', async () => {
    const { setHost, SESSIONS } = await loadModules()
    setHost(makeHost({ id: 'h1', auth: 'key' }))
    const id = (await invoke('ssh:spawn', {
      rows: 24,
      cols: 80,
      hostId: 'h1',
    })) as number
    expect(typeof id).toBe('number')
    expect(SESSIONS.has(id)).toBe(true)
  })
})
