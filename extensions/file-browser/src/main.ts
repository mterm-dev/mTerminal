import { promises as fsp } from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { shell } from 'electron'
import { Client, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import type {
  FileBackend,
  FileEntry,
  FileEntryKind,
  FileListResult,
  FileOpError,
  FileOpErrorCode,
  FileStat,
  SftpAuthBundle,
} from './shared/types'

interface MainCtx {
  ipc: {
    handle(channel: string, fn: (args: unknown) => unknown | Promise<unknown>): {
      dispose(): void
    }
  }
  settings: {
    get<T = unknown>(key: string): T | undefined
  }
  logger: {
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }
  subscribe(d: { dispose(): void } | (() => void)): void
}

interface PoolEntry {
  client: Client
  sftp: SFTPWrapper
  ready: boolean
  lastUsedMs: number
  lastError?: string
  connectingPromise?: Promise<void>
}

const pool = new Map<string, PoolEntry>()
let idleTimer: NodeJS.Timeout | null = null
let maxEntriesPerDir = 5000
let idleTimeoutMs = 300_000

function makeError(code: FileOpErrorCode, message: string): Error & FileOpError {
  const e = new Error(message) as Error & FileOpError
  e.code = code
  e.message = message
  return e
}

function mapNodeErr(err: unknown): Error & FileOpError {
  const code = (err as { code?: string }).code ?? 'EGENERIC'
  const message = err instanceof Error ? err.message : String(err)
  const known: FileOpErrorCode[] = [
    'ENOENT', 'EACCES', 'EEXIST', 'EISDIR', 'ENOTDIR', 'EPERM',
    'ETIMEDOUT', 'ENOTEMPTY',
  ]
  return makeError((known as string[]).includes(code) ? (code as FileOpErrorCode) : 'EGENERIC', message)
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

function localKindFromDirent(d: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): FileEntryKind {
  if (d.isDirectory()) return 'dir'
  if (d.isSymbolicLink()) return 'symlink'
  if (d.isFile()) return 'file'
  return 'other'
}

async function resolveSymlinkKind(absPath: string): Promise<FileEntryKind | undefined> {
  try {
    const s = await fsp.stat(absPath)
    if (s.isDirectory()) return 'dir'
    if (s.isFile()) return 'file'
    return 'other'
  } catch {
    return undefined
  }
}

async function listLocal(args: { cwd: string; showHidden: boolean }): Promise<FileListResult> {
  const cwd = path.resolve(args.cwd)
  let dirents
  try {
    dirents = await fsp.readdir(cwd, { withFileTypes: true })
  } catch (err) {
    throw mapNodeErr(err)
  }
  const entries: FileEntry[] = []
  let truncated = false
  for (const d of dirents) {
    if (entries.length >= maxEntriesPerDir) {
      truncated = true
      break
    }
    const isHidden = isHiddenName(d.name)
    if (!args.showHidden && isHidden) continue
    const abs = path.join(cwd, d.name)
    const kind = localKindFromDirent(d)
    let size: number | null = null
    let mtimeMs: number | null = null
    let resolvedKind: FileEntryKind | undefined
    let symlinkTarget: string | null | undefined
    try {
      const st = await fsp.lstat(abs)
      size = kind === 'file' ? st.size : null
      mtimeMs = st.mtimeMs
    } catch {}
    if (kind === 'symlink') {
      try {
        symlinkTarget = await fsp.readlink(abs)
      } catch {
        symlinkTarget = null
      }
      resolvedKind = await resolveSymlinkKind(abs)
    }
    entries.push({
      name: d.name,
      path: abs,
      kind,
      size,
      mtimeMs,
      isHidden,
      symlinkTarget,
      resolvedKind,
    })
  }
  const parent = path.dirname(cwd)
  return {
    cwd,
    parent: parent === cwd ? null : parent,
    entries,
    truncated,
  }
}

async function statLocal(args: { path: string }): Promise<FileStat> {
  const abs = path.resolve(args.path)
  try {
    const st = await fsp.lstat(abs)
    let kind: FileEntryKind = 'other'
    if (st.isDirectory()) kind = 'dir'
    else if (st.isFile()) kind = 'file'
    else if (st.isSymbolicLink()) kind = 'symlink'
    let resolvedKind: FileEntryKind | undefined
    let symlinkTarget: string | null | undefined
    if (kind === 'symlink') {
      symlinkTarget = await fsp.readlink(abs).catch(() => null)
      resolvedKind = await resolveSymlinkKind(abs)
    }
    return {
      exists: true,
      name: path.basename(abs),
      path: abs,
      kind,
      size: kind === 'file' ? st.size : null,
      mtimeMs: st.mtimeMs,
      isHidden: isHiddenName(path.basename(abs)),
      symlinkTarget,
      resolvedKind,
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      return {
        exists: false,
        name: path.basename(abs),
        path: abs,
        kind: 'other',
        size: null,
        mtimeMs: null,
        isHidden: isHiddenName(path.basename(abs)),
      }
    }
    throw mapNodeErr(err)
  }
}

async function homeLocal(): Promise<string> {
  return os.homedir()
}

async function realpathLocal(args: { path: string }): Promise<string> {
  try {
    return await fsp.realpath(args.path)
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function mkdirLocal(args: { path: string }): Promise<void> {
  try {
    await fsp.mkdir(args.path)
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function createFileLocal(args: { path: string }): Promise<void> {
  try {
    const fh = await fsp.open(args.path, 'wx')
    await fh.close()
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function renameLocal(args: { from: string; to: string }): Promise<void> {
  try {
    await fsp.rename(args.from, args.to)
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function removeLocal(args: { path: string; recursive: boolean }): Promise<void> {
  try {
    await fsp.rm(args.path, { recursive: args.recursive, force: false })
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function copyLocal(args: { from: string; to: string; recursive: boolean }): Promise<void> {
  try {
    await fsp.cp(args.from, args.to, { recursive: args.recursive, errorOnExist: true, force: false })
  } catch (err) {
    throw mapNodeErr(err)
  }
}

async function moveLocal(args: { from: string; to: string }): Promise<void> {
  try {
    await fsp.rename(args.from, args.to)
  } catch (err) {
    if ((err as { code?: string }).code === 'EXDEV') {
      try {
        await fsp.cp(args.from, args.to, { recursive: true, errorOnExist: true, force: false })
        await fsp.rm(args.from, { recursive: true, force: false })
        return
      } catch (e2) {
        throw mapNodeErr(e2)
      }
    }
    throw mapNodeErr(err)
  }
}

async function openDefaultLocal(args: { path: string }): Promise<void> {
  const result = await shell.openPath(args.path)
  if (result) throw makeError('EGENERIC', result)
}

const MAX_READ_BYTES = 5 * 1024 * 1024
const MAX_WRITE_BYTES = 10 * 1024 * 1024

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192)
  let nul = 0
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) nul++
  }
  return nul > 0
}

async function readLocal(args: { path: string }): Promise<{ content: string; truncated: boolean; size: number }> {
  try {
    const st = await fsp.stat(args.path)
    if (!st.isFile()) throw makeError('EISDIR', `not a file: ${args.path}`)
    if (st.size > MAX_READ_BYTES) {
      throw makeError('EGENERIC', `file too large (${st.size} bytes, limit ${MAX_READ_BYTES})`)
    }
    const buf = await fsp.readFile(args.path)
    if (looksBinary(buf)) {
      throw makeError('EGENERIC', 'binary file not supported by editor')
    }
    return { content: buf.toString('utf-8'), truncated: false, size: st.size }
  } catch (err) {
    if ((err as FileOpError).code) throw err
    throw mapNodeErr(err)
  }
}

async function writeLocal(args: { path: string; content: string }): Promise<void> {
  if (Buffer.byteLength(args.content, 'utf-8') > MAX_WRITE_BYTES) {
    throw makeError('EGENERIC', `content too large (limit ${MAX_WRITE_BYTES} bytes)`)
  }
  const tmp = `${args.path}.mt-${Date.now()}.tmp`
  try {
    await fsp.writeFile(tmp, args.content, 'utf-8')
    await fsp.rename(tmp, args.path)
  } catch (err) {
    try { await fsp.rm(tmp, { force: true }) } catch {}
    throw mapNodeErr(err)
  }
}

function buildConnectConfig(auth: SftpAuthBundle): ConnectConfig {
  const cfg: ConnectConfig = {
    host: auth.host,
    port: auth.port,
    username: auth.user,
    readyTimeout: 10_000,
    keepaliveInterval: 30_000,
  }
  if (auth.auth === 'agent') {
    cfg.agent = process.env.SSH_AUTH_SOCK
  } else if (auth.auth === 'password') {
    if (!auth.password) throw makeError('EVAULTLOCKED', 'no password available (vault locked?)')
    cfg.password = auth.password
  } else if (auth.auth === 'key') {
    if (!auth.identityPath) throw makeError('EHOSTAUTH', 'identityPath missing for key auth')
    cfg.privateKey = undefined
  }
  return cfg
}

async function readPrivateKey(p: string): Promise<Buffer> {
  try {
    return await fsp.readFile(p)
  } catch (err) {
    throw makeError('EHOSTAUTH', `cannot read identity ${p}: ${(err as Error).message}`)
  }
}

async function connectClient(auth: SftpAuthBundle): Promise<PoolEntry> {
  const client = new Client()
  const cfg = buildConnectConfig(auth)
  if (auth.auth === 'key' && auth.identityPath) {
    cfg.privateKey = await readPrivateKey(auth.identityPath)
  }
  const entry: PoolEntry = {
    client,
    sftp: undefined as unknown as SFTPWrapper,
    ready: false,
    lastUsedMs: Date.now(),
  }
  pool.set(auth.hostId, entry)

  await new Promise<void>((resolve, reject) => {
    client.once('ready', () => {
      client.sftp((err, sftp) => {
        if (err) {
          entry.lastError = err.message
          pool.delete(auth.hostId)
          client.end()
          reject(makeError('EHOSTLOST', err.message))
          return
        }
        entry.sftp = sftp
        entry.ready = true
        entry.lastUsedMs = Date.now()
        resolve()
      })
    })
    client.once('error', (err) => {
      entry.lastError = err.message
      pool.delete(auth.hostId)
      reject(makeError('EHOSTAUTH', err.message))
    })
    client.once('end', () => {
      entry.ready = false
      pool.delete(auth.hostId)
    })
    client.once('close', () => {
      entry.ready = false
      pool.delete(auth.hostId)
    })
    try {
      client.connect(cfg)
    } catch (err) {
      pool.delete(auth.hostId)
      reject(makeError('EHOSTAUTH', (err as Error).message))
    }
  })

  return entry
}

async function withSftp<T>(hostId: string, fn: (sftp: SFTPWrapper) => Promise<T>): Promise<T> {
  const entry = pool.get(hostId)
  if (!entry || !entry.ready) {
    throw makeError('EHOSTLOST', `not connected to ${hostId}`)
  }
  entry.lastUsedMs = Date.now()
  try {
    const result = await fn(entry.sftp)
    entry.lastUsedMs = Date.now()
    return result
  } catch (err) {
    const code = (err as { code?: number | string }).code
    if (code === 2) throw makeError('ENOENT', (err as Error).message)
    if (code === 3) throw makeError('EACCES', (err as Error).message)
    if (code === 4 || code === 11) throw makeError('EEXIST', (err as Error).message)
    throw makeError('EGENERIC', (err as Error).message)
  }
}

function posixDirname(p: string): string | null {
  if (p === '/' || p === '') return null
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx)
}

function posixJoin(parent: string, name: string): string {
  if (parent.endsWith('/')) return parent + name
  return parent + '/' + name
}

function sftpKindFromAttrs(mode: number): FileEntryKind {
  const S_IFMT = 0o170000
  const S_IFDIR = 0o040000
  const S_IFLNK = 0o120000
  const S_IFREG = 0o100000
  const t = mode & S_IFMT
  if (t === S_IFDIR) return 'dir'
  if (t === S_IFLNK) return 'symlink'
  if (t === S_IFREG) return 'file'
  return 'other'
}

async function sftpReaddir(sftp: SFTPWrapper, p: string): Promise<Array<{ filename: string; longname: string; attrs: { mode: number; size: number; mtime: number } }>> {
  return new Promise((resolve, reject) => {
    sftp.readdir(p, (err, list) => {
      if (err) reject(err)
      else resolve(list as unknown as Array<{ filename: string; longname: string; attrs: { mode: number; size: number; mtime: number } }>)
    })
  })
}

async function sftpStatResolved(sftp: SFTPWrapper, p: string): Promise<{ mode: number; size: number; mtime: number } | null> {
  return new Promise((resolve) => {
    sftp.stat(p, (err, attrs) => {
      if (err || !attrs) resolve(null)
      else resolve({ mode: attrs.mode, size: attrs.size, mtime: attrs.mtime })
    })
  })
}

async function sftpReadlink(sftp: SFTPWrapper, p: string): Promise<string | null> {
  return new Promise((resolve) => {
    sftp.readlink(p, (err, target) => {
      if (err || !target) resolve(null)
      else resolve(target)
    })
  })
}

async function sftpRealpath(sftp: SFTPWrapper, p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.realpath(p, (err, abs) => {
      if (err) reject(err)
      else resolve(abs)
    })
  })
}

async function listSftp(args: { hostId: string; cwd: string; showHidden: boolean }): Promise<FileListResult> {
  return withSftp(args.hostId, async (sftp) => {
    const list = await sftpReaddir(sftp, args.cwd)
    const entries: FileEntry[] = []
    let truncated = false
    for (const it of list) {
      if (it.filename === '.' || it.filename === '..') continue
      if (entries.length >= maxEntriesPerDir) {
        truncated = true
        break
      }
      const isHidden = isHiddenName(it.filename)
      if (!args.showHidden && isHidden) continue
      const abs = posixJoin(args.cwd, it.filename)
      const kind = sftpKindFromAttrs(it.attrs.mode)
      let resolvedKind: FileEntryKind | undefined
      let symlinkTarget: string | null | undefined
      if (kind === 'symlink') {
        symlinkTarget = await sftpReadlink(sftp, abs)
        const stat = await sftpStatResolved(sftp, abs)
        resolvedKind = stat ? sftpKindFromAttrs(stat.mode) : undefined
      }
      entries.push({
        name: it.filename,
        path: abs,
        kind,
        size: kind === 'file' ? it.attrs.size : null,
        mtimeMs: it.attrs.mtime ? it.attrs.mtime * 1000 : null,
        isHidden,
        symlinkTarget,
        resolvedKind,
      })
    }
    return {
      cwd: args.cwd,
      parent: posixDirname(args.cwd),
      entries,
      truncated,
    }
  })
}

async function homeSftp(args: { hostId: string }): Promise<string> {
  return withSftp(args.hostId, (sftp) => sftpRealpath(sftp, '.'))
}

async function realpathSftp(args: { hostId: string; path: string }): Promise<string> {
  return withSftp(args.hostId, (sftp) => sftpRealpath(sftp, args.path))
}

async function statSftp(args: { hostId: string; path: string }): Promise<FileStat> {
  return withSftp(args.hostId, async (sftp) => {
    const attrs = await sftpStatResolved(sftp, args.path)
    if (!attrs) {
      return {
        exists: false,
        name: args.path.split('/').pop() ?? args.path,
        path: args.path,
        kind: 'other',
        size: null,
        mtimeMs: null,
        isHidden: isHiddenName(args.path.split('/').pop() ?? ''),
      }
    }
    const kind = sftpKindFromAttrs(attrs.mode)
    return {
      exists: true,
      name: args.path.split('/').pop() ?? args.path,
      path: args.path,
      kind,
      size: kind === 'file' ? attrs.size : null,
      mtimeMs: attrs.mtime ? attrs.mtime * 1000 : null,
      isHidden: isHiddenName(args.path.split('/').pop() ?? ''),
    }
  })
}

async function mkdirSftp(args: { hostId: string; path: string }): Promise<void> {
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.mkdir(args.path, (err) => (err ? reject(err) : resolve()))
    }),
  )
}

async function createFileSftp(args: { hostId: string; path: string }): Promise<void> {
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.open(args.path, 'wx', (err, handle) => {
        if (err) {
          reject(err)
          return
        }
        sftp.close(handle, (closeErr) => (closeErr ? reject(closeErr) : resolve()))
      })
    }),
  )
}

