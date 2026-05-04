import { ipcMain } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  configDir,
  isUnlocked,
  getHostPassword as vaultGetHostPassword,
  setHostPassword as vaultSetHostPassword,
  clearHostPassword as vaultClearHostPassword,
} from './vault'

export interface HostMeta {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: string // "key" | "password" | "agent"
  identityPath?: string
  savePassword: boolean
  lastUsed?: number
  groupId?: string
}

export interface HostGroup {
  id: string
  name: string
  collapsed: boolean
  accent: string
}

interface HostsFile {
  version: number
  hosts: HostMeta[]
  groups: HostGroup[]
}

export interface HostListResult {
  hosts: HostMeta[]
  groups: HostGroup[]
}

export interface SshKey {
  path: string
  name: string
  keyType: string
}

export interface ToolAvailabilityResult {
  sshpass: boolean
}

const FILE_VERSION = 1
const VALID_AUTH = new Set(['key', 'password', 'agent'])

function hostsPath(): string {
  return path.join(configDir(), 'hosts.json')
}

function emptyFile(): HostsFile {
  return { version: FILE_VERSION, hosts: [], groups: [] }
}

function normalizeHost(raw: Partial<HostMeta>): HostMeta {
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    host: typeof raw.host === 'string' ? raw.host : '',
    port: typeof raw.port === 'number' ? raw.port : 22,
    user: typeof raw.user === 'string' ? raw.user : '',
    auth: typeof raw.auth === 'string' ? raw.auth : 'key',
    identityPath: typeof raw.identityPath === 'string' ? raw.identityPath : undefined,
    savePassword: raw.savePassword === true,
    lastUsed: typeof raw.lastUsed === 'number' ? raw.lastUsed : undefined,
    groupId: typeof raw.groupId === 'string' ? raw.groupId : undefined,
  }
}

function normalizeGroup(raw: Partial<HostGroup>): HostGroup {
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    name: typeof raw.name === 'string' ? raw.name : '',
    collapsed: raw.collapsed === true,
    accent: typeof raw.accent === 'string' && raw.accent.length > 0 ? raw.accent : 'blue',
  }
}

async function readFileLocked(): Promise<HostsFile> {
  const p = hostsPath()
  let raw: Buffer
  try {
    raw = await fsp.readFile(p)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyFile()
    throw e
  }
  if (raw.length === 0) return emptyFile()
  const parsed = JSON.parse(raw.toString('utf8')) as Partial<HostsFile>
  return {
    version: typeof parsed.version === 'number' ? parsed.version : FILE_VERSION,
    hosts: Array.isArray(parsed.hosts) ? parsed.hosts.map(normalizeHost) : [],
    groups: Array.isArray(parsed.groups) ? parsed.groups.map(normalizeGroup) : [],
  }
}

async function writeFileLocked(file: HostsFile): Promise<void> {
  const p = hostsPath()
  const tmp = p + '.tmp'
  // Strip undefined fields to mirror Rust skip_serializing_if = "Option::is_none".
  const serializable: HostsFile = {
    version: file.version,
    hosts: file.hosts.map((h) => {
      const out: Record<string, unknown> = {
        id: h.id,
        name: h.name,
        host: h.host,
        port: h.port,
        user: h.user,
        auth: h.auth,
        savePassword: h.savePassword,
      }
      if (h.identityPath !== undefined) out.identityPath = h.identityPath
      if (h.lastUsed !== undefined) out.lastUsed = h.lastUsed
      if (h.groupId !== undefined) out.groupId = h.groupId
      return out as unknown as HostMeta
    }),
    groups: file.groups,
  }
  const bytes = Buffer.from(JSON.stringify(serializable, null, 2), 'utf8')
  const fd = await fsp.open(tmp, 'w')
  try {
    await fd.writeFile(bytes)
    await fd.sync()
  } finally {
    await fd.close()
  }
  await fsp.rename(tmp, p)
}

let ioChain: Promise<unknown> = Promise.resolve()
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = ioChain.then(fn, fn)
  ioChain = next.catch(() => undefined)
  return next
}

function newHostId(): string {
  return 'h_' + crypto.randomUUID().replace(/-/g, '')
}

function newGroupId(): string {
  return 'g_' + crypto.randomUUID().replace(/-/g, '')
}

let cachedSync: HostMeta[] | null = null
let cacheStamp = 0

