import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  parsePorcelainV2,
  parseLogOutput,
  parseBranchOutput,
  parseShowOutput,
  isValidRefName,
} from '../../electron/main/git'

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

interface BranchResult {
  name: string
  isRemote: boolean
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
  lastCommitSha: string
  lastCommitSubject: string
  lastCommitAuthor: string
  lastCommitDate: number
}

interface LogResult {
  sha: string
  shortSha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  refs: string[]
}

interface CommitDetailResult {
  sha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  body: string
  files: Array<{ path: string; oldPath?: string; status: string }>
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

describe('isValidRefName', () => {
  it('accepts simple names', () => {
    expect(isValidRefName('main')).toBe(true)
    expect(isValidRefName('feature/foo')).toBe(true)
    expect(isValidRefName('release-1.2')).toBe(true)
  })

  it('rejects empty and leading/trailing/inner forbidden patterns', () => {
    expect(isValidRefName('')).toBe(false)
    expect(isValidRefName('-foo')).toBe(false)
    expect(isValidRefName('/foo')).toBe(false)
    expect(isValidRefName('foo/')).toBe(false)
    expect(isValidRefName('.foo')).toBe(false)
    expect(isValidRefName('foo.')).toBe(false)
    expect(isValidRefName('foo.lock')).toBe(false)
    expect(isValidRefName('foo..bar')).toBe(false)
    expect(isValidRefName('foo@{bar')).toBe(false)
    expect(isValidRefName('foo//bar')).toBe(false)
  })

  it('rejects forbidden chars and whitespace/control', () => {
    for (const ch of [' ', '~', '^', ':', '?', '*', '[', '\\']) {
      expect(isValidRefName(`foo${ch}bar`)).toBe(false)
    }
    expect(isValidRefName('foo\tbar')).toBe(false)
    expect(isValidRefName('foo\nbar')).toBe(false)
  })
})

describe('parseLogOutput', () => {
  it('returns empty for empty input', () => {
    expect(parseLogOutput('')).toEqual([])
  })

  it('parses one record with refs and multiple parents', () => {
    const rec =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\x00aaaaaaa\x00pp1 pp2\x00alice\x00a@x\x001700000000\x00HEAD -> main, origin/main\x00merge\x1e'
    const out = parseLogOutput(rec)
    expect(out).toHaveLength(1)
    expect(out[0].sha).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(out[0].parents).toEqual(['pp1', 'pp2'])
    expect(out[0].author).toBe('alice')
    expect(out[0].date).toBe(1700000000)
    expect(out[0].subject).toBe('merge')
    expect(out[0].refs).toEqual(['HEAD -> main', 'origin/main'])
  })

  it('parses commit without parents (root)', () => {
    const rec =
      'a'.repeat(40) + '\x00' + 'a'.repeat(7) + '\x00\x00bob\x00b@x\x001\x00\x00init\x1e'
    const out = parseLogOutput(rec)
    expect(out).toHaveLength(1)
    expect(out[0].parents).toEqual([])
    expect(out[0].refs).toEqual([])
  })
})

describe('parseShowOutput', () => {
  it('parses commit detail with file statuses', () => {
    const stdout =
      'a'.repeat(40) +
      '\x00' +
      'aaaaaaa' +
      '\x00bb\x00alice\x00a@x\x001700000000\x00subj\x00body line\x1eM\x00src/foo.ts\x00A\x00new.md\x00R\x00old/p\x00new/p\x00'
    const out = parseShowOutput(stdout)
    expect(out).not.toBeNull()
    expect(out!.subject).toBe('subj')
    expect(out!.body).toBe('body line')
    expect(out!.files).toEqual([
      { path: 'src/foo.ts', status: 'M' },
      { path: 'new.md', status: 'A' },
      { path: 'new/p', oldPath: 'old/p', status: 'R' },
    ])
  })
})

describe('parseBranchOutput', () => {
  it('parses local + remote', () => {
    const recLocal =
      'refs/heads/main\x00*\x00refs/remotes/origin/main\x00ahead 2\x00deadbeef\x00alice\x001700000000\x00subj-local\x1e'
    const recRemote =
      'refs/remotes/origin/main\x00 \x00\x00\x00deadbeef\x00alice\x001700000000\x00subj-remote\x1e'
    const out = parseBranchOutput(recLocal + recRemote)
    expect(out).toHaveLength(2)
    const local = out.find((b) => !b.isRemote)!
    expect(local.name).toBe('main')
    expect(local.isCurrent).toBe(true)
    expect(local.upstream).toBe('origin/main')
    expect(local.ahead).toBe(2)
    const remote = out.find((b) => b.isRemote)!
    expect(remote.name).toBe('origin/main')
    expect(remote.isCurrent).toBe(false)
  })

  it('skips refs/remotes/<remote>/HEAD', () => {
    const rec =
      'refs/remotes/origin/HEAD\x00 \x00\x00\x00d\x00a\x000\x00x\x1e'
    expect(parseBranchOutput(rec)).toEqual([])
  })
})

describe('git branches/log/checkout IPC', () => {
  let repo: string

  beforeEach(() => {
    repo = freshTmpDir('git-br')
  })

  afterEach(() => {
    try {
      fs.rmSync(repo, { recursive: true, force: true })
    } catch {}
  })

  it(
    'git:branches lists local branches and current marker',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      git(repo, 'branch', 'feat')
      await loadModule()
      const out = (await invoke('git:branches', { cwd: repo })) as BranchResult[]
      const main = out.find((b) => b.name === 'main')!
      const feat = out.find((b) => b.name === 'feat')!
      expect(main.isCurrent).toBe(true)
      expect(feat.isCurrent).toBe(false)
      expect(main.lastCommitSha).toMatch(/^[0-9a-f]{40}$/)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:log returns commits in reverse chronological order with parents',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'one', '--quiet')
      fs.writeFileSync(path.join(repo, 'a.txt'), '2\n')
      git(repo, 'commit', '-am', 'two', '--quiet')
      await loadModule()
      const out = (await invoke('git:log', { cwd: repo, limit: 10 })) as LogResult[]
      expect(out).toHaveLength(2)
      expect(out[0].subject).toBe('two')
      expect(out[1].subject).toBe('one')
      expect(out[0].parents).toEqual([out[1].sha])
      expect(out[1].parents).toEqual([])
    },
    TEST_TIMEOUT,
  )

  it(
    'git:show returns files changed in a commit',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      fs.writeFileSync(path.join(repo, 'b.txt'), 'x\n')
      git(repo, 'add', 'b.txt')
      git(repo, 'commit', '-m', 'add b', '--quiet')
      const sha = git(repo, 'rev-parse', 'HEAD').trim()
      await loadModule()
      const detail = (await invoke('git:show', { cwd: repo, sha })) as CommitDetailResult
      expect(detail.subject).toBe('add b')
      expect(detail.files.map((f) => f.path)).toContain('b.txt')
    },
    TEST_TIMEOUT,
  )

