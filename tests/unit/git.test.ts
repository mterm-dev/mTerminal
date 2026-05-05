import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { parsePorcelainV2 } from '../../electron/main/git'

const TEST_TIMEOUT = 30000

let currentInvoke: (channel: string, ...args: unknown[]) => unknown = () => {
  throw new Error('mock not loaded yet')
}

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await currentInvoke(channel, ...args)
}

function freshTmpDir(prefix: string): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-${prefix}-test-${process.pid}-${crypto.randomUUID()}`,
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function initRepo(cwd: string): void {
  git(cwd, 'init', '--initial-branch=main', '--quiet')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Test')
  git(cwd, 'config', 'commit.gpgsign', 'false')
}

async function loadModule() {
  const { vi } = await import('vitest')
  vi.resetModules()
  const electronMock = (await import('../mocks/electron')) as {
    __invoke: (channel: string, ...args: unknown[]) => unknown
    __reset: () => void
  }
  electronMock.__reset()
  currentInvoke = electronMock.__invoke
  const mod = await import('../../electron/main/git')
  mod.registerGitHandlers()
  return mod
}

interface StatusResult {
  isRepo: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: Array<{
    path: string
    oldPath?: string
    indexStatus: string
    worktreeStatus: string
    staged: boolean
    unstaged: boolean
    untracked: boolean
  }>
  error?: string
}

describe('parsePorcelainV2', () => {
  it('parses branch header with upstream and ahead/behind', () => {
    const stdout =
      '# branch.oid abcdef\0' +
      '# branch.head main\0' +
      '# branch.upstream origin/main\0' +
      '# branch.ab +2 -1\0'
    const r = parsePorcelainV2(stdout)
    expect(r.branch).toBe('main')
    expect(r.upstream).toBe('origin/main')
    expect(r.ahead).toBe(2)
    expect(r.behind).toBe(1)
    expect(r.files).toEqual([])
  })

  it('parses detached HEAD as null branch', () => {
    const stdout = '# branch.head (detached)\0'
    const r = parsePorcelainV2(stdout)
    expect(r.branch).toBeNull()
  })

  it('parses a modified-in-worktree changed entry', () => {
    const stdout =
      '# branch.head main\0' +
      '1 .M N... 100644 100644 100644 abc def src/foo.ts\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatchObject({
      path: 'src/foo.ts',
      indexStatus: '.',
      worktreeStatus: 'M',
      staged: false,
      unstaged: true,
      untracked: false,
    })
  })

  it('parses a staged-add entry', () => {
    const stdout = '1 A. N... 100644 100644 100644 0000 abcd new.txt\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatchObject({
      path: 'new.txt',
      indexStatus: 'A',
      worktreeStatus: '.',
      staged: true,
      unstaged: false,
    })
  })

  it('parses an untracked entry', () => {
    const stdout = '? other.md\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatchObject({
      path: 'other.md',
      untracked: true,
      staged: false,
    })
  })

  it('parses a renamed entry with old path', () => {
    const stdout =
      '2 R. N... 100644 100644 100644 abc def R100 dst.ts\0src.ts\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]).toMatchObject({
      path: 'dst.ts',
      oldPath: 'src.ts',
      indexStatus: 'R',
    })
  })

  it('parses a path with spaces', () => {
    const stdout = '1 .M N... 100644 100644 100644 abc def my dir/file with spaces.txt\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files[0]?.path).toBe('my dir/file with spaces.txt')
  })

  it('parses an unmerged entry', () => {
    const stdout = 'u UU N... 100644 100644 100644 100644 a b c conflict.md\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]?.path).toBe('conflict.md')
    expect(r.files[0]?.indexStatus).toBe('U')
  })

  it('returns empty for clean repo header-only output', () => {
    const stdout = '# branch.head main\0'
    const r = parsePorcelainV2(stdout)
    expect(r.files).toEqual([])
    expect(r.branch).toBe('main')
  })
})

describe('git IPC handlers', () => {
  let repo: string

  beforeEach(() => {
    repo = freshTmpDir('git')
  })

  afterEach(() => {
    try {
      fs.rmSync(repo, { recursive: true, force: true })
    } catch {}
  })

  it(
    'git:status returns isRepo=false for non-git dir',
    async () => {
      await loadModule()
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      expect(r.isRepo).toBe(false)
      expect(r.files).toEqual([])
    },
    TEST_TIMEOUT,
  )

  it(
    'git:status detects branch and untracked files in fresh repo',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
      await loadModule()
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      expect(r.isRepo).toBe(true)
      expect(r.branch).toBe('main')
      expect(r.files).toHaveLength(1)
      expect(r.files[0]?.path).toBe('a.txt')
      expect(r.files[0]?.untracked).toBe(true)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:status expands untracked directories into individual file entries',
    async () => {
      initRepo(repo)
      const sub = path.join(repo, 'newdir', 'nested')
      fs.mkdirSync(sub, { recursive: true })
      fs.writeFileSync(path.join(repo, 'newdir', 'a.txt'), 'a\n')
      fs.writeFileSync(path.join(repo, 'newdir', 'b.txt'), 'b\n')
      fs.writeFileSync(path.join(sub, 'c.txt'), 'c\n')
      await loadModule()
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      const paths = r.files.map((f) => f.path).sort()
      expect(paths).toEqual([
        'newdir/a.txt',
        'newdir/b.txt',
        'newdir/nested/c.txt',
      ])
      expect(r.files.every((f) => f.untracked)).toBe(true)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:stage moves file from untracked to staged',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
      await loadModule()
      await invoke('git:stage', { cwd: repo, paths: ['a.txt'] })
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      expect(r.files).toHaveLength(1)
      expect(r.files[0]?.staged).toBe(true)
      expect(r.files[0]?.untracked).toBe(false)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:unstage on a fresh repo (no HEAD) moves staged file back to untracked',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
      await loadModule()
      await invoke('git:stage', { cwd: repo, paths: ['a.txt'] })
      await invoke('git:unstage', { cwd: repo, paths: ['a.txt'] })
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      expect(r.files[0]?.untracked).toBe(true)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:commit creates a commit and clears the file from status',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
      await loadModule()
      await invoke('git:stage', { cwd: repo, paths: ['a.txt'] })
      const cm = (await invoke('git:commit', {
        cwd: repo,
        message: 'first',
        paths: ['a.txt'],
      })) as { commit: string }
      expect(cm.commit).toMatch(/^[0-9a-f]{40}$/)
      const r = (await invoke('git:status', { cwd: repo })) as StatusResult
      expect(r.files).toEqual([])
    },
    TEST_TIMEOUT,
  )

  it(
    'git:commit rejects empty message',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'hi\n')
      await loadModule()
      await invoke('git:stage', { cwd: repo, paths: ['a.txt'] })
      await expect(
        invoke('git:commit', { cwd: repo, message: '   ', paths: ['a.txt'] }),
      ).rejects.toThrow(/empty/)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:diff returns a diff for a tracked modified file',
    async () => {
      initRepo(repo)
      const file = path.join(repo, 'a.txt')
      fs.writeFileSync(file, 'one\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      fs.writeFileSync(file, 'one\ntwo\n')
      await loadModule()
      const d = (await invoke('git:diff', {
        cwd: repo,
        path: 'a.txt',
        staged: false,
      })) as { text: string; truncated: boolean }
      expect(d.text).toContain('+two')
      expect(d.truncated).toBe(false)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:diff with full context includes untouched lines outside the change',
    async () => {
      initRepo(repo)
      const file = path.join(repo, 'a.txt')
      const original = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n') + '\n'
      fs.writeFileSync(file, original)
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      const modified = original.replace('line10', 'line10-CHANGED')
      fs.writeFileSync(file, modified)
      await loadModule()

      const small = (await invoke('git:diff', {
        cwd: repo,
        path: 'a.txt',
        staged: false,
      })) as { text: string }
      expect(small.text).not.toContain(' line1\n')
      expect(small.text).not.toContain(' line20')

      const full = (await invoke('git:diff', {
        cwd: repo,
        path: 'a.txt',
        staged: false,
        context: 999_999,
      })) as { text: string }
      expect(full.text).toContain(' line1\n')
      expect(full.text).toContain(' line20')
      expect(full.text).toContain('+line10-CHANGED')
    },
    TEST_TIMEOUT,
  )

  it(
    'git:diff for an untracked file synthesizes an additions-only diff',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'new.md'), 'hello\nworld\n')
      await loadModule()
      const d = (await invoke('git:diff', {
        cwd: repo,
        path: 'new.md',
        staged: false,
      })) as { text: string; truncated: boolean }
      expect(d.text).toContain('+hello')
      expect(d.text).toContain('+world')
    },
    TEST_TIMEOUT,
  )

  it(
    'git:stage rejects path arguments that look like flags',
    async () => {
      initRepo(repo)
      await loadModule()
      await expect(
        invoke('git:stage', { cwd: repo, paths: ['--force'] }),
      ).rejects.toThrow(/invalid path/)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:status surfaces ahead/behind when an upstream exists',
    async () => {
      const upstream = freshTmpDir('git-up')
      try {
        execFileSync('git', ['init', '--bare', '--initial-branch=main', '--quiet'], {
          cwd: upstream,
        })
        initRepo(repo)
        fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n')
        git(repo, 'add', 'a.txt')
        git(repo, 'commit', '-m', 'first', '--quiet')
        git(repo, 'remote', 'add', 'origin', upstream)
        git(repo, 'push', '-u', 'origin', 'main', '--quiet')
        fs.writeFileSync(path.join(repo, 'a.txt'), 'one\ntwo\n')
        git(repo, 'commit', '-am', 'second', '--quiet')
        await loadModule()
        const r = (await invoke('git:status', { cwd: repo })) as StatusResult
        expect(r.upstream).toBe('origin/main')
        expect(r.ahead).toBe(1)
        expect(r.behind).toBe(0)
      } finally {
        try {
          fs.rmSync(upstream, { recursive: true, force: true })
        } catch {}
      }
    },
    TEST_TIMEOUT,
  )
})
