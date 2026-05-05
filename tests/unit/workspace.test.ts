import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadWorkspace,
  saveWorkspace,
  setWorkspaceFilePathForTests,
} from '../../electron/main/workspace'

let tmpDir: string
let file: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ws-'))
  file = path.join(tmpDir, 'workspace.json')
  setWorkspaceFilePathForTests(file)
})

afterEach(() => {
  setWorkspaceFilePathForTests(null)
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

describe('loadWorkspace', () => {
  it('returns null when the file does not exist', () => {
    expect(loadWorkspace()).toBeNull()
  })

  it('returns null when the file exists but is empty', () => {
    fs.writeFileSync(file, '', 'utf8')
    expect(loadWorkspace()).toBeNull()
  })

  it('returns the file contents when it exists', () => {
    const json = JSON.stringify({ tabs: [{ id: 1, cwd: '/tmp' }] })
    fs.writeFileSync(file, json, 'utf8')
    expect(loadWorkspace()).toBe(json)
  })
})

describe('saveWorkspace', () => {
  it('writes the JSON string to disk', () => {
    const json = JSON.stringify({ activeId: 7 })
    saveWorkspace(json)
    expect(fs.readFileSync(file, 'utf8')).toBe(json)
  })

  it('overwrites prior content', () => {
    saveWorkspace('{"v":1}')
    saveWorkspace('{"v":2}')
    expect(fs.readFileSync(file, 'utf8')).toBe('{"v":2}')
  })

  it('creates the parent directory if missing', () => {
    const nested = path.join(tmpDir, 'sub', 'deeper', 'workspace.json')
    setWorkspaceFilePathForTests(nested)
    saveWorkspace('{"ok":true}')
    expect(fs.readFileSync(nested, 'utf8')).toBe('{"ok":true}')
  })

  it('round-trips through loadWorkspace', () => {
    const json = JSON.stringify({ a: 1, b: 'two' })
    saveWorkspace(json)
    expect(loadWorkspace()).toBe(json)
  })

  it('writes atomically: no .tmp file remains after a successful save', () => {
    saveWorkspace('{"x":1}')
    const leftover = fs
      .readdirSync(path.dirname(file))
      .filter((f) => f.endsWith('.tmp'))
    expect(leftover).toEqual([])
  })

  it('ignores non-string input', () => {
    saveWorkspace(undefined as unknown as string)
    expect(fs.existsSync(file)).toBe(false)
  })
})