  it(
    'git:checkout switches branches',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      git(repo, 'branch', 'feat')
      await loadModule()
      await invoke('git:checkout', { cwd: repo, ref: 'feat' })
      const head = git(repo, 'symbolic-ref', '--short', 'HEAD').trim()
      expect(head).toBe('feat')
    },
    TEST_TIMEOUT,
  )

  it(
    'git:branch-create creates a new branch and rejects invalid names',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      await loadModule()
      await invoke('git:branch-create', { cwd: repo, name: 'foo' })
      const branches = git(repo, 'branch', '--list').split('\n')
      expect(branches.some((l) => l.includes('foo'))).toBe(true)
      await expect(
        invoke('git:branch-create', { cwd: repo, name: 'bad name' }),
      ).rejects.toThrow(/invalid ref name/)
      await expect(
        invoke('git:branch-create', { cwd: repo, name: '-evil' }),
      ).rejects.toThrow(/invalid ref name/)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:branch-rename renames an existing branch',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      git(repo, 'branch', 'old')
      await loadModule()
      await invoke('git:branch-rename', {
        cwd: repo,
        oldName: 'old',
        newName: 'newer',
      })
      const branches = git(repo, 'branch', '--list').split('\n')
      expect(branches.some((l) => l.includes('newer'))).toBe(true)
      expect(branches.some((l) => /\bold\b/.test(l))).toBe(false)
    },
    TEST_TIMEOUT,
  )

  it(
    'git:branch-delete deletes branch (and rejects current branch without force)',
    async () => {
      initRepo(repo)
      fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
      git(repo, 'add', 'a.txt')
      git(repo, 'commit', '-m', 'first', '--quiet')
      git(repo, 'branch', 'tmp')
      await loadModule()
      await invoke('git:branch-delete', { cwd: repo, name: 'tmp' })
      const branches = git(repo, 'branch', '--list').split('\n')
      expect(branches.some((l) => l.includes('tmp'))).toBe(false)
      await expect(
        invoke('git:branch-delete', { cwd: repo, name: 'main' }),
      ).rejects.toThrow()
    },
    TEST_TIMEOUT,
  )

  it(
    'git:incoming returns commits from upstream not yet local',
    async () => {
      const upstream = freshTmpDir('git-up')
      const other = freshTmpDir('git-other')
      try {
        execFileSync('git', ['init', '--bare', '--initial-branch=main', '--quiet'], {
          cwd: upstream,
        })
        initRepo(repo)
        fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
        git(repo, 'add', 'a.txt')
        git(repo, 'commit', '-m', 'first', '--quiet')
        git(repo, 'remote', 'add', 'origin', upstream)
        git(repo, 'push', '-u', 'origin', 'main', '--quiet')

        execFileSync('git', ['clone', '--quiet', upstream, other])
        execFileSync('git', ['config', 'user.email', 'o@x'], { cwd: other })
        execFileSync('git', ['config', 'user.name', 'O'], { cwd: other })
        execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: other })
        fs.writeFileSync(path.join(other, 'b.txt'), 'b\n')
        execFileSync('git', ['add', 'b.txt'], { cwd: other })
        execFileSync('git', ['commit', '-m', 'remote-side', '--quiet'], { cwd: other })
        execFileSync('git', ['push', '--quiet'], { cwd: other })

        git(repo, 'fetch', '--quiet')
        await loadModule()
        const incoming = (await invoke('git:incoming', { cwd: repo })) as LogResult[]
        expect(incoming.length).toBe(1)
        expect(incoming[0].subject).toBe('remote-side')
      } finally {
        try {
          fs.rmSync(upstream, { recursive: true, force: true })
        } catch {}
        try {
          fs.rmSync(other, { recursive: true, force: true })
        } catch {}
      }
    },
    TEST_TIMEOUT,
  )

  it(
    'git:outgoing returns local-only commits',
    async () => {
      const upstream = freshTmpDir('git-up')
      try {
        execFileSync('git', ['init', '--bare', '--initial-branch=main', '--quiet'], {
          cwd: upstream,
        })
        initRepo(repo)
        fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
        git(repo, 'add', 'a.txt')
        git(repo, 'commit', '-m', 'first', '--quiet')
        git(repo, 'remote', 'add', 'origin', upstream)
        git(repo, 'push', '-u', 'origin', 'main', '--quiet')
        fs.writeFileSync(path.join(repo, 'a.txt'), '2\n')
        git(repo, 'commit', '-am', 'second', '--quiet')
        await loadModule()
        const out = (await invoke('git:outgoing', { cwd: repo })) as LogResult[]
        expect(out.length).toBe(1)
        expect(out[0].subject).toBe('second')
      } finally {
        try {
          fs.rmSync(upstream, { recursive: true, force: true })
        } catch {}
      }
    },
    TEST_TIMEOUT,
  )

  it(
    'git:pull-strategy ff-only fast-forwards when possible',
    async () => {
      const upstream = freshTmpDir('git-up')
      const other = freshTmpDir('git-other')
      try {
        execFileSync('git', ['init', '--bare', '--initial-branch=main', '--quiet'], {
          cwd: upstream,
        })
        initRepo(repo)
        fs.writeFileSync(path.join(repo, 'a.txt'), '1\n')
        git(repo, 'add', 'a.txt')
        git(repo, 'commit', '-m', 'first', '--quiet')
        git(repo, 'remote', 'add', 'origin', upstream)
        git(repo, 'push', '-u', 'origin', 'main', '--quiet')

        execFileSync('git', ['clone', '--quiet', upstream, other])
        execFileSync('git', ['config', 'user.email', 'o@x'], { cwd: other })
        execFileSync('git', ['config', 'user.name', 'O'], { cwd: other })
        execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: other })
        fs.writeFileSync(path.join(other, 'b.txt'), 'b\n')
        execFileSync('git', ['add', 'b.txt'], { cwd: other })
        execFileSync('git', ['commit', '-m', 'remote-side', '--quiet'], { cwd: other })
        execFileSync('git', ['push', '--quiet'], { cwd: other })

        git(repo, 'fetch', '--quiet')
        await loadModule()
        await invoke('git:pull-strategy', { cwd: repo, strategy: 'ff-only' })
        const head = git(repo, 'log', '-1', '--format=%s').trim()
        expect(head).toBe('remote-side')
      } finally {
        try {
          fs.rmSync(upstream, { recursive: true, force: true })
        } catch {}
        try {
          fs.rmSync(other, { recursive: true, force: true })
        } catch {}
      }
    },
    TEST_TIMEOUT,
  )
})
