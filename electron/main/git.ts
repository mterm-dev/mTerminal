import { ipcMain } from 'electron'
import { execFile, type ExecFileOptions } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

export interface GitFile {
  path: string
  oldPath?: string
  indexStatus: string
  worktreeStatus: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
}

export interface GitStatus {
  isRepo: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  error?: string
}

interface RunOpts {
  cwd: string
  timeout?: number
  maxBuffer?: number
  input?: string
}

interface RunResult {
  stdout: string
  stderr: string
  code: number
}

const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
}

const DEFAULT_TIMEOUT = 30_000
const NETWORK_TIMEOUT = 60_000
const DIFF_MAX_BUFFER = 4 * 1024 * 1024

function runGit(args: string[], opts: RunOpts): Promise<RunResult> {
  return new Promise((resolve) => {
    const execOpts: ExecFileOptions = {
      cwd: opts.cwd,
      env: GIT_ENV,
      timeout: opts.timeout ?? DEFAULT_TIMEOUT,
      maxBuffer: opts.maxBuffer ?? 8 * 1024 * 1024,
      windowsHide: true,
    }
    const child = execFile('git', args, execOpts, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err
          ? 1
          : 0
      resolve({
        stdout: typeof stdout === 'string' ? stdout : stdout?.toString('utf8') ?? '',
        stderr: typeof stderr === 'string' ? stderr : stderr?.toString('utf8') ?? '',
        code,
      })
    })
    if (opts.input != null && child.stdin) {
      child.stdin.end(opts.input)
    }
  })
}

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const st = await fsp.stat(cwd)
    if (!st.isDirectory()) return false
  } catch {
    return false
  }
  const r = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd, timeout: 5_000 })
  return r.code === 0 && r.stdout.trim() === 'true'
}

function pathAfterFields(s: string, count: number): string {
  let idx = 0
  for (let n = 0; n < count; n++) {
    const sp = s.indexOf(' ', idx)
    if (sp < 0) return ''
    idx = sp + 1
  }
  return s.slice(idx)
}

function makeFile(xy: string, p: string): GitFile {
  const indexStatus = xy[0] ?? '.'
  const worktreeStatus = xy[1] ?? '.'
  return {
    path: p,
    indexStatus,
    worktreeStatus,
    staged: indexStatus !== '.' && indexStatus !== '?',
    unstaged: worktreeStatus !== '.' && worktreeStatus !== '?',
    untracked: false,
  }
}

export function parsePorcelainV2(stdout: string): Omit<GitStatus, 'isRepo' | 'error'> {
  const tokens = stdout.split('\0')
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  const files: GitFile[] = []

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue

    if (t.startsWith('# branch.head ')) {
      const v = t.slice('# branch.head '.length)
      branch = v === '(detached)' ? null : v
    } else if (t.startsWith('# branch.upstream ')) {
      upstream = t.slice('# branch.upstream '.length)
    } else if (t.startsWith('# branch.ab ')) {
      const m = t.match(/# branch\.ab \+(-?\d+) -(-?\d+)/)
      if (m) {
        ahead = parseInt(m[1], 10)
        behind = parseInt(m[2], 10)
      }
    } else if (t.startsWith('1 ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 7)
      if (p) files.push(makeFile(xy, p))
    } else if (t.startsWith('2 ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 8)
      const oldPath = tokens[i + 1] ?? ''
      i += 1
      if (p) files.push({ ...makeFile(xy, p), oldPath: oldPath || undefined })
    } else if (t.startsWith('u ')) {
      const rest = t.slice(2)
      const xy = rest.slice(0, 2)
      const p = pathAfterFields(rest, 9)
      if (p) files.push(makeFile(xy, p))
    } else if (t.startsWith('? ')) {
      const p = t.slice(2)
      files.push({
        path: p,
        indexStatus: '?',
        worktreeStatus: '?',
        staged: false,
        unstaged: true,
        untracked: true,
      })
    }
  }

  return { branch, upstream, ahead, behind, files }
}

async function readUntrackedAsDiff(cwd: string, relPath: string): Promise<{ text: string; truncated: boolean }> {
  const abs = path.join(cwd, relPath)
  try {
    const st = await fsp.stat(abs)
    if (st.size > DIFF_MAX_BUFFER) {
      return { text: '', truncated: true }
    }
    const buf = await fsp.readFile(abs)
    if (buf.includes(0)) {
      return { text: 'Binary file (untracked)\n', truncated: false }
    }
    const lines = buf.toString('utf8').split('\n')
    const header = `diff --git a/dev/null b/${relPath}\n--- /dev/null\n+++ b/${relPath}\n@@ -0,0 +1,${lines.length} @@\n`
    return { text: header + lines.map((l) => '+' + l).join('\n') + '\n', truncated: false }
  } catch (err) {
    return { text: `Could not read file: ${(err as Error).message}\n`, truncated: false }
  }
}

async function statusForCwd(cwd: string): Promise<GitStatus> {
  const repo = await isGitRepo(cwd)
  if (!repo) {
    return { isRepo: false, branch: null, upstream: null, ahead: 0, behind: 0, files: [] }
  }
  const r = await runGit(
    ['status', '--porcelain=v2', '--branch', '--untracked-files=all', '-z'],
    { cwd },
  )
  if (r.code !== 0) {
    return {
      isRepo: true,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      error: r.stderr.trim() || `git status exited with code ${r.code}`,
    }
  }
  const parsed = parsePorcelainV2(r.stdout)
  return { isRepo: true, ...parsed }
}

function ensurePathArray(paths: unknown): string[] {
  if (!Array.isArray(paths)) throw new Error('paths must be an array')
  const out: string[] = []
  for (const p of paths) {
    if (typeof p !== 'string' || p.length === 0) {
      throw new Error('paths must contain non-empty strings')
    }
    if (p.startsWith('-')) {
      throw new Error(`invalid path: ${p}`)
    }
    out.push(p)
  }
  return out
}

function ensureCwd(cwd: unknown): string {
  if (typeof cwd !== 'string' || cwd.length === 0) {
    throw new Error('cwd is required')
  }
  if (!fs.existsSync(cwd)) {
    throw new Error(`cwd does not exist: ${cwd}`)
  }
  return cwd
}

export async function gitStatus(cwd: string): Promise<GitStatus> {
  return statusForCwd(cwd)
}

export async function gitDiff(
  cwd: string,
  relPath: string,
  staged: boolean,
  context?: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const tracked = await runGit(['ls-files', '--error-unmatch', '--', relPath], { cwd, timeout: 5_000 })
  if (tracked.code !== 0) {
    return readUntrackedAsDiff(cwd, relPath)
  }
  const args = ['diff', '--no-color']
  if (typeof context === 'number' && Number.isFinite(context) && context >= 0) {
    args.push(`-U${Math.floor(context)}`)
  }
  if (staged) args.push('--cached')
  args.push('--', relPath)
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || `git diff exited with code ${r.code}`)
  }
  const truncated = r.stdout.length >= DIFF_MAX_BUFFER
  return { text: truncated ? r.stdout.slice(0, DIFF_MAX_BUFFER) : r.stdout, truncated }
}

