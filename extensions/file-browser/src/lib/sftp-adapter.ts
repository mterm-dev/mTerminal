type Invoker = <T = unknown>(channel: string, args?: unknown) => Promise<T>

interface RawIpc {
  invoke: Invoker
}

export interface SftpServiceLike {
  connect(args: { hostId: string }): Promise<{ connected: true }>
  disconnect(args: { hostId: string }): Promise<void>
  status(args: { hostId: string }): Promise<{ connected: boolean; lastError?: string | null }>
  list(args: { hostId: string; cwd: string; showHidden: boolean }): Promise<unknown>
  stat(args: { hostId: string; path: string }): Promise<unknown>
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

export interface ServiceProxyLike<T> {
  available: boolean
  impl: T | null
}

const CHANNEL_TO_METHOD: Record<string, keyof SftpServiceLike> = {
  'sftp:connect': 'connect',
  'sftp:disconnect': 'disconnect',
  'sftp:status': 'status',
  'sftp:list': 'list',
  'sftp:stat': 'stat',
  'sftp:home': 'home',
  'sftp:realpath': 'realpath',
  'sftp:mkdir': 'mkdir',
  'sftp:create-file': 'createFile',
  'sftp:rename': 'rename',
  'sftp:remove': 'remove',
  'sftp:copy': 'copy',
  'sftp:move': 'move',
  'sftp:upload': 'upload',
  'sftp:download': 'download',
  'sftp:read': 'read',
  'sftp:write': 'write',
}

export function createFsIpc(
  raw: RawIpc,
  sftpProxy: ServiceProxyLike<SftpServiceLike> | null,
): RawIpc {
  return {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T> {
      if (channel.startsWith('sftp:')) {
        const method = CHANNEL_TO_METHOD[channel]
        if (!method) {
          return Promise.reject(new Error(`unknown sftp channel: ${channel}`))
        }
        if (!sftpProxy?.available || !sftpProxy.impl) {
          return Promise.reject(
            new Error('remote-ssh extension not active (install/enable to use SFTP)'),
          )
        }
        const fn = sftpProxy.impl[method] as unknown
        if (typeof fn !== 'function') {
          return Promise.reject(new Error(`sftp service missing method "${method}"`))
        }
        return (fn as (a: unknown) => Promise<T>).call(sftpProxy.impl, args ?? {})
      }
      return raw.invoke<T>(channel, args)
    },
  }
}
