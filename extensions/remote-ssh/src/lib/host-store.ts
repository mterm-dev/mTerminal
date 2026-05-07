import { promises as fsp } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { GROUP_ACCENTS, type GroupAccent } from '../shared/types'
import type { HostGroup, HostMeta, HostsSnapshot, SshKey, SshAuthMode } from '../shared/types'

export interface KeyValueStore {
  get<T = unknown>(key: string, def?: T): T | undefined
  set(key: string, value: unknown): Promise<void>
}

const HOSTS_KEY = 'hosts'
const GROUPS_KEY = 'groups'

function newHostId(): string {
  return 'h_' + randomUUID().replace(/-/g, '')
}

function newGroupId(): string {
  return 'g_' + randomUUID().replace(/-/g, '')
}

function isAccent(value: unknown): value is GroupAccent {
  return typeof value === 'string' && (GROUP_ACCENTS as readonly string[]).includes(value)
}

function isAuthMode(value: unknown): value is SshAuthMode {
  return value === 'key' || value === 'password' || value === 'agent'
}

function clampPort(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 22
  const i = Math.round(n)
  if (i < 1) return 1
  if (i > 65535) return 65535
  return i
}

export function normalizeHost(raw: Partial<HostMeta>, fallbackId?: string): HostMeta {
  const auth: SshAuthMode = isAuthMode(raw.auth) ? raw.auth : 'key'
  const savePassword = auth === 'password' && Boolean(raw.savePassword)
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : (fallbackId ?? newHostId()),
    name: typeof raw.name === 'string' ? raw.name : '',
    host: typeof raw.host === 'string' ? raw.host : '',
    port: clampPort(raw.port ?? 22),
    user: typeof raw.user === 'string' ? raw.user : '',
    auth,
    identityPath: typeof raw.identityPath === 'string' && raw.identityPath ? raw.identityPath : undefined,
    savePassword,
    groupId: typeof raw.groupId === 'string' && raw.groupId.length > 0 ? raw.groupId : null,
    lastUsed: typeof raw.lastUsed === 'number' ? raw.lastUsed : undefined,
  }
}

export function normalizeGroup(raw: Partial<HostGroup>, fallbackId?: string): HostGroup {
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : (fallbackId ?? newGroupId()),
    name: typeof raw.name === 'string' ? raw.name : 'group',
    collapsed: Boolean(raw.collapsed),
    accent: isAccent(raw.accent) ? raw.accent : 'blue',
  }
}

export class HostStore {
  private hosts: HostMeta[] = []
  private groups: HostGroup[] = []
  private listeners = new Set<(snapshot: HostsSnapshot) => void>()
  private loaded = false

  constructor(private store: KeyValueStore) {}

  async load(): Promise<void> {
    if (this.loaded) return
    const rawHosts = this.store.get<unknown[]>(HOSTS_KEY) ?? []
    const rawGroups = this.store.get<unknown[]>(GROUPS_KEY) ?? []
    this.hosts = Array.isArray(rawHosts)
      ? rawHosts.map((h) => normalizeHost(h as Partial<HostMeta>))
      : []
    this.groups = Array.isArray(rawGroups)
      ? rawGroups.map((g) => normalizeGroup(g as Partial<HostGroup>))
      : []
    this.loaded = true
  }

  snapshot(): HostsSnapshot {
    return { hosts: [...this.hosts], groups: [...this.groups] }
  }

  listHosts(): HostMeta[] {
    return [...this.hosts]
  }

  listGroups(): HostGroup[] {
    return [...this.groups]
  }

  getHost(id: string): HostMeta | null {
    return this.hosts.find((h) => h.id === id) ?? null
  }

  async saveHost(input: Partial<HostMeta>): Promise<HostMeta> {
    const incoming = normalizeHost(input)
    const idx = this.hosts.findIndex((h) => h.id === incoming.id)
    if (idx >= 0) {
      this.hosts[idx] = incoming
    } else {
      this.hosts.push(incoming)
    }
    await this.persistHosts()
    this.emit()
    return incoming
  }

