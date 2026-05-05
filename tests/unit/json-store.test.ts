import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadJsonFile, saveJsonFileAtomic } from '../../electron/main/json-store'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-jsonstore-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

describe('loadJsonFile', () => {
  it('returns null for missing file', () => {
    expect(loadJsonFile(path.join(tmpDir, 'nope.json'))).toBeNull()
  })

  it('returns null for empty file', () => {
    const f = path.join(tmpDir, 'empty.json')
    fs.writeFileSync(f, '')
    expect(loadJsonFile(f)).toBeNull()
  })

  it('returns file contents as string', () => {
    const f = path.join(tmpDir, 'a.json')
    fs.writeFileSync(f, '{"a":1}')
    expect(loadJsonFile(f)).toBe('{"a":1}')
  })
})

describe('saveJsonFileAtomic', () => {
  it('writes content to file', () => {
    const f = path.join(tmpDir, 'b.json')
    saveJsonFileAtomic(f, '{"b":2}')
    expect(fs.readFileSync(f, 'utf8')).toBe('{"b":2}')
  })

  it('overwrites prior content', () => {
    const f = path.join(tmpDir, 'c.json')
    saveJsonFileAtomic(f, '{"v":1}')
    saveJsonFileAtomic(f, '{"v":2}')
    expect(fs.readFileSync(f, 'utf8')).toBe('{"v":2}')
  })

  it('creates parent directory recursively', () => {
    const f = path.join(tmpDir, 'a', 'b', 'c.json')
    saveJsonFileAtomic(f, '{"x":1}')
    expect(fs.readFileSync(f, 'utf8')).toBe('{"x":1}')
  })

  it('leaves no .tmp file behind', () => {
    const f = path.join(tmpDir, 'd.json')
    saveJsonFileAtomic(f, '{"d":1}')
    const leftover = fs.readdirSync(tmpDir).filter((x) => x.endsWith('.tmp'))
    expect(leftover).toEqual([])
  })

  it.skipIf(process.platform === 'win32')(
    'sets file mode to 0o600 on POSIX',
    () => {
      const f = path.join(tmpDir, 'e.json')
      saveJsonFileAtomic(f, '{"e":1}')
      const st = fs.statSync(f)
      expect(st.mode & 0o777).toBe(0o600)
    },
  )

  it('ignores non-string input', () => {
    const f = path.join(tmpDir, 'f.json')
    saveJsonFileAtomic(f, undefined as unknown as string)
    expect(fs.existsSync(f)).toBe(false)
  })
})
