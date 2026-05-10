import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'

const TEST_TIMEOUT = 10000

interface McpStatus {
  running: boolean
  socketPath: string | null
}

interface LoadedMcp {
  startServer: () => Promise<McpStatus>
  stopServer: () => Promise<McpStatus>
  statusServer: () => McpStatus
  registerMcpHandlers: () => void
  invoke: (channel: string, ...args: unknown[]) => unknown
}

let cfgDir: string
let prevXdg: string | undefined

async function loadMcp(): Promise<LoadedMcp> {
  
  const { vi } = await import('vitest')
  vi.resetModules()
  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  const mcp = await import('../../electron/main/mcp')
  return {
    startServer: mcp.startServer,
    stopServer: mcp.stopServer,
    statusServer: mcp.statusServer,
    registerMcpHandlers: mcp.registerMcpHandlers,
    invoke: electronMock.__invoke,
  }
}

function freshTmpDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-${prefix}-test-${process.pid}-${crypto.randomUUID()}`
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function expectedSocketPath(base: string): string {
  const user = os.userInfo().username || 'user'
  return path.join(base, `mterminal-mcp-${user}.sock`)
}

interface ClientResult {
  bytes: string
}

function sendAndReceive(
  socketPath: string,
  payload: string,
  opts: { expectResponse: boolean; waitMs?: number; timeoutMs?: number } = {
    expectResponse: true,
  }
): Promise<ClientResult> {
  const timeoutMs = opts.timeoutMs ?? 5000
  return new Promise<ClientResult>((resolve, reject) => {
    const client = net.createConnection({ path: socketPath })
    let received = ''
    let settled = false

    const cleanup = (): void => {
      try {
        client.destroy()
      } catch {}
    }

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      if (opts.expectResponse) {
        reject(new Error(`timeout waiting for response (got ${JSON.stringify(received)})`))
      } else {
        resolve({ bytes: received })
      }
    }, opts.expectResponse ? timeoutMs : opts.waitMs ?? 200)

    client.setEncoding('utf8')
    client.on('connect', () => {
      client.write(payload)
    })
    client.on('data', (chunk: string) => {
      received += chunk
      if (received.includes('\n') && opts.expectResponse && !settled) {
        settled = true
        clearTimeout(timer)
        cleanup()
        resolve({ bytes: received })
      }
    })
    client.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('mcp server lifecycle + IPC', () => {
  let mcp: LoadedMcp | null = null

  beforeEach(() => {
    cfgDir = freshTmpDir('mcp-server')
    prevXdg = process.env.XDG_RUNTIME_DIR
    process.env.XDG_RUNTIME_DIR = cfgDir
    mcp = null
  })

  afterEach(async () => {
    
    try {
      if (mcp) {
        await mcp.stopServer()
      }
    } catch {}
    if (prevXdg === undefined) delete process.env.XDG_RUNTIME_DIR
    else process.env.XDG_RUNTIME_DIR = prevXdg
    try {
      fs.rmSync(cfgDir, { recursive: true, force: true })
    } catch {}
  })

  it('statusServer() initially → {running:false, socketPath:null}', async () => {
    mcp = await loadMcp()
    expect(mcp.statusServer()).toEqual({ running: false, socketPath: null })
  })

  it('computeSocketPath returns a Windows named-pipe path on win32', async () => {
    const { computeSocketPath } = await import('../../electron/main/mcp')
    const sp = computeSocketPath()
    if (process.platform === 'win32') {
      expect(sp.startsWith('\\\\.\\pipe\\mterminal-mcp-')).toBe(true)
    } else {
      expect(sp.startsWith('\\\\.\\pipe\\')).toBe(false)
    }
  })

  it.skipIf(process.platform === 'win32')(
    'startServer() returns running:true and socket file exists',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      const expected = expectedSocketPath(cfgDir)
      expect(status).toEqual({ running: true, socketPath: expected })
      expect(fs.existsSync(expected)).toBe(true)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'startServer() called twice returns same status without re-binding',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const a = await mcp.startServer()
      const b = await mcp.startServer()
      expect(b).toEqual(a)
      expect(b.running).toBe(true)
      expect(b.socketPath).toBe(a.socketPath)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'concurrent startServer() calls resolve to the same status without EADDRINUSE',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const [a, b, c] = await Promise.all([
        mcp.startServer(),
        mcp.startServer(),
        mcp.startServer(),
      ])
      expect(a.running).toBe(true)
      expect(b.running).toBe(true)
      expect(c.running).toBe(true)
      expect(a.socketPath).toBe(b.socketPath)
      expect(a.socketPath).toBe(c.socketPath)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'socket file has mode 0o600 after startServer()',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      const sp = status.socketPath as string
      const mode = fs.statSync(sp).mode & 0o777
      expect(mode).toBe(0o600)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'real client can send a JSON-RPC ping and receive {result:{}}',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      expect(status.socketPath).not.toBeNull()
      const sp = status.socketPath as string
      const { bytes } = await sendAndReceive(
        sp,
        '{"jsonrpc":"2.0","id":1,"method":"ping"}\n',
        { expectResponse: true }
      )
      const parsed = JSON.parse(bytes.trim())
      expect(parsed.jsonrpc).toBe('2.0')
      expect(parsed.id).toBe(1)
      expect(parsed.result).toEqual({})
    }
  )

  it.skipIf(process.platform === 'win32')(
    "tools/list returns three tool definitions",
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      const sp = status.socketPath as string
      const { bytes } = await sendAndReceive(
        sp,
        '{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n',
        { expectResponse: true }
      )
      const parsed = JSON.parse(bytes.trim())
      expect(parsed.id).toBe(2)
      expect(Array.isArray(parsed.result.tools)).toBe(true)
      expect(parsed.result.tools).toHaveLength(3)
      const names = parsed.result.tools.map((t: { name: string }) => t.name)
      expect(names.sort()).toEqual(['get_output', 'list_tabs', 'send_keys'])
    }
  )

  it.skipIf(process.platform === 'win32')(
    'notification (no id) gets no response',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      const sp = status.socketPath as string
      const { bytes } = await sendAndReceive(
        sp,
        '{"jsonrpc":"2.0","method":"notifications/initialized"}\n',
        { expectResponse: false, waitMs: 200 }
      )
      expect(bytes).toBe('')
    }
  )

  it.skipIf(process.platform === 'win32')(
    'startServer overwrites a stale socket file',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const expected = expectedSocketPath(cfgDir)
      
      fs.writeFileSync(expected, 'stale')
      expect(fs.existsSync(expected)).toBe(true)
      const status = await mcp.startServer()
      expect(status.running).toBe(true)
      expect(status.socketPath).toBe(expected)
      
      const { bytes } = await sendAndReceive(
        expected,
        '{"jsonrpc":"2.0","id":3,"method":"ping"}\n',
        { expectResponse: true }
      )
      const parsed = JSON.parse(bytes.trim())
      expect(parsed.id).toBe(3)
      expect(parsed.result).toEqual({})
    }
  )

  it.skipIf(process.platform === 'win32')(
    'stopServer() resets state, removes the socket file, and start works again',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      const sp = status.socketPath as string
      expect(fs.existsSync(sp)).toBe(true)

      const stopped = await mcp.stopServer()
      expect(stopped).toEqual({ running: false, socketPath: null })
      expect(fs.existsSync(sp)).toBe(false)
      expect(mcp.statusServer()).toEqual({ running: false, socketPath: null })

      
      const restarted = await mcp.startServer()
      expect(restarted.running).toBe(true)
      expect(restarted.socketPath).toBe(sp)
    }
  )

  it.skipIf(process.platform === 'win32')(
    'mcp:status, mcp:start, mcp:stop IPC handlers drive lifecycle',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      mcp.registerMcpHandlers()

      const initial = (await mcp.invoke('mcp:status')) as McpStatus
      expect(initial).toEqual({ running: false, socketPath: null })

      const started = (await mcp.invoke('mcp:start')) as McpStatus
      expect(started.running).toBe(true)
      expect(started.socketPath).toBe(expectedSocketPath(cfgDir))

      const status = (await mcp.invoke('mcp:status')) as McpStatus
      expect(status).toEqual(started)

      const stopped = (await mcp.invoke('mcp:stop')) as McpStatus
      expect(stopped).toEqual({ running: false, socketPath: null })

      const after = (await mcp.invoke('mcp:status')) as McpStatus
      expect(after).toEqual({ running: false, socketPath: null })
    }
  )

  it.skipIf(process.platform === 'win32')(
    'startServer() returns a unix socket path on POSIX',
    { timeout: TEST_TIMEOUT },
    async () => {
      mcp = await loadMcp()
      const status = await mcp.startServer()
      expect(status.running).toBe(true)
      expect(status.socketPath).not.toBeNull()
      expect(status.socketPath?.startsWith('\\\\.\\pipe\\')).toBe(false)
    },
  )
})