async function renameSftp(args: { hostId: string; from: string; to: string }): Promise<void> {
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.rename(args.from, args.to, (err) => (err ? reject(err) : resolve()))
    }),
  )
}

async function removeSftpRecursive(sftp: SFTPWrapper, p: string): Promise<void> {
  const list = await sftpReaddir(sftp, p)
  for (const it of list) {
    if (it.filename === '.' || it.filename === '..') continue
    const abs = posixJoin(p, it.filename)
    const kind = sftpKindFromAttrs(it.attrs.mode)
    if (kind === 'dir') {
      await removeSftpRecursive(sftp, abs)
    } else {
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(abs, (err) => (err ? reject(err) : resolve()))
      })
    }
  }
  await new Promise<void>((resolve, reject) => {
    sftp.rmdir(p, (err) => (err ? reject(err) : resolve()))
  })
}

async function removeSftp(args: { hostId: string; path: string; recursive: boolean }): Promise<void> {
  return withSftp(args.hostId, async (sftp) => {
    const stat = await sftpStatResolved(sftp, args.path)
    if (!stat) throw makeError('ENOENT', args.path)
    const kind = sftpKindFromAttrs(stat.mode)
    if (kind === 'dir') {
      if (!args.recursive) throw makeError('EISDIR', args.path)
      await removeSftpRecursive(sftp, args.path)
      return
    }
    await new Promise<void>((resolve, reject) => {
      sftp.unlink(args.path, (err) => (err ? reject(err) : resolve()))
    })
  })
}