  async deleteHost(id: string): Promise<void> {
    const idx = this.hosts.findIndex((h) => h.id === id)
    if (idx < 0) return
    this.hosts.splice(idx, 1)
    await this.persistHosts()
    this.emit()
  }

  async setHostGroup(hostId: string, groupId: string | null): Promise<void> {
    const host = this.hosts.find((h) => h.id === hostId)
    if (!host) return
    host.groupId = groupId
    await this.persistHosts()
    this.emit()
  }

  async touchLastUsed(hostId: string): Promise<void> {
    const host = this.hosts.find((h) => h.id === hostId)
    if (!host) return
    host.lastUsed = Math.floor(Date.now() / 1000)
    await this.persistHosts()
  }

  async saveGroup(input: Partial<HostGroup>): Promise<HostGroup> {
    const incoming = normalizeGroup(input)
    const idx = this.groups.findIndex((g) => g.id === incoming.id)
    if (idx >= 0) {
      this.groups[idx] = incoming
    } else {
      this.groups.push(incoming)
    }
    await this.persistGroups()
    this.emit()
    return incoming
  }

  async reorderHost(
    hostId: string,
    beforeHostId: string | null,
    groupId: string | null,
  ): Promise<void> {
    const idx = this.hosts.findIndex((h) => h.id === hostId)
    if (idx < 0) return
    const moving = this.hosts[idx]
    const without = this.hosts.filter((h) => h.id !== hostId)
    const updated: HostMeta = { ...moving, groupId }
    let insertAt: number
    if (beforeHostId == null) {
      let lastIdx = -1
      without.forEach((h, i) => {
        if ((h.groupId ?? null) === groupId) lastIdx = i
      })
      insertAt = lastIdx >= 0 ? lastIdx + 1 : without.length
    } else {
      insertAt = without.findIndex((h) => h.id === beforeHostId)
      if (insertAt < 0) insertAt = without.length
    }
    without.splice(insertAt, 0, updated)
    this.hosts = without
    await this.persistHosts()
    this.emit()
  }

  async reorderGroup(groupId: string, beforeGroupId: string | null): Promise<void> {
    const idx = this.groups.findIndex((g) => g.id === groupId)
    if (idx < 0) return
    const moving = this.groups[idx]
    const without = this.groups.filter((g) => g.id !== groupId)
    let insertAt: number
    if (beforeGroupId == null) {
      insertAt = without.length
    } else {
      insertAt = without.findIndex((g) => g.id === beforeGroupId)
      if (insertAt < 0) insertAt = without.length
    }
    without.splice(insertAt, 0, moving)
    this.groups = without
    await this.persistGroups()
    this.emit()
  }

  async deleteGroup(id: string): Promise<void> {
    const idx = this.groups.findIndex((g) => g.id === id)
    if (idx < 0) return
    this.groups.splice(idx, 1)
    let mutated = false
    for (const host of this.hosts) {
      if (host.groupId === id) {
        host.groupId = null
        mutated = true
      }
    }
    await this.persistGroups()
    if (mutated) await this.persistHosts()
    this.emit()
  }

  onChange(cb: (snapshot: HostsSnapshot) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const cb of this.listeners) {
      try {
        cb(snapshot)
      } catch {
        // ignore listener errors
      }
    }
  }

  private async persistHosts(): Promise<void> {
    await this.store.set(HOSTS_KEY, this.hosts)
  }

  private async persistGroups(): Promise<void> {
    await this.store.set(GROUPS_KEY, this.groups)
  }
}

export async function scanSshKeys(homeDir = os.homedir()): Promise<SshKey[]> {
  const sshDir = path.join(homeDir, '.ssh')
  let dirents
  try {
    dirents = await fsp.readdir(sshDir)
  } catch {
    return []
  }
  const keys: SshKey[] = []
  for (const name of dirents) {
    if (!name.startsWith('id_')) continue
    if (name.endsWith('.pub')) continue
    const full = path.join(sshDir, name)
    try {
      const st = await fsp.stat(full)
      if (!st.isFile()) continue
    } catch {
      continue
    }
    const keyType = name.slice(3) || 'unknown'
    keys.push({ path: full, name, keyType })
  }
  keys.sort((a, b) => a.name.localeCompare(b.name))
  return keys
}
