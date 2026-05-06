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

export interface GitBranch {
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

export interface GitLogEntry {
  sha: string
  shortSha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  refs: string[]
}

export interface GitCommitFile {
  path: string
  oldPath?: string
  status: string
}

export interface GitCommitDetail {
  sha: string
  parents: string[]
  author: string
  authorEmail: string
  date: number
  subject: string
  body: string
  files: GitCommitFile[]
}

export type GitPullStrategyOption = 'ff-only' | 'merge' | 'rebase'

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

export function isValidRefName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false
  if (name.startsWith('-')) return false
  if (name.startsWith('/') || name.endsWith('/')) return false
  if (name.startsWith('.') || name.endsWith('.')) return false
  if (name.endsWith('.lock')) return false
  if (name.includes('..')) return false
  if (name.includes('@{')) return false
  if (name.includes('//')) return false
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return false
    const ch = name[i]
    if (ch === ' ' || ch === '~' || ch === '^' || ch === ':' ||
        ch === '?' || ch === '*' || ch === '[' || ch === '\\') return false
  }
  return true
}

function ensureRefName(name: unknown): string {
  if (typeof name !== 'string') throw new Error('ref name must be a string')
  if (!isValidRefName(name)) throw new Error(`invalid ref name: ${name}`)
  return name
}

function ensureSafeRef(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new Error('ref must be a non-empty string')
  }
  if (ref.startsWith('-')) throw new Error(`invalid ref: ${ref}`)
  for (let i = 0; i < ref.length; i++) {
    const code = ref.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) throw new Error(`invalid ref: ${ref}`)
  }
  return ref
}

const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%D%x00%s'
const LOG_RECORD_SEP = '\x1e'

function parseRefs(decorate: string): string[] {
  if (!decorate) return []
  return decorate
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function parseLogOutput(stdout: string): GitLogEntry[] {
  if (!stdout) return []
  const records = stdout.split(LOG_RECORD_SEP)
  const out: GitLogEntry[] = []
  for (const rec of records) {
    if (!rec) continue
    const trimmed = rec.startsWith('\n') ? rec.slice(1) : rec
    if (!trimmed) continue
    const parts = trimmed.split('\x00')
    if (parts.length < 8) continue
    const sha = parts[0]
    if (!sha || sha.length < 7) continue
    const parentsRaw = parts[2].trim()
    out.push({
      sha,
      shortSha: parts[1],
      parents: parentsRaw ? parentsRaw.split(/\s+/).filter((s) => s.length > 0) : [],
      author: parts[3],
      authorEmail: parts[4],
      date: Number(parts[5]) || 0,
      subject: parts[7],
      refs: parseRefs(parts[6]),
    })
  }
  return out
}

const BRANCH_FORMAT = [
  '%(refname)',
  '%(HEAD)',
  '%(upstream)',
  '%(upstream:track,nobracket)',
  '%(objectname)',
  '%(authorname)',
  '%(authordate:unix)',
  '%(contents:subject)',
].join('%00')
const BRANCH_RECORD_SEP = '\x1e'

interface ParsedTrack {
  ahead: number
  behind: number
}

function parseTrack(track: string): ParsedTrack {
  if (!track) return { ahead: 0, behind: 0 }
  let ahead = 0
  let behind = 0
  const aheadMatch = track.match(/ahead (\d+)/)
  if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)
  const behindMatch = track.match(/behind (\d+)/)
  if (behindMatch) behind = parseInt(behindMatch[1], 10)
  return { ahead, behind }
}

function shortRefName(refname: string): { name: string; isRemote: boolean } | null {
  if (refname.startsWith('refs/heads/')) {
    return { name: refname.slice('refs/heads/'.length), isRemote: false }
  }
  if (refname.startsWith('refs/remotes/')) {
    const rest = refname.slice('refs/remotes/'.length)
    if (rest.endsWith('/HEAD')) return null
    return { name: rest, isRemote: true }
  }
  return null
}

