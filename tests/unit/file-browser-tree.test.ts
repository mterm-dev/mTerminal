import { describe, expect, it } from 'vitest'
import { reduceTree } from '../../extensions/file-browser/src/shared/file-tree'
import {
  EMPTY_TREE,
  type FileEntry,
  type FileTreeState,
} from '../../extensions/file-browser/src/shared/types'

const mkEntry = (overrides: Partial<FileEntry> & Pick<FileEntry, 'name' | 'path' | 'kind'>): FileEntry => ({
  size: null,
  mtimeMs: null,
  isHidden: overrides.name.startsWith('.'),
  ...overrides,
})

describe('file-tree reducer', () => {
  it('set-root resets state', () => {
    const next = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/home/u' })
    expect(next.rootPath).toBe('/home/u')
    expect(next.nodes).toEqual({})
    expect(next.rootChildPaths).toBeNull()
  })

  it('set-root with same path is identity', () => {
    const s1 = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/x' })
    const s2 = reduceTree(s1, { type: 'set-root', rootPath: '/x' })
    expect(s2).toBe(s1)
  })

  it('set-entries at root sorts dirs first then alpha', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    const entries: FileEntry[] = [
      mkEntry({ name: 'zfile', path: '/r/zfile', kind: 'file' }),
      mkEntry({ name: 'bdir', path: '/r/bdir', kind: 'dir' }),
      mkEntry({ name: 'afile', path: '/r/afile', kind: 'file' }),
      mkEntry({ name: 'adir', path: '/r/adir', kind: 'dir' }),
    ]
    s = reduceTree(s, { type: 'set-entries', parentPath: null, entries })
    expect(s.rootChildPaths).toEqual(['/r/adir', '/r/bdir', '/r/afile', '/r/zfile'])
    expect(s.loadingRoot).toBe(false)
    expect(s.rootError).toBeNull()
  })

  it('set-entries on parent marks parent loaded+expanded', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [mkEntry({ name: 'd', path: '/r/d', kind: 'dir' })],
    })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: '/r/d',
      entries: [mkEntry({ name: 'f', path: '/r/d/f', kind: 'file' })],
    })
    expect(s.nodes['/r/d'].loaded).toBe(true)
    expect(s.nodes['/r/d'].expanded).toBe(true)
    expect(s.nodes['/r/d'].childPaths).toEqual(['/r/d/f'])
    expect(s.nodes['/r/d/f']).toBeDefined()
  })

  it('expand and collapse only flip the flag', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [mkEntry({ name: 'd', path: '/r/d', kind: 'dir' })],
    })
    expect(s.nodes['/r/d'].expanded).toBe(false)
    s = reduceTree(s, { type: 'expand', path: '/r/d' })
    expect(s.nodes['/r/d'].expanded).toBe(true)
    s = reduceTree(s, { type: 'collapse', path: '/r/d' })
    expect(s.nodes['/r/d'].expanded).toBe(false)
  })

  it('mark-error sets error and clears loading', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [mkEntry({ name: 'd', path: '/r/d', kind: 'dir' })],
    })
    s = reduceTree(s, { type: 'mark-loading', path: '/r/d', loading: true })
    expect(s.nodes['/r/d'].loading).toBe(true)
    s = reduceTree(s, { type: 'mark-error', path: '/r/d', error: 'boom' })
    expect(s.nodes['/r/d'].loading).toBe(false)
    expect(s.nodes['/r/d'].error).toBe('boom')
  })

  it('invalidate clears cached children of a node', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [mkEntry({ name: 'd', path: '/r/d', kind: 'dir' })],
    })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: '/r/d',
      entries: [mkEntry({ name: 'f', path: '/r/d/f', kind: 'file' })],
    })
    expect(s.nodes['/r/d'].loaded).toBe(true)
    s = reduceTree(s, { type: 'invalidate', path: '/r/d' })
    expect(s.nodes['/r/d'].loaded).toBe(false)
    expect(s.nodes['/r/d'].childPaths).toBeNull()
  })

  it('remove deletes node and its descendants', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [
        mkEntry({ name: 'd', path: '/r/d', kind: 'dir' }),
        mkEntry({ name: 'k', path: '/r/k', kind: 'file' }),
      ],
    })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: '/r/d',
      entries: [
        mkEntry({ name: 'a', path: '/r/d/a', kind: 'file' }),
        mkEntry({ name: 'b', path: '/r/d/b', kind: 'dir' }),
      ],
    })
    s = reduceTree(s, { type: 'remove', path: '/r/d' })
    expect(s.nodes['/r/d']).toBeUndefined()
    expect(s.nodes['/r/d/a']).toBeUndefined()
    expect(s.nodes['/r/d/b']).toBeUndefined()
    expect(s.nodes['/r/k']).toBeDefined()
    expect(s.rootChildPaths).toEqual(['/r/k'])
  })

  it('hidden filter is the caller responsibility (reducer keeps everything)', () => {
    let s: FileTreeState = reduceTree(EMPTY_TREE, { type: 'set-root', rootPath: '/r' })
    s = reduceTree(s, {
      type: 'set-entries',
      parentPath: null,
      entries: [
        mkEntry({ name: '.hidden', path: '/r/.hidden', kind: 'file' }),
        mkEntry({ name: 'visible', path: '/r/visible', kind: 'file' }),
      ],
    })
    expect(s.rootChildPaths).toContain('/r/.hidden')
    expect(s.nodes['/r/.hidden'].isHidden).toBe(true)
    expect(s.nodes['/r/visible'].isHidden).toBe(false)
  })
})
