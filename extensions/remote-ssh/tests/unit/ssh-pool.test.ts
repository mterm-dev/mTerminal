import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { SshPool } from '../../src/lib/ssh-pool'
import type { SftpAuthBundle } from '../../src/shared/types'

interface FakeClient extends EventEmitter {
  connect(cfg: unknown): void
  end(): void
  sftp(cb: (err: Error | null, sftp: unknown) => void): void
  shell(opts: unknown, cb: (err: Error | null, stream: unknown) => void): void
}

function makeFakeClient(opts: { failOnConnect?: boolean } = {}): FakeClient {
  const ee = new EventEmitter() as FakeClient
  ee.connect = (): void => {
    setImmediate(() => {
      if (opts.failOnConnect) {
        ee.emit('error', new Error('boom'))
      } else {
        ee.emit('ready')
      }
    })
  }
  ee.end = (): void => {
    ee.emit('end')
    ee.emit('close')
  }
  ee.sftp = (cb): void => {
    setImmediate(() => cb(null, { _fake: true } as unknown))
  }
  ee.shell = (_opts, cb): void => {
    setImmediate(() => {
      const stream = new EventEmitter() as unknown as {
        stderr: EventEmitter
        write(d: string): void
        end(): void
        setWindow(r: number, c: number, h: number, w: number): void
      }
      ;(stream as unknown as EventEmitter).on = (
        EventEmitter.prototype as unknown as { on: typeof EventEmitter.prototype.on }
      ).on.bind(stream)
      stream.stderr = new EventEmitter()
      stream.write = vi.fn()
      stream.end = vi.fn()
      stream.setWindow = vi.fn()
      cb(null, stream)
    })
  }
  return ee
}

const auth: SftpAuthBundle = {
  hostId: 'h_1',
  host: '127.0.0.1',
  port: 22,
  user: 'root',
  auth: 'agent',
}

describe('SshPool', () => {
  let pool: SshPool

  beforeEach(() => {
    process.env.SSH_AUTH_SOCK = '/tmp/fake-agent.sock'
    pool = new SshPool()
  })

  afterEach(() => {
    pool.disconnectAll()
    pool.stopGc()
  })

  it('connects with agent auth and reuses session', async () => {
    pool.setClientFactory(() => makeFakeClient() as unknown as never)
    const e1 = await pool.ensureConnected(auth)
    expect(e1.ready).toBe(true)
    const e2 = await pool.ensureConnected(auth)
    expect(e2).toBe(e1)
    expect(pool.size()).toBe(1)
  })

  it('rejects with EHOSTAUTH when ssh client emits error', async () => {
    pool.setClientFactory(() => makeFakeClient({ failOnConnect: true }) as unknown as never)
    await expect(pool.ensureConnected(auth)).rejects.toMatchObject({ code: 'EHOSTAUTH' })
    expect(pool.size()).toBe(0)
  })

  it('status reports disconnected for unknown host', () => {
    expect(pool.status('h_unknown')).toEqual({ connected: false, lastError: null })
  })

  it('disconnects host', async () => {
    pool.setClientFactory(() => makeFakeClient() as unknown as never)
    await pool.ensureConnected(auth)
    expect(pool.size()).toBe(1)
    pool.disconnect(auth.hostId)
    expect(pool.size()).toBe(0)
  })

  it('agent auth requires SSH_AUTH_SOCK', async () => {
    delete process.env.SSH_AUTH_SOCK
    pool.setClientFactory(() => makeFakeClient() as unknown as never)
    await expect(pool.ensureConnected(auth)).rejects.toMatchObject({ code: 'EHOSTAUTH' })
  })

  it('parallel ensureConnected reuses same connecting promise', async () => {
    let createdClients = 0
    pool.setClientFactory(() => {
      createdClients++
      return makeFakeClient() as unknown as never
    })
    const [a, b, c] = await Promise.all([
      pool.ensureConnected(auth),
      pool.ensureConnected(auth),
      pool.ensureConnected(auth),
    ])
    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(createdClients).toBe(1)
  })
})
