export type FileBackend =
  | { kind: 'local' }
  | { kind: 'sftp'; hostId: string }

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

export interface SftpAuthBundle {
  hostId: string
  host: string
  port: number
  user: string
  auth: 'key' | 'password' | 'agent'
  identityPath?: string
  password?: string
}

export interface FileBrowserClipboard {
  paths: string[]
  mode: 'copy' | 'cut'
  sourceViewKey: string
  backend: FileBackend
}

export interface FileBrowserState {
  visible: boolean
  cwd: string | null
  width: number
  showHidden: boolean
  selectedPath: string | null
  expandedPaths: string[]
  backend: FileBackend | null
  clipboard: FileBrowserClipboard | null
}

export const DEFAULT_BROWSER_STATE: Omit<FileBrowserState, 'backend'> = {
  visible: true,
  cwd: null,
  width: 320,
  showHidden: true,
  selectedPath: null,
  expandedPaths: [],
  clipboard: null,
}

export interface FileNode {
  path: string
  name: string
  kind: FileEntryKind
  isHidden: boolean
  size: number | null
  mtimeMs: number | null
  expanded: boolean
  loading: boolean
  loaded: boolean
  error: string | null
  childPaths: string[] | null
}

export interface FileTreeState {
  rootPath: string | null
  nodes: Record<string, FileNode>
  rootChildPaths: string[] | null
  loadingRoot: boolean
  rootError: string | null
}

export const EMPTY_TREE: FileTreeState = {
  rootPath: null,
  nodes: {},
  rootChildPaths: null,
  loadingRoot: false,
  rootError: null,
}
