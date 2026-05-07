import { promises as fsp } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { shell } from 'electron'
import type {
  FileEntry,
  FileEntryKind,
  FileListResult,
  FileOpError,
  FileOpErrorCode,
  FileStat,
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

let maxEntriesPerDir = 5000

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
    'ENOENT',
    'EACCES',
    'EEXIST',
    'EISDIR',
    'ENOTDIR',
    'EPERM',
    'ETIMEDOUT',
    'ENOTEMPTY',
  ]
  return makeError(
    (known as string[]).includes(code) ? (code as FileOpErrorCode) : 'EGENERIC',
    message,
  )
}

function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

function localKindFromDirent(d: {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}): FileEntryKind {
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
    } catch {
      // ignore
    }
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

interface TreeDir {
  entries: FileEntry[]
  truncated?: boolean
  error?: string
}

interface FileTreeResult {
  cwd: string
  parent: string | null
  dirs: Record<string, TreeDir>
  reachedCap: boolean
  capDepth: number
  capNodes: number
}

const DEFAULT_TREE_MAX_DEPTH = 8
const DEFAULT_TREE_MAX_NODES = 5000

async function listEntriesLocal(args: { cwd: string; showHidden: boolean }): Promise<TreeDir> {
  try {
    const dirents = await fsp.readdir(args.cwd, { withFileTypes: true })
    const entries: FileEntry[] = []
    let truncated = false
    for (const d of dirents) {
      if (entries.length >= maxEntriesPerDir) {
        truncated = true
        break
      }
      const isHidden = isHiddenName(d.name)
      if (!args.showHidden && isHidden) continue
      const abs = path.join(args.cwd, d.name)
      const kind = localKindFromDirent(d)
      let size: number | null = null
      let mtimeMs: number | null = null
      let resolvedKind: FileEntryKind | undefined
      let symlinkTarget: string | null | undefined
      try {
        const st = await fsp.lstat(abs)
        size = kind === 'file' ? st.size : null
        mtimeMs = st.mtimeMs
      } catch {
        // ignore
      }
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
    return { entries, truncated: truncated || undefined }
  } catch (err) {
    return { entries: [], error: (err as Error).message }
  }
}

async function treeLocal(args: {
  cwd: string
  showHidden: boolean
  maxDepth?: number
  maxNodes?: number
}): Promise<FileTreeResult> {
  const cwd = path.resolve(args.cwd)
  const maxDepth =
    typeof args.maxDepth === 'number' && args.maxDepth > 0 ? args.maxDepth : DEFAULT_TREE_MAX_DEPTH
  const maxNodes =
    typeof args.maxNodes === 'number' && args.maxNodes > 0 ? args.maxNodes : DEFAULT_TREE_MAX_NODES
  const dirs: Record<string, TreeDir> = {}
  let nodeCount = 0
  let reachedCap = false

  async function walk(dirPath: string, depth: number): Promise<void> {
    if (dirs[dirPath]) return
    const dir = await listEntriesLocal({ cwd: dirPath, showHidden: args.showHidden })
    dirs[dirPath] = dir
    nodeCount += dir.entries.length
    if (nodeCount >= maxNodes) {
      reachedCap = true
      return
    }
    if (depth >= maxDepth) {
      reachedCap = true
      return
    }
    const subdirs = dir.entries.filter(
      (e) => e.kind === 'dir' || (e.kind === 'symlink' && e.resolvedKind === 'dir'),
    )
    for (const sd of subdirs) {
      if (nodeCount >= maxNodes) {
        reachedCap = true
        break
      }
      await walk(sd.path, depth + 1)
    }
  }

  await walk(cwd, 0)

  const parent = path.dirname(cwd)
  return {
    cwd,
    parent: parent === cwd ? null : parent,
    dirs,
    reachedCap,
    capDepth: maxDepth,
    capNodes: maxNodes,
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

async function copyLocal(args: {
  from: string
  to: string
  recursive: boolean
}): Promise<void> {
  try {
    await fsp.cp(args.from, args.to, {
      recursive: args.recursive,
      errorOnExist: true,
      force: false,
    })
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
        await fsp.cp(args.from, args.to, {
          recursive: true,
          errorOnExist: true,
          force: false,
        })
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

async function readLocal(args: {
  path: string
}): Promise<{ content: string; truncated: boolean; size: number }> {
  try {
    const st = await fsp.stat(args.path)
    if (!st.isFile()) throw makeError('EISDIR', `not a file: ${args.path}`)
    if (st.size > MAX_READ_BYTES) {
      throw makeError(
        'EGENERIC',
        `file too large (${st.size} bytes, limit ${MAX_READ_BYTES})`,
      )
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
    try {
      await fsp.rm(tmp, { force: true })
    } catch {
      // ignore
    }
    throw mapNodeErr(err)
  }
}

export function activate(ctx: MainCtx): void {
  ctx.logger.info('file-browser main activated')

  const w = ctx.settings.get<number>('maxEntriesPerDir')
  if (typeof w === 'number' && w > 0) maxEntriesPerDir = w

  ctx.subscribe(ctx.ipc.handle('fs:list', (a) => listLocal(a as { cwd: string; showHidden: boolean })))
  ctx.subscribe(
    ctx.ipc.handle('fs:tree', (a) =>
      treeLocal(
        a as { cwd: string; showHidden: boolean; maxDepth?: number; maxNodes?: number },
      ),
    ),
  )
  ctx.subscribe(ctx.ipc.handle('fs:stat', (a) => statLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:home', () => homeLocal()))
  ctx.subscribe(ctx.ipc.handle('fs:realpath', (a) => realpathLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:mkdir', (a) => mkdirLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:create-file', (a) => createFileLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:rename', (a) => renameLocal(a as { from: string; to: string })))
  ctx.subscribe(
    ctx.ipc.handle('fs:remove', (a) => removeLocal(a as { path: string; recursive: boolean })),
  )
  ctx.subscribe(
    ctx.ipc.handle('fs:copy', (a) =>
      copyLocal(a as { from: string; to: string; recursive: boolean }),
    ),
  )
  ctx.subscribe(ctx.ipc.handle('fs:move', (a) => moveLocal(a as { from: string; to: string })))
  ctx.subscribe(ctx.ipc.handle('fs:open-default', (a) => openDefaultLocal(a as { path: string })))
  ctx.subscribe(ctx.ipc.handle('fs:read', (a) => readLocal(a as { path: string })))
  ctx.subscribe(
    ctx.ipc.handle('fs:write', (a) => writeLocal(a as { path: string; content: string })),
  )
}

export function deactivate(): void {
  /* nothing to clean up */
}
