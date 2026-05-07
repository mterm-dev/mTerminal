import type {
  FileEntry,
  FileNode,
  FileTreeDir,
  FileTreeState,
} from './types'

export type TreeAction =
  | { type: 'set-root'; rootPath: string }
  | { type: 'load-root-start' }
  | { type: 'load-root-error'; error: string }
  | { type: 'set-entries'; parentPath: string | null; entries: FileEntry[] }
  | {
      type: 'set-tree'
      rootPath: string
      dirs: Record<string, FileTreeDir>
    }
  | { type: 'expand'; path: string }
  | { type: 'collapse'; path: string }
  | { type: 'expand-all' }
  | { type: 'collapse-all' }
  | { type: 'mark-loading'; path: string; loading: boolean }
  | { type: 'mark-error'; path: string; error: string | null }
  | { type: 'invalidate'; path: string | null }
  | { type: 'remove'; path: string }

function entryToNode(e: FileEntry): FileNode {
  return {
    path: e.path,
    name: e.name,
    kind: e.resolvedKind ?? e.kind,
    isHidden: e.isHidden,
    size: e.size,
    mtimeMs: e.mtimeMs,
    expanded: false,
    loading: false,
    loaded: false,
    error: null,
    childPaths: null,
  }
}

function sortEntries(a: FileEntry, b: FileEntry): number {
  const aDir = (a.resolvedKind ?? a.kind) === 'dir'
  const bDir = (b.resolvedKind ?? b.kind) === 'dir'
  if (aDir !== bDir) return aDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function reduceTree(state: FileTreeState, action: TreeAction): FileTreeState {
  switch (action.type) {
    case 'set-root': {
      if (state.rootPath === action.rootPath) return state
      return {
        rootPath: action.rootPath,
        nodes: {},
        rootChildPaths: null,
        loadingRoot: false,
        rootError: null,
      }
    }
    case 'load-root-start':
      return { ...state, loadingRoot: true, rootError: null }
    case 'load-root-error':
      return { ...state, loadingRoot: false, rootError: action.error }
    case 'set-entries': {
      const sorted = [...action.entries].sort(sortEntries)
      const childPaths = sorted.map((e) => e.path)
      const nodes: Record<string, FileNode> = { ...state.nodes }
      for (const e of sorted) {
        const existing = nodes[e.path]
        if (existing) {
          nodes[e.path] = {
            ...existing,
            kind: e.resolvedKind ?? e.kind,
            size: e.size,
            mtimeMs: e.mtimeMs,
            isHidden: e.isHidden,
          }
        } else {
          nodes[e.path] = entryToNode(e)
        }
      }
      if (action.parentPath === null) {
        return {
          ...state,
          rootChildPaths: childPaths,
          loadingRoot: false,
          rootError: null,
          nodes,
        }
      }
      const parent = nodes[action.parentPath]
      if (parent) {
        nodes[action.parentPath] = {
          ...parent,
          childPaths,
          loaded: true,
          loading: false,
          error: null,
          expanded: true,
        }
      }
      return { ...state, nodes }
    }
    case 'set-tree': {
      const nodes: Record<string, FileNode> = {}
      let rootChildPaths: string[] | null = null
      for (const [dirPath, dir] of Object.entries(action.dirs)) {
        const sorted = [...dir.entries].sort(sortEntries)
        const childPaths = sorted.map((e) => e.path)
        for (const e of sorted) {
          const existing = nodes[e.path]
          if (existing) {
            nodes[e.path] = {
              ...existing,
              kind: e.resolvedKind ?? e.kind,
              size: e.size,
              mtimeMs: e.mtimeMs,
              isHidden: e.isHidden,
            }
          } else {
            nodes[e.path] = entryToNode(e)
          }
        }
        if (dirPath === action.rootPath) {
          rootChildPaths = childPaths
        }
      }
      for (const [dirPath, dir] of Object.entries(action.dirs)) {
        if (dirPath === action.rootPath) continue
        const sorted = [...dir.entries].sort(sortEntries)
        const childPaths = sorted.map((e) => e.path)
        const node = nodes[dirPath]
        if (!node) continue
        nodes[dirPath] = {
          ...node,
          childPaths,
          loaded: true,
          loading: false,
          error: dir.error ?? null,
          expanded: false,
        }
      }
      return {
        rootPath: action.rootPath,
        nodes,
        rootChildPaths,
        loadingRoot: false,
        rootError: null,
      }
    }
    case 'expand': {
      const node = state.nodes[action.path]
      if (!node) return state
      if (node.expanded) return state
      return {
        ...state,
        nodes: { ...state.nodes, [action.path]: { ...node, expanded: true } },
      }
    }
    case 'collapse': {
      const node = state.nodes[action.path]
      if (!node) return state
      if (!node.expanded) return state
      return {
        ...state,
        nodes: { ...state.nodes, [action.path]: { ...node, expanded: false } },
      }
    }
    case 'expand-all': {
      const nodes: Record<string, FileNode> = {}
      let changed = false
      for (const [p, n] of Object.entries(state.nodes)) {
        if (n.kind === 'dir' && !n.expanded) {
          nodes[p] = { ...n, expanded: true }
          changed = true
        } else {
          nodes[p] = n
        }
      }
      return changed ? { ...state, nodes } : state
    }
    case 'collapse-all': {
      const nodes: Record<string, FileNode> = {}
      let changed = false
      for (const [p, n] of Object.entries(state.nodes)) {
        if (n.kind === 'dir' && n.expanded) {
          nodes[p] = { ...n, expanded: false }
          changed = true
        } else {
          nodes[p] = n
        }
      }
      return changed ? { ...state, nodes } : state
    }
    case 'mark-loading': {
      const node = state.nodes[action.path]
      if (!node) return state
      return {
        ...state,
        nodes: { ...state.nodes, [action.path]: { ...node, loading: action.loading } },
      }
    }
    case 'mark-error': {
      const node = state.nodes[action.path]
      if (!node) return state
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.path]: { ...node, error: action.error, loading: false },
        },
      }
    }
    case 'invalidate': {
      if (action.path === null) {
        return {
          ...state,
          rootChildPaths: null,
          loadingRoot: false,
          rootError: null,
        }
      }
      const node = state.nodes[action.path]
      if (!node) return state
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.path]: { ...node, loaded: false, childPaths: null, error: null },
        },
      }
    }
    case 'remove': {
      const nodes = { ...state.nodes }
      const removed = new Set<string>()
      const stack = [action.path]
      while (stack.length) {
        const p = stack.pop()!
        if (!nodes[p]) continue
        removed.add(p)
        const children = nodes[p].childPaths
        if (children) for (const c of children) stack.push(c)
        delete nodes[p]
      }
      const filterChildren = (cp: string[] | null): string[] | null =>
        cp ? cp.filter((p) => !removed.has(p)) : cp
      for (const [p, n] of Object.entries(nodes)) {
        if (n.childPaths) {
          const next = filterChildren(n.childPaths)
          if (next !== n.childPaths) nodes[p] = { ...n, childPaths: next }
        }
      }
      const rootChildPaths = filterChildren(state.rootChildPaths)
      return { ...state, nodes, rootChildPaths }
    }
    default:
      return state
  }
}