async function copySftpFile(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    sftp.open(from, 'r', (err, src) => {
      if (err) {
        reject(err)
        return
      }
      sftp.open(to, 'wx', (err2, dst) => {
        if (err2) {
          sftp.close(src, () => {})
          reject(err2)
          return
        }
        const buf = Buffer.alloc(64 * 1024)
        let pos = 0
        const step = (): void => {
          sftp.read(src, buf, 0, buf.length, pos, (rerr, bytes) => {
            if (rerr) {
              sftp.close(src, () => {})
              sftp.close(dst, () => {})
              reject(rerr)
              return
            }
            if (!bytes) {
              sftp.close(src, () => {})
              sftp.close(dst, () => resolve())
              return
            }
            sftp.write(dst, buf.slice(0, bytes), 0, bytes, pos, (werr) => {
              if (werr) {
                sftp.close(src, () => {})
                sftp.close(dst, () => {})
                reject(werr)
                return
              }
              pos += bytes
              step()
            })
          })
        }
        step()
      })
    })
  })
}

async function copySftpRecursive(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  const stat = await sftpStatResolved(sftp, from)
  if (!stat) throw makeError('ENOENT', from)
  const kind = sftpKindFromAttrs(stat.mode)
  if (kind === 'dir') {
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(to, (err) => (err ? reject(err) : resolve()))
    })
    const list = await sftpReaddir(sftp, from)
    for (const it of list) {
      if (it.filename === '.' || it.filename === '..') continue
      await copySftpRecursive(sftp, posixJoin(from, it.filename), posixJoin(to, it.filename))
    }
    return
  }
  await copySftpFile(sftp, from, to)
}

