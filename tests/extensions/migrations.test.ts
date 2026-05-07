import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// Set up an isolated settings file *before* importing the modules that use it.
const tmpRoot = path.join(os.tmpdir(), `mt-migrate-${Date.now()}-${process.pid}`)
const settingsFile = path.join(tmpRoot, 'settings.json')

vi.mock('../../electron/main/settings-store', () => {
  const fsSync = require('node:fs')
  return {
    loadSettings: () => {
      try {
        return fsSync.readFileSync(settingsFile, 'utf8')
      } catch {
        return null
      }
    },
    saveSettings: (json: string) => {
      fsSync.mkdirSync(path.dirname(settingsFile), { recursive: true })
      fsSync.writeFileSync(settingsFile, json, 'utf8')
    },
  }
})

vi.mock('../../electron/main/extensions/locations', async () => {
  const actual = await vi.importActual<typeof import('../../electron/main/extensions/locations')>(
    '../../electron/main/extensions/locations',
  )
  return {
    ...actual,
    settingsMigrationBackupPath: () =>
      path.join(tmpRoot, 'settings.backup-pre-extensions.json'),
  }
})

import { migrateLegacySettings } from '../../electron/main/extensions/migrations'

beforeEach(async () => {
  await fs.mkdir(tmpRoot, { recursive: true })
})

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

describe('migrateLegacySettings', () => {
  it('is a no-op when there are no settings on disk', async () => {
    const result = await migrateLegacySettings()
    expect(result.performed).toBe(false)
    expect(result.copiedKeys).toEqual([])
  })

  it('copies legacy git keys into extensions["git-panel"]', async () => {
    const legacy = {
      themeId: 'whatever',
      gitCommitProvider: 'openai',
      gitCommitOpenaiModel: 'gpt-4o-mini',
      gitPullStrategy: 'rebase',
      gitCommitSystemPrompt: 'be brief',
    }
    await fs.writeFile(settingsFile, JSON.stringify(legacy), 'utf8')

    const result = await migrateLegacySettings()
    expect(result.performed).toBe(true)
    expect(result.copiedKeys).toEqual(
      expect.arrayContaining([
        'gitCommitProvider',
        'gitCommitOpenaiModel',
        'gitPullStrategy',
        'gitCommitSystemPrompt',
      ]),
    )

    const after = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    expect(after.extensions['git-panel'].gitCommitProvider).toBe('openai')
    expect(after.extensions['git-panel'].gitPullStrategy).toBe('rebase')
    expect(after.extensions['git-panel'].gitCommitSystemPrompt).toBe('be brief')

    // Legacy keys preserved (defense for older builds reading the same file).
    expect(after.gitCommitProvider).toBe('openai')

    // Backup file written.
    const backup = await fs.readFile(
      path.join(tmpRoot, 'settings.backup-pre-extensions.json'),
      'utf8',
    )
    expect(JSON.parse(backup).gitCommitProvider).toBe('openai')
  })

  it('is idempotent on a second run', async () => {
    const legacy = {
      gitCommitProvider: 'openai',
      gitPullStrategy: 'rebase',
    }
    await fs.writeFile(settingsFile, JSON.stringify(legacy), 'utf8')
    await migrateLegacySettings()
    const second = await migrateLegacySettings()
    expect(second.performed).toBe(false)
  })

  it('does not overwrite existing extension namespace values', async () => {
    const settings = {
      gitCommitProvider: 'openai',
      extensions: {
        'git-panel': { gitCommitProvider: 'anthropic' },
      },
    }
    await fs.writeFile(settingsFile, JSON.stringify(settings), 'utf8')
    const result = await migrateLegacySettings()
    expect(result.performed).toBe(false)
    const after = JSON.parse(await fs.readFile(settingsFile, 'utf8'))
    // existing extension value wins
    expect(after.extensions['git-panel'].gitCommitProvider).toBe('anthropic')
  })

  it('is a no-op for invalid JSON', async () => {
    await fs.writeFile(settingsFile, '{ not json', 'utf8')
    const result = await migrateLegacySettings()
    expect(result.performed).toBe(false)
  })
})
