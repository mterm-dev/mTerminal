import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  whichOnPath,
  sshArgs,
  buildEnv,
  type HostMeta,
} from '../../electron/main/ssh'

function makeHost(overrides: Partial<HostMeta> = {}): HostMeta {
  return {
    id: 'h1',
    name: 'h1',
    host: 'example.com',
    port: 22,
    user: 'alice',
    auth: 'key',
    ...overrides,
  }
}

describe('sshArgs', () => {
  it('always starts with the base args (-t, ServerAliveInterval=30, port)', () => {
    const args = sshArgs(makeHost({ port: 22 }))
    expect(args.slice(0, 5)).toEqual([
      '-t',
      '-o',
      'ServerAliveInterval=30',
      '-p',
      '22',
    ])
  })

  it("auth='key' WITHOUT identityPath: no -i, no IdentitiesOnly, has PreferredAuthentications=publickey, ends with user@host", () => {
    const args = sshArgs(makeHost({ auth: 'key' }))
    expect(args).not.toContain('-i')
    expect(args.find((a) => a.includes('IdentitiesOnly'))).toBeUndefined()
    expect(args).toContain('PreferredAuthentications=publickey')
    expect(args[args.length - 1]).toBe('alice@example.com')
  })

  it("auth='key' WITH identityPath includes -i and IdentitiesOnly=yes plus PreferredAuthentications=publickey", () => {
    const args = sshArgs(makeHost({ auth: 'key', identityPath: '/x/key' }))
    const i = args.indexOf('-i')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(args[i + 1]).toBe('/x/key')
    expect(args).toContain('IdentitiesOnly=yes')
    expect(args).toContain('PreferredAuthentications=publickey')
  })

  it("auth='key' with empty-string identityPath is treated as no key (no -i)", () => {
    const args = sshArgs(makeHost({ auth: 'key', identityPath: '' }))
    expect(args).not.toContain('-i')
    expect(args.find((a) => a.includes('IdentitiesOnly'))).toBeUndefined()
    expect(args).toContain('PreferredAuthentications=publickey')
  })

  it("auth='password' adds PubkeyAuthentication=no and PreferredAuthentications=password, no -i", () => {
    const args = sshArgs(makeHost({ auth: 'password' }))
    expect(args).toContain('PubkeyAuthentication=no')
    expect(args).toContain('PreferredAuthentications=password')
    expect(args).not.toContain('-i')
  })

  it("auth='agent' adds PreferredAuthentications=publickey and IdentityAgent=$SSH_AUTH_SOCK", () => {
    const args = sshArgs(makeHost({ auth: 'agent' }))
    expect(args).toContain('PreferredAuthentications=publickey')
    expect(args).toContain('IdentityAgent=$SSH_AUTH_SOCK')
  })

  it('unknown auth string falls through: just base args + user@host', () => {
    const args = sshArgs(makeHost({ auth: 'wonky' }))
    expect(args).toEqual([
      '-t',
      '-o',
      'ServerAliveInterval=30',
      '-p',
      '22',
      'alice@example.com',
    ])
  })

  it('final element is always user@host', () => {
    for (const auth of ['key', 'password', 'agent', 'wonky']) {
      const args = sshArgs(makeHost({ auth, user: 'bob', host: 'srv.test' }))
      expect(args[args.length - 1]).toBe('bob@srv.test')
    }
  })

  it('port is stringified', () => {
    const args = sshArgs(makeHost({ port: 2222 }))
    const i = args.indexOf('-p')
    expect(args[i + 1]).toBe('2222')
    expect(typeof args[i + 1]).toBe('string')
  })
})

describe('buildEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns TERM='xterm-256color', COLORTERM='truecolor', MTERMINAL='1'", () => {
    const env = buildEnv()
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.MTERMINAL).toBe('1')
  })

  it('copies HOME from process.env.HOME when set', () => {
    vi.stubEnv('HOME', '/home/alice')
    const env = buildEnv()
    expect(env.HOME).toBe('/home/alice')
  })

  it('copies PATH/USER/LOGNAME/SSH_AUTH_SOCK/LANG when set', () => {
    vi.stubEnv('PATH', '/usr/bin')
    vi.stubEnv('USER', 'alice')
    vi.stubEnv('LOGNAME', 'alice')
    vi.stubEnv('SSH_AUTH_SOCK', '/tmp/agent.sock')
    vi.stubEnv('LANG', 'en_US.UTF-8')
    const env = buildEnv()
    expect(env.PATH).toBe('/usr/bin')
    expect(env.USER).toBe('alice')
    expect(env.LOGNAME).toBe('alice')
    expect(env.SSH_AUTH_SOCK).toBe('/tmp/agent.sock')
    expect(env.LANG).toBe('en_US.UTF-8')
  })

  it('omits PATH/USER/LOGNAME/SSH_AUTH_SOCK/LANG when unset', () => {
    vi.stubEnv('PATH', '')
    vi.stubEnv('USER', '')
    vi.stubEnv('LOGNAME', '')
    vi.stubEnv('SSH_AUTH_SOCK', '')
    vi.stubEnv('LANG', '')
    
    delete (process.env as Record<string, string | undefined>).PATH
    delete (process.env as Record<string, string | undefined>).USER
    delete (process.env as Record<string, string | undefined>).LOGNAME
    delete (process.env as Record<string, string | undefined>).SSH_AUTH_SOCK
    delete (process.env as Record<string, string | undefined>).LANG
    const env = buildEnv()
    expect('PATH' in env).toBe(false)
    expect('USER' in env).toBe(false)
    expect('LOGNAME' in env).toBe(false)
    expect('SSH_AUTH_SOCK' in env).toBe(false)
    expect('LANG' in env).toBe(false)
  })

  it('does NOT copy unrelated keys', () => {
    vi.stubEnv('SECRET', 'shh')
    const env = buildEnv()
    expect('SECRET' in env).toBe(false)
  })
})

describe('whichOnPath', () => {
  let tmpdir: string | null = null

  beforeEach(() => {
    tmpdir = null
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    if (tmpdir) {
      try {
        fs.rmSync(tmpdir, { recursive: true, force: true })
      } catch {}
    }
  })

  it('returns null when PATH is empty string', () => {
    vi.stubEnv('PATH', '')
    expect(whichOnPath('ls')).toBeNull()
  })

  it('returns absolute path when prog exists in a PATH dir', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'whichtest-'))
    const progName = 'mt-test-prog'
    const full = path.join(tmpdir, progName)
    fs.writeFileSync(full, '#!/bin/sh\necho hi\n')
    fs.chmodSync(full, 0o755)
    vi.stubEnv('PATH', tmpdir)
    const found = whichOnPath(progName)
    expect(found).toBe(full)
  })

  it('returns null when not found in PATH', () => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'whichtest-'))
    vi.stubEnv('PATH', tmpdir)
    expect(whichOnPath('definitely-not-installed-xyz123')).toBeNull()
  })
})
