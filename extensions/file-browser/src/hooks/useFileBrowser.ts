import { useCallback, useEffect, useReducer, useRef } from 'react'
import { reduceTree, type TreeAction } from '../shared/file-tree'
import {
  EMPTY_TREE,
  type FileBackend,
  type FileEntry,
  type FileListResult,
  type FileTreeState,
  type FileStat,
} from '../shared/types'

interface IpcLite {
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
}

interface Args {
  ipc: IpcLite
  backend: FileBackend | null
  cwd: string | null
  showHidden: boolean
}

interface UseFileBrowserResult {
  tree: FileTreeState
  refreshRoot: () => Promise<void>
  expand: (path: string) => Promise<void>
  collapse: (path: string) => void
  refreshDir: (path: string) => Promise<void>
  list: (cwd: string) => Promise<FileListResult>
  stat: (p: string) => Promise<FileStat>
  home: () => Promise<string>
  realpath: (p: string) => Promise<string>
  mkdir: (parent: string, name: string) => Promise<void>
  touch: (parent: string, name: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  remove: (p: string, recursive: boolean) => Promise<void>
  copy: (from: string, to: string, recursive: boolean) => Promise<void>
  move: (from: string, to: string) => Promise<void>
  openDefault: (p: string) => Promise<void>
}

function channelPrefix(backend: FileBackend): string {
  return backend.kind === 'local' ? 'fs' : 'sftp'
}

function backendArgs(backend: FileBackend, extra: Record<string, unknown>): Record<string, unknown> {
  if (backend.kind === 'sftp') return { hostId: backend.hostId, ...extra }
  return extra
}

function joinPath(backend: FileBackend, parent: string, name: string): string {
  if (backend.kind === 'sftp') {
    return parent.endsWith('/') ? parent + name : parent + '/' + name
  }
  if (parent.endsWith('/') || parent.endsWith('\\')) return parent + name
  const sep = parent.includes('\\') ? '\\' : '/'
  return parent + sep + name
}

export function useFileBrowser(args: Args): UseFileBrowserResult {
  const { ipc, backend, cwd, showHidden } = args
  const [tree, dispatch] = useReducer(reduceTree, EMPTY_TREE)
  const cwdRef = useRef<string | null>(null)

  const callList = useCallback(
    async (target: string): Promise<FileListResult> => {
      if (!backend) throw new Error('no backend')
      return ipc.invoke<FileListResult>(
        `${channelPrefix(backend)}:list`,
        backendArgs(backend, { cwd: target, showHidden }),
      )
    },
    [backend, ipc, showHidden],
  )

  const refreshRoot = useCallback(async () => {
    if (!backend || !cwd) return
    cwdRef.current = cwd
    dispatch({ type: 'set-root', rootPath: cwd } as TreeAction)
    dispatch({ type: 'load-root-start' } as TreeAction)
    try {
      const res = await callList(cwd)
      if (cwdRef.current !== cwd) return
      dispatch({ type: 'set-entries', parentPath: null, entries: res.entries } as TreeAction)
    } catch (err) {
      if (cwdRef.current !== cwd) return
      dispatch({ type: 'load-root-error', error: (err as Error).message } as TreeAction)
    }
  }, [backend, callList, cwd])

  useEffect(() => {
    void refreshRoot()
  }, [refreshRoot])

  const expand = useCallback(
    async (p: string) => {
      if (!backend) return
      const node = tree.nodes[p]
      if (!node) return
      dispatch({ type: 'expand', path: p } as TreeAction)
      if (node.loaded) return
      dispatch({ type: 'mark-loading', path: p, loading: true } as TreeAction)
      try {
        const res = await callList(p)
        dispatch({ type: 'set-entries', parentPath: p, entries: res.entries } as TreeAction)
      } catch (err) {
        dispatch({ type: 'mark-error', path: p, error: (err as Error).message } as TreeAction)
      }
    },
    [backend, callList, tree.nodes],
  )

  const collapse = useCallback((p: string) => {
    dispatch({ type: 'collapse', path: p } as TreeAction)
  }, [])

  const refreshDir = useCallback(
    async (p: string) => {
      if (!backend) return
      if (p === cwdRef.current) {
        await refreshRoot()
        return
      }
      dispatch({ type: 'invalidate', path: p } as TreeAction)
      dispatch({ type: 'mark-loading', path: p, loading: true } as TreeAction)
      try {
        const res = await callList(p)
        dispatch({ type: 'set-entries', parentPath: p, entries: res.entries } as TreeAction)
      } catch (err) {
        dispatch({ type: 'mark-error', path: p, error: (err as Error).message } as TreeAction)
      }
    },
    [backend, callList, refreshRoot],
  )

  const list = useCallback((c: string) => callList(c), [callList])

  const stat = useCallback(
    async (p: string): Promise<FileStat> => {
      if (!backend) throw new Error('no backend')
      return ipc.invoke<FileStat>(
        `${channelPrefix(backend)}:stat`,
        backendArgs(backend, { path: p }),
      )
    },
    [backend, ipc],
  )

  const home = useCallback(async (): Promise<string> => {
    if (!backend) throw new Error('no backend')
    return ipc.invoke<string>(`${channelPrefix(backend)}:home`, backendArgs(backend, {}))
  }, [backend, ipc])

  const realpath = useCallback(
    async (p: string): Promise<string> => {
      if (!backend) throw new Error('no backend')
      return ipc.invoke<string>(
        `${channelPrefix(backend)}:realpath`,
        backendArgs(backend, { path: p }),
      )
    },
    [backend, ipc],
  )

  const mkdir = useCallback(
    async (parent: string, name: string) => {
      if (!backend) return
      const p = joinPath(backend, parent, name)
      await ipc.invoke(`${channelPrefix(backend)}:mkdir`, backendArgs(backend, { path: p }))
      await refreshDir(parent)
    },
    [backend, ipc, refreshDir],
  )

  const touch = useCallback(
    async (parent: string, name: string) => {
      if (!backend) return
      const p = joinPath(backend, parent, name)
      await ipc.invoke(`${channelPrefix(backend)}:create-file`, backendArgs(backend, { path: p }))
      await refreshDir(parent)
    },
    [backend, ipc, refreshDir],
  )

  const rename = useCallback(
    async (from: string, to: string) => {
      if (!backend) return
      await ipc.invoke(
        `${channelPrefix(backend)}:rename`,
        backendArgs(backend, { from, to }),
      )
      const parent = parentOf(backend, from)
      if (parent) await refreshDir(parent)
    },
    [backend, ipc, refreshDir],
  )

  const remove = useCallback(
    async (p: string, recursive: boolean) => {
      if (!backend) return
      await ipc.invoke(
        `${channelPrefix(backend)}:remove`,
        backendArgs(backend, { path: p, recursive }),
      )
      dispatch({ type: 'remove', path: p } as TreeAction)
      const parent = parentOf(backend, p)
      if (parent) await refreshDir(parent)
    },
    [backend, ipc, refreshDir],
  )

  const copy = useCallback(
    async (from: string, to: string, recursive: boolean) => {
      if (!backend) return
      await ipc.invoke(
        `${channelPrefix(backend)}:copy`,
        backendArgs(backend, { from, to, recursive }),
      )
      const parent = parentOf(backend, to)
      if (parent) await refreshDir(parent)
    },
    [backend, ipc, refreshDir],
  )

  const move = useCallback(
    async (from: string, to: string) => {
      if (!backend) return
      await ipc.invoke(`${channelPrefix(backend)}:move`, backendArgs(backend, { from, to }))
      const fromParent = parentOf(backend, from)
      const toParent = parentOf(backend, to)
      if (fromParent) await refreshDir(fromParent)
      if (toParent && toParent !== fromParent) await refreshDir(toParent)
    },
    [backend, ipc, refreshDir],
  )

  const openDefault = useCallback(
    async (p: string) => {
      if (!backend) return
      if (backend.kind !== 'local') {
        throw new Error('open in default app not supported for remote files')
      }
      await ipc.invoke('fs:open-default', { path: p })
    },
    [backend, ipc],
  )

  void list

  return {
    tree,
    refreshRoot,
    expand,
    collapse,
    refreshDir,
    list,
    stat,
    home,
    realpath,
    mkdir,
    touch,
    rename,
    remove,
    copy,
    move,
    openDefault,
  }
}

function parentOf(backend: FileBackend, p: string): string | null {
  if (backend.kind === 'sftp') {
    if (p === '/' || p === '') return null
    const idx = p.lastIndexOf('/')
    if (idx <= 0) return '/'
    return p.slice(0, idx)
  }
  const sep = p.includes('\\') ? '\\' : '/'
  const idx = p.lastIndexOf(sep)
  if (idx <= 0) return null
  return p.slice(0, idx)
}

export { parentOf }
