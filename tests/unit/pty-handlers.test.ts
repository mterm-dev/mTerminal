import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'



const ptyState = vi.hoisted(() => ({
  ptys: [] as Array<{
    pid: number
    onData?: (chunk: string) => void
    onExit?: () => void
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
    spawnArgs?: { command: string; args: string[]; opts: Record<string, unknown> }
  }>,
  killThrows: false,
}))

vi.mock('node-pty', () => ({
  spawn: (command: string, args: string[], opts: Record<string, unknown>) => {
    const fake = {
      pid: 1000 + ptyState.ptys.length,
      onData(cb: (s: string) => void) {
        fake.onData = cb as unknown as () => void
      },
      onExit(cb: () => void) {
        fake.onExit = cb
      },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(() => {
        if (ptyState.killThrows) throw new Error('boom')
      }),
      spawnArgs: { command, args, opts },
    } as unknown as {
      pid: number
      onData: (cb: (s: string) => void) => void
      onExit: (cb: () => void) => void
      write: ReturnType<typeof vi.fn>
      resize: ReturnType<typeof vi.fn>
      kill: ReturnType<typeof vi.fn>
      spawnArgs: { command: string; args: string[]; opts: Record<string, unknown> }
    }
    ptyState.ptys.push(fake as never)
    return fake
  },
}))

let currentInvoke: (channel: string, ...args: unknown[]) => unknown = () => {
  throw new Error('mock not loaded yet')
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await currentInvoke(channel, ...args)
}

interface LoadedModules {
  spawnArgsLast: () => { command: string; args: string[]; opts: Record<string, unknown> } | undefined
  lastPty: () => (typeof ptyState.ptys)[number] | undefined
  SESSIONS: Map<number, unknown>
}

async function loadModules(): Promise<LoadedModules> {
  vi.resetModules()
  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  currentInvoke = electronMock.__invoke

  const sessions = await import('../../electron/main/sessions')
  
  sessions.SESSIONS.clear()
  
  
  sessions.setMainWindow({
    isDestroyed: () => false,
    webContents: { send: () => {} },
  } as unknown as Parameters<typeof sessions.setMainWindow>[0])

  const pty = await import('../../electron/main/pty')
  pty.registerPtyHandlers()

  return {
    spawnArgsLast: () => ptyState.ptys[ptyState.ptys.length - 1]?.spawnArgs,
    lastPty: () => ptyState.ptys[ptyState.ptys.length - 1],
    SESSIONS: sessions.SESSIONS as unknown as Map<number, unknown>,
  }
}

