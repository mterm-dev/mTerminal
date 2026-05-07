export type SshAuthMode = 'key' | 'password' | 'agent'

export interface HostMeta {
  id: string
  name: string
  host: string
  port: number
  user: string
  auth: SshAuthMode
  identityPath?: string
  savePassword: boolean
  groupId?: string | null
  lastUsed?: number
}

export interface HostGroup {
  id: string
  name: string
  collapsed: boolean
  accent: string
}

export interface HostsSnapshot {
  hosts: HostMeta[]
  groups: HostGroup[]
}

export interface SshKey {
  path: string
  name: string
  keyType: string
}

export interface SftpAuthBundle {
  hostId: string
  host: string
  port: number
  user: string
  auth: SshAuthMode
  identityPath?: string
  password?: string
}

export type FileEntryKind = 'file' | 'dir' | 'symlink' | 'other'

export interface FileEntry {
  name: string
  path: string
  kind: FileEntryKind
  size: number | null
  mtimeMs: number | null
  isHidden: boolean
  symlinkTarget?: string | null
  resolvedKind?: FileEntryKind
}

export interface FileListResult {
  cwd: string
  parent: string | null
  entries: FileEntry[]
  truncated?: boolean
}

export interface FileStat extends FileEntry {
  exists: boolean
}

export type FileOpErrorCode =
  | 'ENOENT'
  | 'EACCES'
  | 'EEXIST'
  | 'EISDIR'
  | 'ENOTDIR'
  | 'EPERM'
  | 'ETIMEDOUT'
  | 'EHOSTAUTH'
  | 'EHOSTLOST'
  | 'EVAULTLOCKED'
  | 'ENOTSUP'
  | 'ENOTEMPTY'
  | 'EGENERIC'

export interface FileOpError {
  code: FileOpErrorCode
  message: string
}

export interface ConnectionStatus {
  connected: boolean
  lastError: string | null
}

export const GROUP_ACCENTS = [
  'blue',
  'cyan',
  'green',
  'amber',
  'orange',
  'red',
  'pink',
  'purple',
  'indigo',
  'teal',
] as const

export type GroupAccent = (typeof GROUP_ACCENTS)[number]
