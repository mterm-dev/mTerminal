import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  whichOnPath,
  pickNewestLeaf,
  buildEnv,
  readProcInfo,
  resolveSpawnCwd,
  type NodeInfo,
} from '../../electron/main/pty'

const isWin = process.platform === 'win32'
const PATH_SEP = isWin ? ';' : ':'

function mkTmpDir(prefix = 'mt-pty-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

function writeExecutable(dir: string, name: string, body = '#!/bin/sh\nexit 0\n'): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, body)
  fs.chmodSync(p, 0o755)
  return p
}

describe('whichOnPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null when PATH is unset', () => {
    vi.stubEnv('PATH', '')
    expect(whichOnPath('anything')).toBeNull()
  })

  it('returns null when prog is not found in any PATH dir', () => {
    const dir = mkTmpDir()
    vi.stubEnv('PATH', dir)
    expect(whichOnPath('definitely-not-here-xyz')).toBeNull()
  })

  it('returns the absolute path when prog exists as a file in a PATH dir', () => {
    const dir = mkTmpDir()
    const name = isWin ? 'mt-tool.exe' : 'mt-tool'
    const expected = writeExecutable(dir, name)
    vi.stubEnv('PATH', dir)
    if (isWin) vi.stubEnv('PATHEXT', '.EXE')
    const probe = isWin ? 'mt-tool' : 'mt-tool'
    const result = whichOnPath(probe)
    expect(result).toBe(expected)
  })

  it('returns first match when multiple PATH dirs contain it', () => {
    const dirA = mkTmpDir('mt-A-')
    const dirB = mkTmpDir('mt-B-')
    const name = isWin ? 'mt-dup.exe' : 'mt-dup'
    const firstPath = writeExecutable(dirA, name)
    writeExecutable(dirB, name)
    vi.stubEnv('PATH', [dirA, dirB].join(PATH_SEP))
    if (isWin) vi.stubEnv('PATHEXT', '.EXE')
    const probe = isWin ? 'mt-dup' : 'mt-dup'
    expect(whichOnPath(probe)).toBe(firstPath)
  })

  it('skips empty PATH entries (PATH with ::)', () => {
    const dir = mkTmpDir()
    const name = isWin ? 'mt-skip.exe' : 'mt-skip'
    const expected = writeExecutable(dir, name)
    
    const parts = ['', '', dir, '']
    vi.stubEnv('PATH', parts.join(PATH_SEP))
    if (isWin) vi.stubEnv('PATHEXT', '.EXE')
    const probe = isWin ? 'mt-skip' : 'mt-skip'
    expect(whichOnPath(probe)).toBe(expected)
  })

  it.skipIf(isWin)('does NOT add an extension on linux/macOS', () => {
    const dir = mkTmpDir()
    
    writeExecutable(dir, 'mt-noext.sh')
    vi.stubEnv('PATH', dir)
    expect(whichOnPath('mt-noext')).toBeNull()
    
    expect(whichOnPath('mt-noext.sh')).toBe(path.join(dir, 'mt-noext.sh'))
  })
})