async function copySftp(args: { hostId: string; from: string; to: string; recursive: boolean }): Promise<void> {
  return withSftp(args.hostId, async (sftp) => {
    if (args.recursive) {
      await copySftpRecursive(sftp, args.from, args.to)
    } else {
      await copySftpFile(sftp, args.from, args.to)
    }
  })
}

async function moveSftp(args: { hostId: string; from: string; to: string }): Promise<void> {
  return withSftp(args.hostId, async (sftp) => {
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.rename(args.from, args.to, (err) => (err ? reject(err) : resolve()))
      })
    } catch {
      await copySftpRecursive(sftp, args.from, args.to)
      await removeSftpRecursive(sftp, args.from).catch(async () => {
        await new Promise<void>((resolve) => sftp.unlink(args.from, () => resolve()))
      })
    }
  })
}

async function uploadSftp(args: { hostId: string; localPath: string; remotePath: string }): Promise<void> {
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.fastPut(args.localPath, args.remotePath, (err) => (err ? reject(err) : resolve()))
    }),
  )
}

async function downloadSftp(args: { hostId: string; remotePath: string; localPath: string }): Promise<void> {
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.fastGet(args.remotePath, args.localPath, (err) => (err ? reject(err) : resolve()))
    }),
  )
}

async function readSftp(args: { hostId: string; path: string }): Promise<{ content: string; truncated: boolean; size: number }> {
  return withSftp(args.hostId, async (sftp) => {
    const stat = await sftpStatResolved(sftp, args.path)
    if (!stat) throw makeError('ENOENT', args.path)
    const kind = sftpKindFromAttrs(stat.mode)
    if (kind === 'dir') throw makeError('EISDIR', args.path)
    if (stat.size > MAX_READ_BYTES) {
      throw makeError('EGENERIC', `file too large (${stat.size} bytes, limit ${MAX_READ_BYTES})`)
    }
    const buf = await new Promise<Buffer>((resolve, reject) => {
      sftp.open(args.path, 'r', (err, handle) => {
        if (err) {
          reject(err)
          return
        }
        const chunks: Buffer[] = []
        const bufSize = 64 * 1024
        const chunk = Buffer.alloc(bufSize)
        let pos = 0
        const step = (): void => {
          sftp.read(handle, chunk, 0, bufSize, pos, (rerr, bytes) => {
            if (rerr) {
              sftp.close(handle, () => {})
              reject(rerr)
              return
            }
            if (!bytes) {
              sftp.close(handle, () => resolve(Buffer.concat(chunks)))
              return
            }
            chunks.push(Buffer.from(chunk.subarray(0, bytes)))
            pos += bytes
            step()
          })
        }
        step()
      })
    })
    if (looksBinary(buf)) throw makeError('EGENERIC', 'binary file not supported by editor')
    return { content: buf.toString('utf-8'), truncated: false, size: stat.size }
  })
}