export function parseBranchOutput(stdout: string): GitBranch[] {
  if (!stdout) return []
  const records = stdout.split(BRANCH_RECORD_SEP)
  const out: GitBranch[] = []
  for (const rec of records) {
    if (!rec) continue
    const trimmed = rec.startsWith('\n') ? rec.slice(1) : rec
    if (!trimmed) continue
    const parts = trimmed.split('\x00')
    if (parts.length < 8) continue
    const ref = shortRefName(parts[0])
    if (!ref) continue
    const upstream = parts[2]
      ? parts[2].startsWith('refs/remotes/')
        ? parts[2].slice('refs/remotes/'.length)
        : parts[2]
      : null
    const { ahead, behind } = parseTrack(parts[3])
    out.push({
      name: ref.name,
      isRemote: ref.isRemote,
      isCurrent: parts[1] === '*',
      upstream: ref.isRemote ? null : upstream,
      ahead,
      behind,
      lastCommitSha: parts[4],
      lastCommitAuthor: parts[5],
      lastCommitDate: Number(parts[6]) || 0,
      lastCommitSubject: parts[7],
    })
  }
  return out
}

export async function gitListBranches(cwd: string): Promise<GitBranch[]> {
  const r = await runGit(
    [
      'for-each-ref',
      `--format=${BRANCH_FORMAT}${BRANCH_RECORD_SEP}`,
      'refs/heads',
      'refs/remotes',
    ],
    { cwd },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git for-each-ref failed')
  return parseBranchOutput(r.stdout)
}

export interface CheckoutOptions {
  createNew?: boolean
  newName?: string
}

export async function gitCheckout(
  cwd: string,
  ref: string,
  opts: CheckoutOptions = {},
): Promise<void> {
  ensureSafeRef(ref)
  const args: string[] = ['checkout']
  if (opts.createNew) {
    if (!opts.newName) throw new Error('newName required when createNew is true')
    ensureRefName(opts.newName)
    args.push('-b', opts.newName, ref)
  } else if (ref.includes('/') && !opts.newName) {
    const localName = ref.split('/').slice(1).join('/')
    if (localName && isValidRefName(localName)) {
      args.push('--track', '-b', localName, ref)
    } else {
      args.push(ref)
    }
  } else {
    args.push(ref)
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git checkout failed')
}

export async function gitBranchCreate(
  cwd: string,
  name: string,
  fromRef?: string,
  checkout?: boolean,
): Promise<void> {
  ensureRefName(name)
  if (fromRef !== undefined) ensureSafeRef(fromRef)
  if (checkout) {
    const args = ['checkout', '-b', name]
    if (fromRef) args.push(fromRef)
    const r = await runGit(args, { cwd })
    if (r.code !== 0) throw new Error(r.stderr.trim() || 'git checkout -b failed')
    return
  }
  const args = ['branch', name]
  if (fromRef) args.push(fromRef)
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch failed')
}

export async function gitBranchDelete(
  cwd: string,
  name: string,
  force: boolean,
): Promise<void> {
  ensureRefName(name)
  const r = await runGit(['branch', force ? '-D' : '-d', name], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch -d failed')
}

export async function gitBranchDeleteRemote(
  cwd: string,
  remote: string,
  name: string,
): Promise<void> {
  ensureRefName(name)
  if (!remote || remote.startsWith('-')) throw new Error(`invalid remote: ${remote}`)
  const r = await runGit(['push', remote, '--delete', name], {
    cwd,
    timeout: NETWORK_TIMEOUT,
  })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git push --delete failed')
}

export async function gitBranchRename(
  cwd: string,
  oldName: string,
  newName: string,
): Promise<void> {
  ensureRefName(oldName)
  ensureRefName(newName)
  const r = await runGit(['branch', '-m', oldName, newName], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git branch -m failed')
}

export interface LogOptions {
  ref?: string
  limit?: number
  skip?: number
  all?: boolean
}

export async function gitLog(
  cwd: string,
  opts: LogOptions = {},
): Promise<GitLogEntry[]> {
  const limit = Math.max(1, Math.min(2000, opts.limit ?? 200))
  const skip = Math.max(0, opts.skip ?? 0)
  const args = [
    'log',
    `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
    '--decorate=short',
    `--max-count=${limit}`,
  ]
  if (skip > 0) args.push(`--skip=${skip}`)
  if (opts.all) args.push('--all')
  if (opts.ref) {
    ensureSafeRef(opts.ref)
    args.push(opts.ref)
  }
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/does not have any commits|unknown revision|bad revision|ambiguous argument/i.test(msg)) {
      return []
    }
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export function parseShowOutput(stdout: string): GitCommitDetail | null {
  if (!stdout) return null
  const sepIdx = stdout.indexOf('\x1e')
  if (sepIdx < 0) return null
  const headerPart = stdout.slice(0, sepIdx)
  let filesPart = stdout.slice(sepIdx + 1)
  while (filesPart.length > 0 && (filesPart[0] === '\x00' || filesPart[0] === '\n')) {
    filesPart = filesPart.slice(1)
  }
  const parts = headerPart.split('\x00')
  if (parts.length < 8) return null
  const sha = parts[0]
  if (!sha) return null
  const parentsRaw = parts[2].trim()
  const subject = parts[6]
  const body = parts[7] ?? ''
  const files: GitCommitFile[] = []
  const tokens = filesPart.split('\x00')
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (!t) continue
    if (t.startsWith('R') || t.startsWith('C')) {
      const oldPath = tokens[i + 1] ?? ''
      const newPath = tokens[i + 2] ?? ''
      i += 2
      if (newPath) files.push({ path: newPath, oldPath, status: t[0] })
    } else if (t.length === 1 && /[A-Z]/.test(t)) {
      const p = tokens[i + 1] ?? ''
      i += 1
      if (p) files.push({ path: p, status: t })
    }
  }
  return {
    sha,
    parents: parentsRaw ? parentsRaw.split(/\s+/).filter((s) => s.length > 0) : [],
    author: parts[3],
    authorEmail: parts[4],
    date: Number(parts[5]) || 0,
    subject,
    body,
    files,
  }
}

export async function gitShow(cwd: string, sha: string): Promise<GitCommitDetail> {
  ensureSafeRef(sha)
  const fmt = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%b%x1e'
  const r = await runGit(
    ['log', '-1', '--name-status', '-z', `--format=${fmt}`, sha],
    { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 },
  )
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git show failed')
  const parsed = parseShowOutput(r.stdout)
  if (!parsed) throw new Error('failed to parse commit')
  return parsed
}

export async function gitDiffCommit(
  cwd: string,
  sha: string,
  relPath: string,
  context?: number,
): Promise<{ text: string; truncated: boolean }> {
  ensureSafeRef(sha)
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const args = ['show', '--no-color']
  if (typeof context === 'number' && Number.isFinite(context) && context >= 0) {
    args.push(`-U${Math.floor(context)}`)
  }
  args.push('--format=', sha, '--', relPath)
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0 && !r.stdout) {
    throw new Error(r.stderr.trim() || `git show exited with code ${r.code}`)
  }
  const truncated = r.stdout.length >= DIFF_MAX_BUFFER
  return { text: truncated ? r.stdout.slice(0, DIFF_MAX_BUFFER) : r.stdout, truncated }
}

export async function gitIncoming(cwd: string): Promise<GitLogEntry[]> {
  const upstreamProbe = await runGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd, timeout: 5_000 },
  )
  if (upstreamProbe.code !== 0) return []
  const r = await runGit(
    [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      'HEAD..@{u}',
    ],
    { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 },
  )
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/unknown revision|bad revision/i.test(msg)) return []
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export async function gitOutgoing(cwd: string): Promise<GitLogEntry[]> {
  const upstreamProbe = await runGit(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { cwd, timeout: 5_000 },
  )
  let args: string[]
  if (upstreamProbe.code === 0) {
    args = [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      '@{u}..HEAD',
    ]
  } else {
    args = [
      'log',
      `--pretty=format:${LOG_FORMAT}${LOG_RECORD_SEP}`,
      '--decorate=short',
      '--max-count=200',
      'HEAD',
      '--not',
      '--remotes',
    ]
  }
  const r = await runGit(args, { cwd, maxBuffer: DIFF_MAX_BUFFER + 1024 })
  if (r.code !== 0) {
    const msg = r.stderr.trim() || `git log exited with code ${r.code}`
    if (/unknown revision|bad revision|does not have any commits/i.test(msg)) return []
    throw new Error(msg)
  }
  return parseLogOutput(r.stdout)
}

export async function gitPullStrategy(
  cwd: string,
  strategy: GitPullStrategyOption,
): Promise<{ stdout: string; stderr: string }> {
  let flag: string
  if (strategy === 'ff-only') flag = '--ff-only'
  else if (strategy === 'merge') flag = '--no-rebase'
  else if (strategy === 'rebase') flag = '--rebase'
  else throw new Error(`invalid strategy: ${strategy}`)
  const r = await runGit(['pull', flag], { cwd, timeout: NETWORK_TIMEOUT })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git pull failed')
  }
  return { stdout: r.stdout, stderr: r.stderr }
}

export function isLocalChangesPullConflict(message: string): boolean {
  if (typeof message !== 'string' || message.length === 0) return false
  if (/would be overwritten by (merge|checkout|reset)/i.test(message)) return true
  if (/please commit your changes or stash them before/i.test(message)) return true
  if (/please move or remove them before/i.test(message)) return true
  return false
}

export async function gitStash(
  cwd: string,
  message?: string,
): Promise<{ created: boolean; stdout: string }> {
  const args = ['stash', 'push', '--include-untracked']
  if (typeof message === 'string' && message.trim().length > 0) {
    args.push('-m', message.trim())
  }
  const r = await runGit(args, { cwd })
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || 'git stash failed')
  }
  const created = !/No local changes to save/i.test(r.stdout + r.stderr)
  return { created, stdout: r.stdout }
}

export async function gitStashPop(
  cwd: string,
): Promise<{ stdout: string; stderr: string; conflict: boolean }> {
  const r = await runGit(['stash', 'pop'], { cwd })
  if (r.code !== 0) {
    const text = (r.stderr + r.stdout).trim()
    if (/conflict/i.test(text)) {
      return { stdout: r.stdout, stderr: r.stderr, conflict: true }
    }
    throw new Error(text || 'git stash pop failed')
  }
  const conflict = /CONFLICT/.test(r.stdout) || /CONFLICT/.test(r.stderr)
  return { stdout: r.stdout, stderr: r.stderr, conflict }
}

export type ConflictSegment =
  | { kind: 'common'; lines: string[] }
  | {
      kind: 'conflict'
      id: number
      ours: string[]
      theirs: string[]
      base?: string[]
      labelOurs?: string
      labelTheirs?: string
      labelBase?: string
    }

const MARKER_OURS = /^<{7}(?:\s(.*))?$/
const MARKER_BASE = /^\|{7}(?:\s(.*))?$/
const MARKER_SEP = /^={7}\s*$/
const MARKER_THEIRS = /^>{7}(?:\s(.*))?$/

export function parseConflictMarkers(content: string): {
  segments: ConflictSegment[]
  hasConflicts: boolean
} {
  const lines = content.split('\n')
  const segments: ConflictSegment[] = []
  let common: string[] = []
  let nextId = 1
  let i = 0
  let hasConflicts = false

  const flushCommon = () => {
    if (common.length > 0) {
      segments.push({ kind: 'common', lines: common })
      common = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const startMatch = line.match(MARKER_OURS)
    if (!startMatch) {
      common.push(line)
      i++
      continue
    }
    flushCommon()
    const labelOurs = startMatch[1] ?? undefined
    const ours: string[] = []
    const base: string[] = []
    let theirs: string[] = []
    let labelBase: string | undefined
    let labelTheirs: string | undefined
    let inBase = false
    let inTheirs = false
    let closed = false
    i++
    while (i < lines.length) {
      const l = lines[i]
      const baseMatch = l.match(MARKER_BASE)
      const sepMatch = l.match(MARKER_SEP)
      const endMatch = l.match(MARKER_THEIRS)
      if (!inTheirs && !inBase && baseMatch) {
        labelBase = baseMatch[1] ?? undefined
        inBase = true
        i++
        continue
      }
      if (!inTheirs && sepMatch) {
        inTheirs = true
        inBase = false
        i++
        continue
      }
      if (inTheirs && endMatch) {
        labelTheirs = endMatch[1] ?? undefined
        closed = true
        i++
        break
      }
      if (inTheirs) theirs.push(l)
      else if (inBase) base.push(l)
      else ours.push(l)
      i++
    }
    if (!closed) {
      common.push(line)
      for (const o of ours) common.push(o)
      if (inBase || base.length > 0) {
        common.push('||||||| ' + (labelBase ?? ''))
        for (const b of base) common.push(b)
      }
      if (inTheirs || theirs.length > 0) {
        common.push('=======')
        for (const t of theirs) common.push(t)
      }
      continue
    }
    hasConflicts = true
    segments.push({
      kind: 'conflict',
      id: nextId++,
      ours,
      theirs,
      base: base.length > 0 || inBase ? base : undefined,
      labelOurs,
      labelTheirs,
      labelBase,
    })
  }
  flushCommon()
  return { segments, hasConflicts }
}

export interface ConflictFileEntry {
  path: string
  indexStatus: string
  worktreeStatus: string
}

export async function gitListConflicts(cwd: string): Promise<ConflictFileEntry[]> {
  const r = await runGit(
    ['status', '--porcelain=v2', '--untracked-files=no', '-z'],
    { cwd },
  )
  if (r.code !== 0) {
    throw new Error(r.stderr.trim() || `git status exited with code ${r.code}`)
  }
  const out: ConflictFileEntry[] = []
  const tokens = r.stdout.split('\0')
  for (const t of tokens) {
    if (!t || !t.startsWith('u ')) continue
    const rest = t.slice(2)
    const xy = rest.slice(0, 2)
    const p = pathAfterFields(rest, 9)
    if (!p) continue
    out.push({ path: p, indexStatus: xy[0] ?? '.', worktreeStatus: xy[1] ?? '.' })
  }
  return out
}

export async function gitReadConflictFile(
  cwd: string,
  relPath: string,
): Promise<{
  path: string
  content: string
  segments: ConflictSegment[]
  hasConflicts: boolean
  binary: boolean
}> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  const abs = path.join(cwd, relPath)
  const buf = await fsp.readFile(abs)
  if (buf.includes(0)) {
    return { path: relPath, content: '', segments: [], hasConflicts: false, binary: true }
  }
  const content = buf.toString('utf8')
  const { segments, hasConflicts } = parseConflictMarkers(content)
  return { path: relPath, content, segments, hasConflicts, binary: false }
}

export async function gitResolveFile(
  cwd: string,
  relPath: string,
  content: string,
): Promise<void> {
  if (!relPath || relPath.startsWith('-')) throw new Error(`invalid path: ${relPath}`)
  if (typeof content !== 'string') throw new Error('content must be a string')
  const { hasConflicts } = parseConflictMarkers(content)
  if (hasConflicts) {
    throw new Error('content still contains conflict markers; resolve all conflicts before saving')
  }
  const abs = path.join(cwd, relPath)
  await fsp.writeFile(abs, content, 'utf8')
  const r = await runGit(['add', '--', relPath], { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git add failed')
}

export type MergeStateKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'stash' | null

export async function gitMergeState(cwd: string): Promise<MergeStateKind> {
  const gitDirRes = await runGit(['rev-parse', '--git-dir'], { cwd, timeout: 5_000 })
  if (gitDirRes.code !== 0) return null
  const rel = gitDirRes.stdout.trim()
  const gitDir = path.isAbsolute(rel) ? rel : path.join(cwd, rel)
  const exists = (p: string) => {
    try {
      fs.accessSync(path.join(gitDir, p))
      return true
    } catch {
      return false
    }
  }
  if (exists('MERGE_HEAD')) return 'merge'
  if (exists('rebase-merge') || exists('rebase-apply') || exists('REBASE_HEAD')) return 'rebase'
  if (exists('CHERRY_PICK_HEAD')) return 'cherry-pick'
  if (exists('REVERT_HEAD')) return 'revert'
  return null
}

export async function gitMergeAbort(cwd: string): Promise<void> {
  const state = await gitMergeState(cwd)
  let args: string[]
  if (state === 'merge') args = ['merge', '--abort']
  else if (state === 'rebase') args = ['rebase', '--abort']
  else if (state === 'cherry-pick') args = ['cherry-pick', '--abort']
  else if (state === 'revert') args = ['revert', '--abort']
  else throw new Error('no merge/rebase/cherry-pick/revert in progress')
  const r = await runGit(args, { cwd })
  if (r.code !== 0) throw new Error(r.stderr.trim() || 'git abort failed')
}

export async function gitDiscardAll(cwd: string): Promise<void> {
  const headProbe = await runGit(['rev-parse', '--verify', 'HEAD'], { cwd, timeout: 5_000 })
  if (headProbe.code === 0) {
    const r1 = await runGit(['reset', '--hard', 'HEAD'], { cwd })
    if (r1.code !== 0) throw new Error(r1.stderr.trim() || 'git reset --hard failed')
  }
  const r2 = await runGit(['clean', '-fd'], { cwd })
  if (r2.code !== 0) throw new Error(r2.stderr.trim() || 'git clean failed')
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

  ipcMain.handle('git:branches', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitListBranches(cwd)
  })

  ipcMain.handle(
    'git:checkout',
    async (
      _e,
      args: { cwd: string; ref: string; createNew?: boolean; newName?: string },
    ) => {
      const cwd = ensureCwd(args?.cwd)
      const ref = ensureSafeRef(args?.ref)
      await gitCheckout(cwd, ref, {
        createNew: !!args?.createNew,
        newName: args?.newName,
      })
    },
  )

  ipcMain.handle(
    'git:branch-create',
    async (
      _e,
      args: { cwd: string; name: string; fromRef?: string; checkout?: boolean },
    ) => {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchCreate(cwd, args?.name, args?.fromRef, !!args?.checkout)
    },
  )

  ipcMain.handle(
    'git:branch-delete',
    async (_e, args: { cwd: string; name: string; force?: boolean }) => {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchDelete(cwd, args?.name, !!args?.force)
    },
  )

  ipcMain.handle(
    'git:branch-delete-remote',
    async (_e, args: { cwd: string; remote: string; name: string }) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.remote !== 'string') throw new Error('remote is required')
      await gitBranchDeleteRemote(cwd, args.remote, args?.name)
    },
  )

  ipcMain.handle(
    'git:branch-rename',
    async (_e, args: { cwd: string; oldName: string; newName: string }) => {
      const cwd = ensureCwd(args?.cwd)
      await gitBranchRename(cwd, args?.oldName, args?.newName)
    },
  )

  ipcMain.handle(
    'git:log',
    async (
      _e,
      args: { cwd: string; ref?: string; limit?: number; skip?: number; all?: boolean },
    ) => {
      const cwd = ensureCwd(args?.cwd)
      return gitLog(cwd, {
        ref: args?.ref,
        limit: args?.limit,
        skip: args?.skip,
        all: args?.all,
      })
    },
  )

  ipcMain.handle('git:show', async (_e, args: { cwd: string; sha: string }) => {
    const cwd = ensureCwd(args?.cwd)
    if (typeof args?.sha !== 'string') throw new Error('sha is required')
    return gitShow(cwd, args.sha)
  })

  ipcMain.handle(
    'git:diff-commit',
    async (
      _e,
      args: { cwd: string; sha: string; path: string; context?: number },
    ) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.sha !== 'string') throw new Error('sha is required')
      if (typeof args?.path !== 'string') throw new Error('path is required')
      const ctx =
        typeof args.context === 'number' && Number.isFinite(args.context) && args.context >= 0
          ? Math.min(args.context, 1_000_000)
          : undefined
      return gitDiffCommit(cwd, args.sha, args.path, ctx)
    },
  )

  ipcMain.handle('git:incoming', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitIncoming(cwd)
  })

  ipcMain.handle('git:outgoing', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitOutgoing(cwd)
  })

  ipcMain.handle(
    'git:pull-strategy',
    async (_e, args: { cwd: string; strategy: GitPullStrategyOption }) => {
      const cwd = ensureCwd(args?.cwd)
      return gitPullStrategy(cwd, args?.strategy)
    },
  )

  ipcMain.handle(
    'git:stash',
    async (_e, args: { cwd: string; message?: string }) => {
      const cwd = ensureCwd(args?.cwd)
      return gitStash(cwd, args?.message)
    },
  )

  ipcMain.handle('git:stash-pop', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitStashPop(cwd)
  })

  ipcMain.handle('git:discard-all', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    await gitDiscardAll(cwd)
  })

  ipcMain.handle('git:list-conflicts', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitListConflicts(cwd)
  })

  ipcMain.handle(
    'git:read-conflict-file',
    async (_e, args: { cwd: string; path: string }) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      return gitReadConflictFile(cwd, args.path)
    },
  )

  ipcMain.handle(
    'git:resolve-file',
    async (_e, args: { cwd: string; path: string; content: string }) => {
      const cwd = ensureCwd(args?.cwd)
      if (typeof args?.path !== 'string') throw new Error('path is required')
      if (typeof args?.content !== 'string') throw new Error('content is required')
      await gitResolveFile(cwd, args.path, args.content)
    },
  )

  ipcMain.handle('git:merge-state', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    return gitMergeState(cwd)
  })

  ipcMain.handle('git:merge-abort', async (_e, args: { cwd: string }) => {
    const cwd = ensureCwd(args?.cwd)
    await gitMergeAbort(cwd)
  })
}
