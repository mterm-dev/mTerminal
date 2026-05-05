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

interface HostMeta {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: string
  identityPath?: string
  savePassword: boolean
  lastUsed?: number
  groupId?: string
}

interface HostGroup {
  id: string
  name: string
  collapsed: boolean
  accent: string
}

interface HostListResult {
  hosts: HostMeta[]
  groups: HostGroup[]
}

interface SshKey {
  path: string
  name: string
  keyType: string
}

function defaultHost(over: Partial<HostMeta> = {}): HostMeta {
  return {
    id: '',
    name: 'host',
    host: 'example.com',
    port: 22,
    user: 'root',
    auth: 'key',
    savePassword: false,
    ...over,
  }
}

function defaultGroup(over: Partial<HostGroup> = {}): HostGroup {
  return {
    id: '',
    name: 'g',
    collapsed: false,
    accent: 'blue',
    ...over,
  }
}

let cfgDir: string



async function loadModules(): Promise<{
  registerHostsHandlers: () => void
  registerVaultHandlers: () => void
  getHost: (id: string) => HostMeta | null
  touchLastUsed: (id: string) => Promise<void>
  vaultGetHostPassword: (id: string) => string | null
  vaultIsUnlocked: () => boolean
}> {
  vi.resetModules()
  
  
  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  currentInvoke = electronMock.__invoke
  const vault = await import('../../electron/main/vault')
  const hosts = await import('../../electron/main/hosts')
  vault.registerVaultHandlers()
  hosts.registerHostsHandlers()
  return {
    registerHostsHandlers: hosts.registerHostsHandlers,
    registerVaultHandlers: vault.registerVaultHandlers,
    getHost: hosts.getHost,
    touchLastUsed: hosts.touchLastUsed,
    vaultGetHostPassword: vault.getHostPassword,
    vaultIsUnlocked: vault.isUnlocked,
  }
}

