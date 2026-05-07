import { describe, expect, it } from 'vitest'
import { computeCompactView } from '../../extensions/file-browser/src/lib/tree-compact'
import type { FileNode } from '../../extensions/file-browser/src/shared/types'

const mkDir = (path: string, name: string, childPaths: string[] | null, loaded = true): FileNode => ({
  path,
  name,
  kind: 'dir',
  isHidden: false,
  size: null,
  mtimeMs: null,
  expanded: true,
  loading: false,
  loaded,
  error: null,
  childPaths,
})

const mkFile = (path: string, name: string): FileNode => ({
  path,
  name,
  kind: 'file',
  isHidden: false,
  size: null,
  mtimeMs: null,
  expanded: false,
  loading: false,
  loaded: false,
  error: null,
  childPaths: null,
})

describe('computeCompactView', () => {
  it('compacts a chain a/b/c when each has a single dir child', () => {
    const a = mkDir('/a', 'a', ['/a/b'])
    const b = mkDir('/a/b', 'b', ['/a/b/c'])
    const c = mkDir('/a/b/c', 'c', ['/a/b/c/file.ts'])
    const f = mkFile('/a/b/c/file.ts', 'file.ts')
    const nodes = { '/a': a, '/a/b': b, '/a/b/c': c, '/a/b/c/file.ts': f }
    const view = computeCompactView(a, nodes)
    expect(view.displayName).toBe('a/b/c')
    expect(view.tail.path).toBe('/a/b/c')
    expect(view.togglePath).toBe('/a/b/c')
    expect(view.headPath).toBe('/a')
  })

  it('does not compact when folder has multiple children', () => {
    const a = mkDir('/a', 'a', ['/a/b', '/a/x'])
    const b = mkDir('/a/b', 'b', null)
    const x = mkDir('/a/x', 'x', null)
    const view = computeCompactView(a, { '/a': a, '/a/b': b, '/a/x': x })
    expect(view.displayName).toBe('a')
    expect(view.tail.path).toBe('/a')
  })

  it('does not compact past a folder whose child is a file', () => {
    const a = mkDir('/a', 'a', ['/a/file.ts'])
    const f = mkFile('/a/file.ts', 'file.ts')
    const view = computeCompactView(a, { '/a': a, '/a/file.ts': f })
    expect(view.displayName).toBe('a')
    expect(view.tail.path).toBe('/a')
  })

  it('does not compact when child is unloaded', () => {
    const a = mkDir('/a', 'a', ['/a/b'])
    const b = mkDir('/a/b', 'b', null, false)
    const view = computeCompactView(a, { '/a': a, '/a/b': b })
    expect(view.displayName).toBe('a')
    expect(view.tail.path).toBe('/a')
  })

  it('compacts partially when chain breaks mid-way', () => {
    const a = mkDir('/a', 'a', ['/a/b'])
    const b = mkDir('/a/b', 'b', ['/a/b/c1', '/a/b/c2'])
    const c1 = mkDir('/a/b/c1', 'c1', null)
    const c2 = mkDir('/a/b/c2', 'c2', null)
    const view = computeCompactView(a, {
      '/a': a,
      '/a/b': b,
      '/a/b/c1': c1,
      '/a/b/c2': c2,
    })
    expect(view.displayName).toBe('a/b')
    expect(view.tail.path).toBe('/a/b')
  })

  it('returns the file itself for non-dir nodes', () => {
    const f = mkFile('/x/y.ts', 'y.ts')
    const view = computeCompactView(f, { '/x/y.ts': f })
    expect(view.displayName).toBe('y.ts')
    expect(view.tail.path).toBe('/x/y.ts')
  })

  it('returns head as-is when dir is unloaded', () => {
    const a = mkDir('/a', 'a', null, false)
    const view = computeCompactView(a, { '/a': a })
    expect(view.displayName).toBe('a')
    expect(view.tail.path).toBe('/a')
  })
})
