import { describe, it, expect } from 'vitest'
import {
  buildTree,
  collectFilePaths,
  collectDirPaths,
  compactTree,
  dirCheckState,
} from '../../src/lib/git-tree'
import type { GitFile } from '../../src/hooks/useGitStatus'

function file(p: string): GitFile {
  return {
    path: p,
    indexStatus: '.',
    worktreeStatus: 'M',
    staged: false,
    unstaged: true,
    untracked: false,
  }
}

describe('git-tree', () => {
  it('buildTree returns root with no children for empty list', () => {
    const t = buildTree([])
    expect(t.children).toEqual([])
  })

  it('buildTree creates nested directory structure', () => {
    const t = buildTree([file('a/b/c.ts'), file('a/d.ts'), file('e.ts')])
    expect(t.children.map((c) => c.name)).toEqual(['a', 'e.ts'])
    const a = t.children.find((c) => c.name === 'a')!
    expect(a.isDir).toBe(true)
    expect(a.fullPath).toBe('a')
    expect(a.children.map((c) => c.name)).toEqual(['b', 'd.ts'])
    const b = a.children.find((c) => c.name === 'b')!
    expect(b.children).toHaveLength(1)
    expect(b.children[0]!.name).toBe('c.ts')
    expect(b.children[0]!.isDir).toBe(false)
    expect(b.children[0]!.file?.path).toBe('a/b/c.ts')
  })

  it('buildTree sorts directories before files alphabetically', () => {
    const t = buildTree([file('z.txt'), file('a/x.txt'), file('m.txt')])
    expect(t.children.map((c) => c.name)).toEqual(['a', 'm.txt', 'z.txt'])
  })

  it('collectFilePaths returns all leaf paths under a node', () => {
    const t = buildTree([file('a/b/c.ts'), file('a/d.ts'), file('e.ts')])
    const a = t.children.find((c) => c.name === 'a')!
    expect(collectFilePaths(a).sort()).toEqual(['a/b/c.ts', 'a/d.ts'])
  })

  it('collectDirPaths returns all directory paths in tree', () => {
    const t = buildTree([file('a/b/c.ts'), file('a/d.ts'), file('e.ts')])
    expect(collectDirPaths(t).sort()).toEqual(['a', 'a/b'])
  })

  it('dirCheckState returns unchecked when no files checked', () => {
    const t = buildTree([file('a/b.ts'), file('a/c.ts')])
    const a = t.children[0]!
    expect(dirCheckState(a, new Set())).toBe('unchecked')
  })

  it('dirCheckState returns checked when all files checked', () => {
    const t = buildTree([file('a/b.ts'), file('a/c.ts')])
    const a = t.children[0]!
    expect(dirCheckState(a, new Set(['a/b.ts', 'a/c.ts']))).toBe('checked')
  })

  it('dirCheckState returns indeterminate when only some files checked', () => {
    const t = buildTree([file('a/b.ts'), file('a/c.ts')])
    const a = t.children[0]!
    expect(dirCheckState(a, new Set(['a/b.ts']))).toBe('indeterminate')
  })

  it('buildTree handles paths with spaces', () => {
    const t = buildTree([file('my dir/some file.ts')])
    expect(t.children[0]!.name).toBe('my dir')
    expect(t.children[0]!.children[0]!.name).toBe('some file.ts')
  })

  it('compactTree merges single-child dir chains into one node', () => {
    const t = compactTree(buildTree([file('src/main/java/App.ts')]))
    expect(t.children).toHaveLength(1)
    const top = t.children[0]!
    expect(top.isDir).toBe(true)
    expect(top.name).toBe('src/main/java')
    expect(top.fullPath).toBe('src/main/java')
    expect(top.children).toHaveLength(1)
    expect(top.children[0]!.name).toBe('App.ts')
  })

  it('compactTree leaves divergent branches alone', () => {
    const t = compactTree(
      buildTree([file('src/main/a.ts'), file('src/main/b.ts')]),
    )
    const top = t.children[0]!
    expect(top.name).toBe('src/main')
    expect(top.children.map((c) => c.name).sort()).toEqual(['a.ts', 'b.ts'])
  })

  it('compactTree does not merge when dir contains a file at this level', () => {
    const t = compactTree(buildTree([file('a/b.ts'), file('a/c/d.ts')]))
    const a = t.children[0]!
    expect(a.name).toBe('a')
    expect(a.children.map((c) => c.name)).toEqual(['c', 'b.ts'])
  })
})
