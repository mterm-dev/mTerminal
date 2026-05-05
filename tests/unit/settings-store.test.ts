import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  loadSettings,
  saveSettings,
  setSettingsFilePathForTests,
} from '../../electron/main/settings-store'

let tmpDir: string
let file: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-settings-'))
  file = path.join(tmpDir, 'settings.json')
  setSettingsFilePathForTests(file)
})

afterEach(() => {
  setSettingsFilePathForTests(null)
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {}
})

describe('settings-store', () => {
  it('returns null when settings file does not exist', () => {
    expect(loadSettings()).toBeNull()
  })

  it('round-trips JSON through save and load', () => {
    const json = JSON.stringify({ themeId: 'mono', fontSize: 14 })
    saveSettings(json)
    expect(loadSettings()).toBe(json)
  })

  it('overwrites prior settings on save', () => {
    saveSettings('{"a":1}')
    saveSettings('{"a":2}')
    expect(loadSettings()).toBe('{"a":2}')
  })
})