function readFileSyncBest(): HostsFile {
  try {
    const raw = fs.readFileSync(hostsPath())
    if (raw.length === 0) return emptyFile()
    const parsed = JSON.parse(raw.toString('utf8')) as Partial<HostsFile>
    return {
      version: typeof parsed.version === 'number' ? parsed.version : FILE_VERSION,
      hosts: Array.isArray(parsed.hosts) ? parsed.hosts.map(normalizeHost) : [],
      groups: Array.isArray(parsed.groups) ? parsed.groups.map(normalizeGroup) : [],
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return emptyFile()
    throw e
  }
}

export function getHost(id: string): HostMeta | null {
  const now = Date.now()
  if (!cachedSync || now - cacheStamp > 500) {
    cachedSync = readFileSyncBest().hosts
    cacheStamp = now
  }
  return cachedSync.find((h) => h.id === id) ?? null
}

export async function touchLastUsed(id: string): Promise<void> {
  await withLock(async () => {
    const file = await readFileLocked()
    const idx = file.hosts.findIndex((h) => h.id === id)
    if (idx === -1) return
    file.hosts[idx]!.lastUsed = Math.floor(Date.now() / 1000)
    await writeFileLocked(file)
    cachedSync = null
  })
}

export function getHostPassword(id: string): string | null {
  return vaultGetHostPassword(id)
}

function scanSshKeys(): SshKey[] {
  const home = process.env.HOME ?? process.env.USERPROFILE
  if (!home) return []
  const dir = path.join(home, '.ssh')
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return []
  }
  const out: SshKey[] = []
  for (const fname of entries) {
    if (fname.endsWith('.pub')) continue
    if (!fname.startsWith('id_')) continue
    const full = path.join(dir, fname)
    let st: fs.Stats
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    out.push({
      path: full,
      name: fname,
      keyType: fname.slice('id_'.length),
    })
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return out
}

function whichOnPath(prog: string): boolean {
  const PATH = process.env.PATH
  if (!PATH) return false
  const dirs = PATH.split(path.delimiter)
  const isWin = process.platform === 'win32'
  const exts = isWin
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT')
        .split(';')
        .filter((s) => s.length > 0)
    : ['']
  for (const dir of dirs) {
    if (!dir) continue
    const base = path.join(dir, prog)
    for (const ext of exts) {
      const candidate = ext ? base + ext : base
      try {
        if (fs.statSync(candidate).isFile()) return true
      } catch {}
    }
  }
  return false
}

export function registerHostsHandlers(): void {
  ipcMain.handle('hosts:list', async (): Promise<HostListResult> => {
    return withLock(async () => {
      const file = await readFileLocked()
      const groupIds = new Set(file.groups.map((g) => g.id))
      const hosts = file.hosts.map((h) => {
        if (h.groupId && !groupIds.has(h.groupId)) {
          return { ...h, groupId: undefined }
        }
        return h
      })
      cachedSync = hosts
      cacheStamp = Date.now()
      return { hosts, groups: file.groups }
    })
  })

  ipcMain.handle(
    'hosts:save',
    async (_e, args: { host: HostMeta; password?: string }): Promise<string> => {
      const incoming = normalizeHost(args.host)
      if (incoming.host.trim().length === 0) throw new Error('host cannot be empty')
      if (incoming.user.trim().length === 0) throw new Error('user cannot be empty')
      if (!VALID_AUTH.has(incoming.auth)) {
        throw new Error('invalid auth: ' + incoming.auth)
      }
      if (incoming.port === 0) incoming.port = 22

      const id = await withLock(async () => {
        const file = await readFileLocked()
        if (incoming.id.length === 0) incoming.id = newHostId()
        const idx = file.hosts.findIndex((h) => h.id === incoming.id)
        if (idx >= 0) file.hosts[idx] = incoming
        else file.hosts.push(incoming)
        await writeFileLocked(file)
        cachedSync = null
        return incoming.id
      })

      if (incoming.auth === 'password' && incoming.savePassword) {
        if (!isUnlocked()) {
          throw new Error('vault is locked — unlock to save password')
        }
        if (typeof args.password === 'string') {
          vaultSetHostPassword(id, args.password)
        }
      } else if (isUnlocked()) {
        vaultClearHostPassword(id)
      }
      return id
    }
  )

  ipcMain.handle('hosts:delete', async (_e, args: { id: string }): Promise<void> => {
    await withLock(async () => {
      const file = await readFileLocked()
      const before = file.hosts.length
      file.hosts = file.hosts.filter((h) => h.id !== args.id)
      if (file.hosts.length !== before) {
        await writeFileLocked(file)
        cachedSync = null
      }
    })
    if (isUnlocked()) {
      vaultClearHostPassword(args.id)
    }
  })

  ipcMain.handle(
    'hosts:get-password',
    (_e, args: { id: string }): string | null => {
      if (!isUnlocked()) throw new Error('vault is locked')
      return vaultGetHostPassword(args.id)
    }
  )

  ipcMain.handle(
    'hosts:group-save',
    async (_e, args: { group: HostGroup }): Promise<string> => {
      const incoming = normalizeGroup(args.group)
      if (incoming.name.trim().length === 0) {
        throw new Error('group name cannot be empty')
      }
      return withLock(async () => {
        const file = await readFileLocked()
        if (incoming.id.length === 0) incoming.id = newGroupId()
        const idx = file.groups.findIndex((g) => g.id === incoming.id)
        if (idx >= 0) file.groups[idx] = incoming
        else file.groups.push(incoming)
        await writeFileLocked(file)
        return incoming.id
      })
    }
  )

  ipcMain.handle(
    'hosts:group-delete',
    async (_e, args: { id: string }): Promise<void> => {
      await withLock(async () => {
        const file = await readFileLocked()
        const before = file.groups.length
        file.groups = file.groups.filter((g) => g.id !== args.id)
        if (file.groups.length === before) {
          return
        }
        for (const h of file.hosts) {
          if (h.groupId === args.id) h.groupId = undefined
        }
        await writeFileLocked(file)
        cachedSync = null
      })
    }
  )

  ipcMain.handle(
    'hosts:set-group',
    async (
      _e,
      args: { hostId: string; groupId?: string }
    ): Promise<void> => {
      await withLock(async () => {
        const file = await readFileLocked()
        if (args.groupId !== undefined && args.groupId !== null) {
          const exists = file.groups.some((g) => g.id === args.groupId)
          if (!exists) throw new Error('group not found')
        }
        const idx = file.hosts.findIndex((h) => h.id === args.hostId)
        if (idx === -1) return
        file.hosts[idx]!.groupId = args.groupId ?? undefined
        await writeFileLocked(file)
        cachedSync = null
      })
    }
  )

  ipcMain.handle('hosts:list-keys', (): SshKey[] => scanSshKeys())

  ipcMain.handle('hosts:tool-availability', (): ToolAvailabilityResult => ({
    sshpass: whichOnPath('sshpass'),
  }))
}
