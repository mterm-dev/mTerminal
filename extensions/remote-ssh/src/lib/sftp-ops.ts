import type { SFTPWrapper } from 'ssh2'
import { makeError } from './error-map'
import type {
  FileEntry,
  FileEntryKind,
  FileListResult,
  FileStat,
} from '../shared/types'
import type { SshPool } from './ssh-pool'

const MAX_READ_BYTES = 5 * 1024 * 1024
const MAX_WRITE_BYTES = 10 * 1024 * 1024

export interface SftpOpsConfig {
  maxEntriesPerDir: number
}

const defaultConfig: SftpOpsConfig = {
  maxEntriesPerDir: 5000,
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192)
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true
  }
  return false
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

function basename(p: string): string {
  const idx = p.lastIndexOf('/')
  return idx >= 0 ? p.slice(idx + 1) : p
}

function kindFromMode(mode: number): FileEntryKind {
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

interface SftpAttrs {
  mode: number
  size: number
  mtime: number
}

interface SftpDirEntry {
  filename: string
  longname: string
  attrs: SftpAttrs
}

function readdir(sftp: SFTPWrapper, p: string): Promise<SftpDirEntry[]> {
  return new Promise((resolve, reject) => {
    sftp.readdir(p, (err, list) => {
      if (err) reject(err)
      else resolve(list as unknown as SftpDirEntry[])
    })
  })
}

function statResolved(sftp: SFTPWrapper, p: string): Promise<SftpAttrs | null> {
  return new Promise((resolve) => {
    sftp.stat(p, (err, attrs) => {
      if (err || !attrs) resolve(null)
      else resolve({ mode: attrs.mode, size: attrs.size, mtime: attrs.mtime })
    })
  })
}

function readlink(sftp: SFTPWrapper, p: string): Promise<string | null> {
  return new Promise((resolve) => {
    sftp.readlink(p, (err, target) => {
      if (err || !target) resolve(null)
      else resolve(target)
    })
  })
}

function realpath(sftp: SFTPWrapper, p: string): Promise<string> {
  return new Promise((resolve, reject) => {
    sftp.realpath(p, (err, abs) => {
      if (err) reject(err)
      else resolve(abs)
    })
  })
}

export class SftpOps {
  private cfg: SftpOpsConfig = { ...defaultConfig }

  constructor(private pool: SshPool) {}

  setConfig(partial: Partial<SftpOpsConfig>): void {
    this.cfg = { ...this.cfg, ...partial }
  }

  async list(args: {
    hostId: string
    cwd: string
    showHidden: boolean
  }): Promise<FileListResult> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      const list = await readdir(sftp, args.cwd)
      const entries: FileEntry[] = []
      let truncated = false
      for (const it of list) {
        if (it.filename === '.' || it.filename === '..') continue
        if (entries.length >= this.cfg.maxEntriesPerDir) {
          truncated = true
          break
        }
        const isHidden = isHiddenName(it.filename)
        if (!args.showHidden && isHidden) continue
        const abs = posixJoin(args.cwd, it.filename)
        const kind = kindFromMode(it.attrs.mode)
        let resolvedKind: FileEntryKind | undefined
        let symlinkTarget: string | null | undefined
        if (kind === 'symlink') {
          symlinkTarget = await readlink(sftp, abs)
          const stat = await statResolved(sftp, abs)
          resolvedKind = stat ? kindFromMode(stat.mode) : undefined
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

  async stat(args: { hostId: string; path: string }): Promise<FileStat> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      const attrs = await statResolved(sftp, args.path)
      const name = basename(args.path)
      if (!attrs) {
        return {
          exists: false,
          name,
          path: args.path,
          kind: 'other',
          size: null,
          mtimeMs: null,
          isHidden: isHiddenName(name),
        }
      }
      const kind = kindFromMode(attrs.mode)
      return {
        exists: true,
        name,
        path: args.path,
        kind,
        size: kind === 'file' ? attrs.size : null,
        mtimeMs: attrs.mtime ? attrs.mtime * 1000 : null,
        isHidden: isHiddenName(name),
      }
    })
  }

  async home(hostId: string): Promise<string> {
    return this.pool.withSftp(hostId, (sftp) => realpath(sftp, '.'))
  }

  async realpath(args: { hostId: string; path: string }): Promise<string> {
    return this.pool.withSftp(args.hostId, (sftp) => realpath(sftp, args.path))
  }

  async mkdir(args: { hostId: string; path: string }): Promise<void> {
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
        new Promise<void>((resolve, reject) => {
          sftp.mkdir(args.path, (err) => (err ? reject(err) : resolve()))
        }),
    )
  }

  async createFile(args: { hostId: string; path: string }): Promise<void> {
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
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

  async rename(args: { hostId: string; from: string; to: string }): Promise<void> {
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
        new Promise<void>((resolve, reject) => {
          sftp.rename(args.from, args.to, (err) => (err ? reject(err) : resolve()))
        }),
    )
  }

  async remove(args: { hostId: string; path: string; recursive: boolean }): Promise<void> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      const stat = await statResolved(sftp, args.path)
      if (!stat) throw makeError('ENOENT', args.path)
      const kind = kindFromMode(stat.mode)
      if (kind === 'dir') {
        if (!args.recursive) throw makeError('EISDIR', args.path)
        await removeRecursive(sftp, args.path)
        return
      }
      await new Promise<void>((resolve, reject) => {
        sftp.unlink(args.path, (err) => (err ? reject(err) : resolve()))
      })
    })
  }

  async copy(args: {
    hostId: string
    from: string
    to: string
    recursive: boolean
  }): Promise<void> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      if (args.recursive) {
        await copyRecursive(sftp, args.from, args.to)
      } else {
        await copyFile(sftp, args.from, args.to)
      }
    })
  }

  async move(args: { hostId: string; from: string; to: string }): Promise<void> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      try {
        await new Promise<void>((resolve, reject) => {
          sftp.rename(args.from, args.to, (err) => (err ? reject(err) : resolve()))
        })
      } catch {
        await copyRecursive(sftp, args.from, args.to)
        await removeRecursive(sftp, args.from).catch(
          () =>
            new Promise<void>((resolve) => {
              sftp.unlink(args.from, () => resolve())
            }),
        )
      }
    })
  }

  async upload(args: {
    hostId: string
    localPath: string
    remotePath: string
  }): Promise<void> {
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
        new Promise<void>((resolve, reject) => {
          sftp.fastPut(args.localPath, args.remotePath, (err) =>
            err ? reject(err) : resolve(),
          )
        }),
    )
  }

  async download(args: {
    hostId: string
    remotePath: string
    localPath: string
  }): Promise<void> {
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
        new Promise<void>((resolve, reject) => {
          sftp.fastGet(args.remotePath, args.localPath, (err) =>
            err ? reject(err) : resolve(),
          )
        }),
    )
  }

  async read(args: {
    hostId: string
    path: string
  }): Promise<{ content: string; truncated: boolean; size: number }> {
    return this.pool.withSftp(args.hostId, async (sftp) => {
      const stat = await statResolved(sftp, args.path)
      if (!stat) throw makeError('ENOENT', args.path)
      const kind = kindFromMode(stat.mode)
      if (kind === 'dir') throw makeError('EISDIR', args.path)
      if (stat.size > MAX_READ_BYTES) {
        throw makeError(
          'EGENERIC',
          `file too large (${stat.size} bytes, limit ${MAX_READ_BYTES})`,
        )
      }
      const buf = await readFile(sftp, args.path)
      if (looksBinary(buf)) {
        throw makeError('EGENERIC', 'binary file not supported by editor')
      }
      return { content: buf.toString('utf-8'), truncated: false, size: stat.size }
    })
  }

  async write(args: { hostId: string; path: string; content: string }): Promise<void> {
    if (Buffer.byteLength(args.content, 'utf-8') > MAX_WRITE_BYTES) {
      throw makeError('EGENERIC', `content too large (limit ${MAX_WRITE_BYTES} bytes)`)
    }
    return this.pool.withSftp(
      args.hostId,
      (sftp) =>
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
}

async function removeRecursive(sftp: SFTPWrapper, p: string): Promise<void> {
  const list = await readdir(sftp, p)
  for (const it of list) {
    if (it.filename === '.' || it.filename === '..') continue
    const abs = posixJoin(p, it.filename)
    const kind = kindFromMode(it.attrs.mode)
    if (kind === 'dir') {
      await removeRecursive(sftp, abs)
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

async function copyFile(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
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

async function copyRecursive(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  const stat = await statResolved(sftp, from)
  if (!stat) throw makeError('ENOENT', from)
  const kind = kindFromMode(stat.mode)
  if (kind === 'dir') {
    await new Promise<void>((resolve, reject) => {
      sftp.mkdir(to, (err) => (err ? reject(err) : resolve()))
    })
    const list = await readdir(sftp, from)
    for (const it of list) {
      if (it.filename === '.' || it.filename === '..') continue
      await copyRecursive(sftp, posixJoin(from, it.filename), posixJoin(to, it.filename))
    }
    return
  }
  await copyFile(sftp, from, to)
}

async function readFile(sftp: SFTPWrapper, p: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.open(p, 'r', (err, handle) => {
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
}