describe('pty IPC handlers', () => {
  beforeEach(() => {
    ptyState.ptys.length = 0
    ptyState.killThrows = false
  })

  afterEach(() => {
    
  })

  describe('pty:spawn', () => {
    it('spawns with default shell when none provided; returns numeric session id', async () => {
      const { spawnArgsLast } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      expect(typeof id).toBe('number')
      const sa = spawnArgsLast()!
      expect(typeof sa.command).toBe('string')
      expect(sa.command.length).toBeGreaterThan(0)
    })

    it('passes custom shell + filtered args + env vars', async () => {
      const { spawnArgsLast } = await loadModules()
      await invoke('pty:spawn', {
        rows: 30,
        cols: 100,
        shell: '/bin/zsh',
        args: ['-l', '', '-i'],
        env: { CUSTOM: 'value' },
      })
      const sa = spawnArgsLast()!
      expect(sa.command).toBe('/bin/zsh')
      expect(sa.args).toEqual(['-l', '-i'])
      const env = sa.opts.env as Record<string, string>
      expect(env.TERM).toBe('xterm-256color')
      expect(env.COLORTERM).toBe('truecolor')
      expect(env.MTERMINAL).toBe('1')
      expect(env.CUSTOM).toBe('value')
    })

    it('registers the new session in SESSIONS by id', async () => {
      const { SESSIONS } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      expect(SESSIONS.has(id)).toBe(true)
    })

    it('onData callback pushes into ring buffer; recent-output reflects bytes', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      expect(typeof fake.onData).toBe('function')
      fake.onData!('hello world')
      const out = (await invoke('pty:recent-output', { id })) as string
      expect(out).toBe('hello world')
    })

    it('onExit callback removes the session from SESSIONS', async () => {
      const { lastPty, SESSIONS } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      expect(SESSIONS.has(id)).toBe(true)
      expect(typeof fake.onExit).toBe('function')
      fake.onExit!()
      expect(SESSIONS.has(id)).toBe(false)
    })
  })

  describe('pty:write', () => {
    it('calls pty.write on the matching session', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      await invoke('pty:write', { id, data: 'ls\n' })
      expect(fake.write).toHaveBeenCalledTimes(1)
      expect(fake.write).toHaveBeenCalledWith('ls\n')
    })

    it("throws 'no pty session N' for unknown id", async () => {
      await loadModules()
      await expect(invoke('pty:write', { id: 999, data: 'x' })).rejects.toThrow(
        /no pty session 999/
      )
    })
  })

  describe('pty:resize', () => {
    it('calls pty.resize with cols, rows', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      await invoke('pty:resize', { id, rows: 30, cols: 120 })
      expect(fake.resize).toHaveBeenCalledTimes(1)
      expect(fake.resize).toHaveBeenCalledWith(120, 30)
    })

    it('clamps cols/rows of 0 to 1', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      await invoke('pty:resize', { id, rows: 0, cols: 0 })
      expect(fake.resize).toHaveBeenCalledWith(1, 1)
    })

    it('throws for unknown id', async () => {
      await loadModules()
      await expect(
        invoke('pty:resize', { id: 4242, rows: 24, cols: 80 })
      ).rejects.toThrow(/no pty session 4242/)
    })
  })

  describe('pty:kill', () => {
    it('calls pty.kill and removes session from SESSIONS', async () => {
      const { lastPty, SESSIONS } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      await invoke('pty:kill', { id })
      expect(fake.kill).toHaveBeenCalledTimes(1)
      expect(SESSIONS.has(id)).toBe(false)
    })

    it('is a no-op for unknown id (no throw)', async () => {
      await loadModules()
      await expect(invoke('pty:kill', { id: 12345 })).resolves.not.toThrow()
    })

    it('still removes session if pty.kill throws', async () => {
      const { SESSIONS } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      ptyState.killThrows = true
      await expect(invoke('pty:kill', { id })).resolves.not.toThrow()
      expect(SESSIONS.has(id)).toBe(false)
    })
  })

  describe('pty:info', () => {
    it('returns {cwd, cmd, pid} for a known session', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      const fake = lastPty()!
      
      
      ;(fake as { pid: number }).pid = process.pid
      
      
      const sessions = await import('../../electron/main/sessions')
      const s = sessions.SESSIONS.get(id)!
      ;(s as { pid: number }).pid = process.pid

      const info = (await invoke('pty:info', { id })) as {
        cwd: string | null
        cmd: string | null
        pid: number
      }
      expect(info).toHaveProperty('cwd')
      expect(info).toHaveProperty('cmd')
      expect(info).toHaveProperty('pid')
      
      expect(typeof info.pid).toBe('number')
      if (process.platform === 'linux') {
        
        
        
        expect(info.cwd === null || typeof info.cwd === 'string').toBe(true)
        expect(info.cmd === null || typeof info.cmd === 'string').toBe(true)
      }
    })

    it('throws for unknown id', async () => {
      await loadModules()
      await expect(invoke('pty:info', { id: 7777 })).rejects.toThrow(
        /no pty session 7777/
      )
    })
  })

  describe('pty:recent-output', () => {
    it('with maxBytes returns at most that many bytes from the ring', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      lastPty()!.onData!('hello world')
      const out = (await invoke('pty:recent-output', { id, maxBytes: 5 })) as string
      expect(out).toBe('world')
    })

    it('without maxBytes returns the full buffer', async () => {
      const { lastPty } = await loadModules()
      const id = (await invoke('pty:spawn', { rows: 24, cols: 80 })) as number
      lastPty()!.onData!('hello world')
      const out = (await invoke('pty:recent-output', { id })) as string
      expect(out).toBe('hello world')
    })

    it('throws for unknown id', async () => {
      await loadModules()
      await expect(
        invoke('pty:recent-output', { id: 31337 })
      ).rejects.toThrow(/no pty session 31337/)
    })
  })
})