describe('pickNewestLeaf', () => {
  it('returns rootPid when nodes array is empty', () => {
    expect(pickNewestLeaf(42, [], new Map())).toBe(42)
  })

  it('walks a linear chain to the deepest leaf', () => {
    const nodes: NodeInfo[] = [
      { pid: 100, ppid: 1 },
      { pid: 200, ppid: 100 },
      { pid: 300, ppid: 200 },
    ]
    const starts = new Map<number, number>([[100, 1], [200, 2], [300, 3]])
    expect(pickNewestLeaf(1, nodes, starts)).toBe(300)
  })

  it('picks the child with the newer start time when branching', () => {
    const nodes: NodeInfo[] = [
      { pid: 10, ppid: 1 }, // A
      { pid: 20, ppid: 1 }, // B
    ]
    const starts = new Map<number, number>([[10, 1], [20, 5]])
    expect(pickNewestLeaf(1, nodes, starts)).toBe(20)
  })

  it('treats missing startTime entries as 0', () => {
    
    
    
    
    const nodes: NodeInfo[] = [
      { pid: 10, ppid: 1 }, // no entry -> 0
      { pid: 20, ppid: 1 }, // start=10 -> wins
    ]
    const starts = new Map<number, number>([[20, 10]])
    expect(pickNewestLeaf(1, nodes, starts)).toBe(20)
  })

  it('on equal start times, last iterated child wins (>= comparison)', () => {
    const nodes: NodeInfo[] = [
      { pid: 10, ppid: 1 },
      { pid: 20, ppid: 1 },
    ]
    const starts = new Map<number, number>([[10, 5], [20, 5]])
    expect(pickNewestLeaf(1, nodes, starts)).toBe(20)
  })

  it('skips self-referential entries (cycle protection)', () => {
    
    const nodes: NodeInfo[] = [
      { pid: 100, ppid: 100 }, // self-ref, must be skipped
      { pid: 200, ppid: 100 },
    ]
    const starts = new Map<number, number>([[100, 1], [200, 2]])
    expect(pickNewestLeaf(100, nodes, starts)).toBe(200)
  })

  it('caps depth at 17 iterations (depth=0..16 inclusive)', () => {
    
    const nodes: NodeInfo[] = []
    const starts = new Map<number, number>()
    for (let i = 1; i <= 20; i++) {
      nodes.push({ pid: i, ppid: i - 1 })
      starts.set(i, i)
    }
    
    
    expect(pickNewestLeaf(0, nodes, starts)).toBe(17)
  })
})

describe('buildEnv', () => {
  it('returns a copy of process.env (mutating result does not affect process.env)', () => {
    const before = process.env.PATH
    const env = buildEnv('/bin/bash', undefined)
    env.PATH = 'tampered'
    expect(process.env.PATH).toBe(before)
  })

  it('sets SHELL, TERM, COLORTERM, MTERMINAL', () => {
    const env = buildEnv('/bin/zsh', undefined)
    expect(env.SHELL).toBe('/bin/zsh')
    expect(env.TERM).toBe('xterm-256color')
    expect(env.COLORTERM).toBe('truecolor')
    expect(env.MTERMINAL).toBe('1')
  })

  it('extra overrides built-in keys', () => {
    const env = buildEnv('/bin/sh', { TERM: 'dumb', SHELL: '/usr/bin/fish', CUSTOM: 'x' })
    expect(env.TERM).toBe('dumb')
    expect(env.SHELL).toBe('/usr/bin/fish')
    expect(env.CUSTOM).toBe('x')
    
    expect(env.MTERMINAL).toBe('1')
  })

  it('all values in the returned env are strings', () => {
    const env = buildEnv('/bin/sh', undefined)
    for (const v of Object.values(env)) {
      expect(typeof v).toBe('string')
    }
  })
})

describe('readProcInfo', () => {
  it.skipIf(process.platform !== 'linux')(
    'returns cwd and cmd for the current process on Linux',
    async () => {
      const info = await readProcInfo(process.pid)
      expect(info.cwd).not.toBeNull()
      expect(info.cmd).not.toBeNull()
      expect(info.cwd).toBe(process.cwd())
      expect(typeof info.cmd).toBe('string')
      expect((info.cmd as string).length).toBeGreaterThan(0)
    }
  )

  it.skipIf(process.platform !== 'linux')(
    'returns nulls for an invalid pid on Linux',
    async () => {
      const info = await readProcInfo(999999)
      expect(info.cwd).toBeNull()
      expect(info.cmd).toBeNull()
    }
  )
})

describe('resolveSpawnCwd', () => {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir()

  it('returns home when no cwd is requested', () => {
    expect(resolveSpawnCwd(undefined)).toBe(home)
    expect(resolveSpawnCwd(null)).toBe(home)
    expect(resolveSpawnCwd('')).toBe(home)
  })

  it('returns the requested cwd when it is an existing directory', () => {
    const tmp = mkTmpDir()
    try {
      expect(resolveSpawnCwd(tmp)).toBe(tmp)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('falls back to home when the requested cwd does not exist', () => {
    expect(resolveSpawnCwd('/nope/this/path/does/not/exist/mterminal')).toBe(home)
  })

  it('falls back to home when the requested cwd is a file, not a directory', () => {
    const tmp = mkTmpDir()
    try {
      const filePath = path.join(tmp, 'a-file.txt')
      fs.writeFileSync(filePath, 'x')
      expect(resolveSpawnCwd(filePath)).toBe(home)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