async function writeSftp(args: { hostId: string; path: string; content: string }): Promise<void> {
  if (Buffer.byteLength(args.content, 'utf-8') > MAX_WRITE_BYTES) {
    throw makeError('EGENERIC', `content too large (limit ${MAX_WRITE_BYTES} bytes)`)
  }
  return withSftp(args.hostId, (sftp) =>
    new Promise<void>((resolve, reject) => {
      sftp.open(args.path, 'w', (err, handle) => {
        if (err) {
          reject(err)
          return
        }
        const buf = Buffer.from(args.content, 'utf-8')
        sftp.write(handle, buf, 0, buf.length, 0, (werr) => {
          sftp.close(handle, (cerr) => {
            if (werr) reject(werr)
            else if (cerr) reject(cerr)
            else resolve()
          })
        })
      })
    }),
  )
}

function disconnectClient(hostId: string): void {
  const entry = pool.get(hostId)
  if (!entry) return
  try {
    entry.client.end()
  } catch {}
  pool.delete(hostId)
}

function gcIdle(): void {
  const now = Date.now()
  for (const [hostId, entry] of pool) {
    if (now - entry.lastUsedMs > idleTimeoutMs) {
      disconnectClient(hostId)
    }
  }
}

export function activate(ctx: MainCtx): void {
  ctx.logger.info('file-browser main activated')

  const w = ctx.settings.get<number>('maxEntriesPerDir')
  if (typeof w === 'number' && w > 0) maxEntriesPerDir = w
  const t = ctx.settings.get<number>('sftpIdleTimeoutSec')
  if (typeof t === 'number' && t > 0) idleTimeoutMs = t * 1000

  ctx.subscribe(ctx.ipc.handle('fs:list', (a) => listLocal(a as { cwd: string; showHidden: boolean })))
  ctx.subscribe(ctx.ipc.handle('fs:stat', (a) => statLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:home', () => homeLocal()))
  ctx.subscribe(ctx.ipc.handle('fs:realpath', (a) => realpathLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:mkdir', (a) => mkdirLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:create-file', (a) => createFileLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:rename', (a) => renameLocal(a as { from: string; to: string })))
  ctx.subscribe(ctx.ipc.handle('fs:remove', (a) => removeLocal(a as { path: string; recursive: boolean })))
  ctx.subscribe(ctx.ipc.handle('fs:copy', (a) => copyLocal(a as { from: string; to: string; recursive: boolean })))
  ctx.subscribe(ctx.ipc.handle('fs:move', (a) => moveLocal(a as { from: string; to: string })))
  ctx.subscribe(ctx.ipc.handle('fs:open-default', (a) => openDefaultLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:read', (a) => readLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:write', (a) => writeLocal(a as { path: string; content: string })))

  ctx.subscribe(
    ctx.ipc.handle('sftp:connect', async (a) => {
      const auth = (a as { auth: SftpAuthBundle }).auth
      const existing = pool.get(auth.hostId)
      if (existing?.ready) return { connected: true }
      if (existing?.connectingPromise) {
        await existing.connectingPromise
        return { connected: true }
      }
      await connectClient(auth)
      return { connected: true }
    }),
  )
  ctx.subscribe(ctx.ipc.handle('sftp:list', (a) => listSftp(a as { hostId: string; cwd: string; showHidden: boolean })))
  ctx.subscribe(ctx.ipc.handle('sftp:stat', (a) => statSftp(a as { hostId: string; path: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:home', (a) => homeSftp(a as { hostId: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:realpath', (a) => realpathSftp(a as { hostId: string; path: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:mkdir', (a) => mkdirSftp(a as { hostId: string; path: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:create-file', (a) => createFileSftp(a as { hostId: string; path: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:rename', (a) => renameSftp(a as { hostId: string; from: string; to: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:remove', (a) => removeSftp(a as { hostId: string; path: string; recursive: boolean })))
  ctx.subscribe(ctx.ipc.handle('sftp:copy', (a) => copySftp(a as { hostId: string; from: string; to: string; recursive: boolean })))
  ctx.subscribe(ctx.ipc.handle('sftp:move', (a) => moveSftp(a as { hostId: string; from: string; to: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:upload', (a) => uploadSftp(a as { hostId: string; localPath: string; remotePath: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:download', (a) => downloadSftp(a as { hostId: string; remotePath: string; localPath: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:read', (a) => readSftp(a as { hostId: string; path: string })))
  ctx.subscribe(ctx.ipc.handle('sftp:write', (a) => writeSftp(a as { hostId: string; path: string; content: string })))
  ctx.subscribe(
    ctx.ipc.handle('sftp:disconnect', (a) => {
      disconnectClient((a as { hostId: string }).hostId)
      return undefined
    }),
  )
  ctx.subscribe(
    ctx.ipc.handle('sftp:status', (a) => {
      const e = pool.get((a as { hostId: string }).hostId)
      return { connected: Boolean(e?.ready), lastError: e?.lastError ?? null }
    }),
  )

  idleTimer = setInterval(gcIdle, 60_000)
  ctx.subscribe({ dispose: () => { if (idleTimer) clearInterval(idleTimer); idleTimer = null } })
}

export function deactivate(): void {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
  for (const hostId of Array.from(pool.keys())) {
    disconnectClient(hostId)
  }
}

void createReadStream
void createWriteStream
