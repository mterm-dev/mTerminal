import type {
  ConnectionStatus,
  FileListResult,
  FileStat,
  HostGroup,
  HostMeta,
  SftpAuthBundle,
  SshKey,
} from './types'

export interface Disposable {
  dispose(): void
}

export interface HostRegistryService {
  listHosts(): Promise<HostMeta[]>
  listGroups(): Promise<HostGroup[]>
  getHost(id: string): Promise<HostMeta | null>
  requestAuthBundle(hostId: string): Promise<SftpAuthBundle>
  listSshKeys(): Promise<SshKey[]>
  onHostsChanged(cb: (hosts: HostMeta[]) => void): Disposable
}

export interface SftpFsService {
  connect(hostId: string): Promise<{ connected: true }>
  disconnect(hostId: string): Promise<void>
  status(hostId: string): Promise<ConnectionStatus>
  list(args: { hostId: string; cwd: string; showHidden: boolean }): Promise<FileListResult>
  stat(args: { hostId: string; path: string }): Promise<FileStat>
  home(args: { hostId: string }): Promise<string>
  realpath(args: { hostId: string; path: string }): Promise<string>
  mkdir(args: { hostId: string; path: string }): Promise<void>
  createFile(args: { hostId: string; path: string }): Promise<void>
  rename(args: { hostId: string; from: string; to: string }): Promise<void>
  remove(args: { hostId: string; path: string; recursive: boolean }): Promise<void>
  copy(args: { hostId: string; from: string; to: string; recursive: boolean }): Promise<void>
  move(args: { hostId: string; from: string; to: string }): Promise<void>
  upload(args: { hostId: string; localPath: string; remotePath: string }): Promise<void>
  download(args: { hostId: string; remotePath: string; localPath: string }): Promise<void>
  read(args: { hostId: string; path: string }): Promise<{ content: string; truncated: boolean; size: number }>
  write(args: { hostId: string; path: string; content: string }): Promise<void>
}

export const SERVICE_VERSION_HOST_REGISTRY = '1.0.0'
export const SERVICE_VERSION_SFTP_FS = '1.0.0'