export async function gitStage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const r = await runGit(['add', '--', ...paths], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git add failed')
}

export async function gitUnstage(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const headProbe = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd, timeout: 5_000 })
  if (headProbe.code === 0) {
    const r = await runGit(['reset', 'HEAD', '--', ...paths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git reset failed')
  } else {
    const r = await runGit(['rm', '--cached', '--', ...paths], { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git rm --cached failed')
  }
}

export async function gitCommit(
  cwd: string,
  message: string,
  paths?: string[],
): Promise<{ commit: string }> {
  if (!message || !message.trim()) throw new Error('commit message is empty')
  const args = ['commit', '-m', message]
  if (paths && paths.length > 0) {
    args.push('--', ...paths)
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git commit failed')
  }
  const head = await runGit(['rev-parse', 'HEAD'], { cwd, timeout: 5_000 })
  return { commit: head.stdout.trim() }
}

export async function gitPush(
  cwd: string,
  setUpstream: boolean,
): Promise<{ stdout: string; stderr: string }> {
  const args = ['push']
  if (setUpstream) {
    const branchRes = await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd, timeout: 5_000 })
    const branch = branchRes.stdout.trim()
    if (!branch) throw new Error('cannot determine current branch (detached HEAD?)')
    args.push('--set-upstream', 'origin', branch)
  }
  const r = await runGit(args, { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git push failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitPull(cwd: string): Promise<{ stdout: string; stderr: string }> {
  const r = await runGit(['pull', '--ff-only'], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git pull failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export async function gitFetch(cwd: string): Promise<{ stdout: string; stderr: string }> {
  const r = await runGit(['fetch'], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git fetch failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export function registerGitHandlers(): void {
  ipcMain.handle('git:status', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitStatus(cwd)
  })

  ipcMain.handle(
    'git:diff',
    async (_e, args: { cwd: string; path: string; staged: boolean; context?: number }) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      const ctx =
        typeof args.context === 'number' && Number.isFinite(args.context) && args.context >= 0
          ? Math.min(args.context, 1_000_000)
          : undefined
      return gitDiff(cwd, args.path, !!args.staged, ctx)
    },
  )

  ipcMain.handle('git:stage', async (_e, args: { cwd: string; paths: string[] }) => {
    const cwd = ensureCwd(args?.cwd)
    const paths = ensurePathArray(args?.paths)
    await gitStage(cwd, paths)
  })

  ipcMain.handle('git:unstage', async (_e, args: { cwd: string; paths: string[] }) => {
    const cwd = ensureCwd(args?.cwd)
    const paths = ensurePathArray(args?.paths)
    await gitUnstage(cwd, paths)
  })

  ipcMain.handle(
    'git:commit',
    async (_e, args: { cwd: string; message: string; paths?: string[] }) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.message !== 'string') throw new Error('message is required')
      const paths = args.paths ? ensurePathArray(args.paths) : undefined
      return gitCommit(cwd, args.message, paths)
    },
  )

  ipcMain.handle('git:push', async (_e, args: { cwd: string; setUpstream?: boolean }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitPush(cwd, !!args?.setUpstream)
  })

  ipcMain.handle('git:pull', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitPull(cwd)
  })

  ipcMain.handle('git:fetch', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitFetch(cwd)
  })
}