describe('hosts', () => {
  beforeEach(() => {
    cfgDir = freshTmpDir('hosts-cfg')
    process.env.XDG_CONFIG_HOME = cfgDir
  })

  afterEach(() => {
    try {
      fs.rmSync(cfgDir, { recursive: true, force: true })
    } catch {
      
    }
  })

  it('hosts:list on empty dir → empty arrays', async () => {
    await loadModules()
    const res = (await invoke('hosts:list')) as HostListResult
    expect(res).toEqual({ hosts: [], groups: [] })
  })

  it('hosts:save with empty id assigns h_-prefixed id and persists', async () => {
    await loadModules()
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'a.example', user: 'u' }),
    })) as string
    expect(id).toMatch(/^h_[0-9a-f]{32}$/)
    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.length).toBe(1)
    expect(list.hosts[0]!.id).toBe(id)
    expect(list.hosts[0]!.host).toBe('a.example')
    expect(fs.existsSync(path.join(cfgDir, 'mterminal', 'hosts.json'))).toBe(true)
  })

  it('hosts:save with empty host throws', async () => {
    await loadModules()
    await expect(
      invoke('hosts:save', { host: defaultHost({ host: '   ', user: 'u' }) })
    ).rejects.toThrow(/host cannot be empty/)
  })

  it('hosts:save with empty user throws', async () => {
    await loadModules()
    await expect(
      invoke('hosts:save', { host: defaultHost({ host: 'h', user: '' }) })
    ).rejects.toThrow(/user cannot be empty/)
  })

  it('hosts:save with invalid auth throws', async () => {
    await loadModules()
    await expect(
      invoke('hosts:save', {
        host: defaultHost({ host: 'h', user: 'u', auth: 'bogus' }),
      })
    ).rejects.toThrow(/invalid auth: bogus/)
  })

  it('hosts:save with port=0 coerces to 22', async () => {
    await loadModules()
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u', port: 0 }),
    })) as string
    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.find((h) => h.id === id)!.port).toBe(22)
  })

  it('hosts:save with existing id updates in place — no duplicate', async () => {
    await loadModules()
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'orig', user: 'u' }),
    })) as string
    const id2 = (await invoke('hosts:save', {
      host: defaultHost({ id, host: 'updated', user: 'u' }),
    })) as string
    expect(id2).toBe(id)
    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.length).toBe(1)
    expect(list.hosts[0]!.host).toBe('updated')
  })

  it(
    'hosts:save with auth=password + savePassword + locked vault throws',
    { timeout: TEST_TIMEOUT },
    async () => {
      await loadModules()
      
      await expect(
        invoke('hosts:save', {
          host: defaultHost({
            host: 'h',
            user: 'u',
            auth: 'password',
            savePassword: true,
          }),
          password: 'sekrit',
        })
      ).rejects.toThrow(/vault is locked/)
    }
  )

  it(
    'hosts:save with auth=password + unlocked vault stores password',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { vaultGetHostPassword } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      const id = (await invoke('hosts:save', {
        host: defaultHost({
          host: 'h',
          user: 'u',
          auth: 'password',
          savePassword: true,
        }),
        password: 'sekrit',
      })) as string
      expect(vaultGetHostPassword(id)).toBe('sekrit')
    }
  )

  it(
    'hosts:save with auth=key + unlocked clears prior stored password',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { vaultGetHostPassword } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      
      const id = (await invoke('hosts:save', {
        host: defaultHost({
          host: 'h',
          user: 'u',
          auth: 'password',
          savePassword: true,
        }),
        password: 'sekrit',
      })) as string
      expect(vaultGetHostPassword(id)).toBe('sekrit')
      
      await invoke('hosts:save', {
        host: defaultHost({ id, host: 'h', user: 'u', auth: 'key' }),
      })
      expect(vaultGetHostPassword(id)).toBeNull()

      
      const id2 = (await invoke('hosts:save', {
        host: defaultHost({
          host: 'h2',
          user: 'u',
          auth: 'password',
          savePassword: true,
        }),
        password: 'pw2',
      })) as string
      expect(vaultGetHostPassword(id2)).toBe('pw2')
      await invoke('hosts:save', {
        host: defaultHost({
          id: id2,
          host: 'h2',
          user: 'u',
          auth: 'password',
          savePassword: false,
        }),
      })
      expect(vaultGetHostPassword(id2)).toBeNull()
    }
  )

  it(
    'hosts:delete removes host and clears password if vault unlocked',
    { timeout: TEST_TIMEOUT },
    async () => {
      const { vaultGetHostPassword } = await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      const id = (await invoke('hosts:save', {
        host: defaultHost({
          host: 'h',
          user: 'u',
          auth: 'password',
          savePassword: true,
        }),
        password: 'sekrit',
      })) as string
      expect(vaultGetHostPassword(id)).toBe('sekrit')

      await invoke('hosts:delete', { id })
      const list = (await invoke('hosts:list')) as HostListResult
      expect(list.hosts.length).toBe(0)
      expect(vaultGetHostPassword(id)).toBeNull()
    }
  )

  it('hosts:delete with non-existent id is a no-op (no file write)', async () => {
    await loadModules()
    
    await invoke('hosts:delete', { id: 'nope' })
    expect(fs.existsSync(path.join(cfgDir, 'mterminal', 'hosts.json'))).toBe(false)
    
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u' }),
    })) as string
    const p = path.join(cfgDir, 'mterminal', 'hosts.json')
    const mtimeBefore = fs.statSync(p).mtimeMs
    await new Promise((r) => setTimeout(r, 20))
    await invoke('hosts:delete', { id: 'nope-' + id })
    const mtimeAfter = fs.statSync(p).mtimeMs
    expect(mtimeAfter).toBe(mtimeBefore)
  })

  it('hosts:get-password with locked vault throws', async () => {
    await loadModules()
    await expect(invoke('hosts:get-password', { id: 'x' })).rejects.toThrow(
      /vault is locked/
    )
  })

  it(
    'hosts:get-password with unlocked vault returns saved password or null',
    { timeout: TEST_TIMEOUT },
    async () => {
      await loadModules()
      await invoke('vault:init', { masterPassword: 'pw' })
      const id = (await invoke('hosts:save', {
        host: defaultHost({
          host: 'h',
          user: 'u',
          auth: 'password',
          savePassword: true,
        }),
        password: 'sekrit',
      })) as string
      expect(await invoke('hosts:get-password', { id })).toBe('sekrit')
      expect(await invoke('hosts:get-password', { id: 'unknown' })).toBeNull()
    }
  )

  it('hosts:group-save with empty name throws', async () => {
    await loadModules()
    await expect(
      invoke('hosts:group-save', { group: defaultGroup({ name: '   ' }) })
    ).rejects.toThrow(/group name cannot be empty/)
  })

  it('hosts:group-save with empty id assigns g_-prefixed id', async () => {
    await loadModules()
    const id = (await invoke('hosts:group-save', {
      group: defaultGroup({ name: 'prod' }),
    })) as string
    expect(id).toMatch(/^g_[0-9a-f]{32}$/)
    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0]!.name).toBe('prod')
  })

  it('hosts:group-save with existing id updates in place', async () => {
    await loadModules()
    const id = (await invoke('hosts:group-save', {
      group: defaultGroup({ name: 'prod' }),
    })) as string
    const id2 = (await invoke('hosts:group-save', {
      group: defaultGroup({ id, name: 'staging', accent: 'red' }),
    })) as string
    expect(id2).toBe(id)
    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.groups).toHaveLength(1)
    expect(list.groups[0]!.name).toBe('staging')
    expect(list.groups[0]!.accent).toBe('red')
  })

  it('hosts:group-delete removes group and clears groupId on referencing hosts', async () => {
    await loadModules()
    const gid = (await invoke('hosts:group-save', {
      group: defaultGroup({ name: 'prod' }),
    })) as string
    const hid1 = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h1', user: 'u', groupId: gid }),
    })) as string
    const hid2 = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h2', user: 'u' }),
    })) as string
    let list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.find((h) => h.id === hid1)!.groupId).toBe(gid)

    await invoke('hosts:group-delete', { id: gid })
    list = (await invoke('hosts:list')) as HostListResult
    expect(list.groups).toHaveLength(0)
    expect(list.hosts.find((h) => h.id === hid1)!.groupId).toBeUndefined()
    expect(list.hosts.find((h) => h.id === hid2)!.groupId).toBeUndefined()
  })

  it('hosts:set-group with invalid groupId throws', async () => {
    await loadModules()
    const hid = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u' }),
    })) as string
    await expect(
      invoke('hosts:set-group', { hostId: hid, groupId: 'g_does_not_exist' })
    ).rejects.toThrow(/group not found/)
  })

  it('hosts:set-group with valid groupId updates host; undefined ungroups', async () => {
    await loadModules()
    const gid = (await invoke('hosts:group-save', {
      group: defaultGroup({ name: 'prod' }),
    })) as string
    const hid = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u' }),
    })) as string

    await invoke('hosts:set-group', { hostId: hid, groupId: gid })
    let list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.find((h) => h.id === hid)!.groupId).toBe(gid)

    await invoke('hosts:set-group', { hostId: hid, groupId: undefined })
    list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.find((h) => h.id === hid)!.groupId).toBeUndefined()
  })

  it('hosts:list normalizes dangling groupId references to undefined', async () => {
    await loadModules()
    
    const dir = path.join(cfgDir, 'mterminal')
    fs.mkdirSync(dir, { recursive: true })
    const file = {
      version: 1,
      hosts: [
        {
          id: 'h_orphan',
          name: 'h',
          host: 'h',
          port: 22,
          user: 'u',
          auth: 'key',
          savePassword: false,
          groupId: 'g_missing',
        },
      ],
      groups: [],
    }
    fs.writeFileSync(path.join(dir, 'hosts.json'), JSON.stringify(file))

    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts).toHaveLength(1)
    expect(list.hosts[0]!.groupId).toBeUndefined()
  })

  it('hosts:list-keys returns id_* keys (sorted, no .pub) with keyType', async () => {
    await loadModules()
    const homeDir = freshTmpDir('hosts-home')
    const sshDir = path.join(homeDir, '.ssh')
    fs.mkdirSync(sshDir, { recursive: true })
    fs.writeFileSync(path.join(sshDir, 'id_rsa'), 'priv')
    fs.writeFileSync(path.join(sshDir, 'id_rsa.pub'), 'pub')
    fs.writeFileSync(path.join(sshDir, 'id_ed25519'), 'priv')
    fs.writeFileSync(path.join(sshDir, 'random'), 'noop')

    const prevHome = process.env.HOME
    const prevUserProfile = process.env.USERPROFILE
    process.env.HOME = homeDir
    process.env.USERPROFILE = homeDir
    try {
      const keys = (await invoke('hosts:list-keys')) as SshKey[]
      const names = keys.map((k) => k.name)
      expect(names).toEqual(['id_ed25519', 'id_rsa'])
      const types = Object.fromEntries(keys.map((k) => [k.name, k.keyType]))
      expect(types).toEqual({ id_rsa: 'rsa', id_ed25519: 'ed25519' })
    } finally {
      if (prevHome === undefined) delete process.env.HOME
      else process.env.HOME = prevHome
      if (prevUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = prevUserProfile
      fs.rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('hosts:tool-availability flips boolean based on PATH', async () => {
    await loadModules()
    const binDir = freshTmpDir('hosts-bin')
    const prevPath = process.env.PATH
    try {
      
      process.env.PATH = binDir
      let res = (await invoke('hosts:tool-availability')) as { sshpass: boolean }
      expect(res.sshpass).toBe(false)

      
      const isWin = process.platform === 'win32'
      const exeName = isWin ? 'sshpass.exe' : 'sshpass'
      const exePath = path.join(binDir, exeName)
      fs.writeFileSync(exePath, isWin ? '' : '#!/bin/sh\nexit 0\n')
      if (!isWin) fs.chmodSync(exePath, 0o755)

      res = (await invoke('hosts:tool-availability')) as { sshpass: boolean }
      expect(res.sshpass).toBe(true)
    } finally {
      if (prevPath === undefined) delete process.env.PATH
      else process.env.PATH = prevPath
      fs.rmSync(binDir, { recursive: true, force: true })
    }
  })

  it('getHost caches synchronously within 500ms; refreshes after', async () => {
    const { getHost } = await loadModules()
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u' }),
    })) as string

    
    const first = getHost(id)
    expect(first).not.toBeNull()
    expect(first!.host).toBe('h')

    
    const filePath = path.join(cfgDir, 'mterminal', 'hosts.json')
    const file = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    file.hosts[0].host = 'changed'
    fs.writeFileSync(filePath, JSON.stringify(file))

    
    const cached = getHost(id)
    expect(cached!.host).toBe('h')

    
    await new Promise((r) => setTimeout(r, 600))
    const refreshed = getHost(id)
    expect(refreshed!.host).toBe('changed')
  })

  it('touchLastUsed updates lastUsed and invalidates cache', async () => {
    const { getHost, touchLastUsed } = await loadModules()
    const id = (await invoke('hosts:save', {
      host: defaultHost({ host: 'h', user: 'u' }),
    })) as string

    
    expect(getHost(id)!.lastUsed).toBeUndefined()

    await touchLastUsed(id)
    
    const refreshed = getHost(id)
    expect(refreshed!.lastUsed).toBeGreaterThan(0)

    const list = (await invoke('hosts:list')) as HostListResult
    expect(list.hosts.find((h) => h.id === id)!.lastUsed).toBeGreaterThan(0)
  })
})
