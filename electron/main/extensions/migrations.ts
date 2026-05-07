import fs from 'node:fs/promises'
import path from 'node:path'
import { loadSettings, saveSettings } from '../settings-store'
import { settingsMigrationBackupPath } from './locations'

/**
 * One-shot migration of legacy core settings into the extension namespace.
 *
 * Pre-extension builds stored Git Panel settings as flat root-level keys
 * (`gitCommitProvider`, `gitPullStrategy`, etc.). Once the Git Panel ships
 * as an extension, those settings live under `extensions['git-panel']`.
 *
 * Strategy:
 *   1. Detect that we have legacy keys but no `extensions.git-panel.*`
 *      already populated (idempotent — running twice is a no-op).
 *   2. Back up the entire settings file to
 *      `~/.mterminal/settings.backup-pre-extensions.json`.
 *   3. Copy each legacy key into the extension namespace, preserving the
 *      original property name so the migrated GitPanel sees the same shape
 *      via `ctx.settings.get(...)`.
 *   4. Leave legacy keys in place for now — older builds installed
 *      side-by-side still need them. A future release can sweep them.
 *
 * Errors during migration are non-fatal: we log + continue so settings
 * never go missing.
 */

const LEGACY_GIT_KEYS = [
  'gitCommitProvider',
  'gitCommitAnthropicModel',
  'gitCommitOpenaiModel',
  'gitCommitOpenaiBaseUrl',
  'gitCommitOllamaModel',
  'gitCommitOllamaBaseUrl',
  'gitCommitSystemPrompt',
  'gitPullStrategy',
] as const

interface SettingsShape {
  [k: string]: unknown
  extensions?: Record<string, Record<string, unknown>>
}

export async function migrateLegacySettings(): Promise<{
  performed: boolean
  copiedKeys: string[]
  backupPath: string | null
}> {
  const raw = loadSettings()
  if (!raw) return { performed: false, copiedKeys: [], backupPath: null }

  let parsed: SettingsShape
  try {
    parsed = JSON.parse(raw) as SettingsShape
  } catch {
    return { performed: false, copiedKeys: [], backupPath: null }
  }

  const existingExt = parsed.extensions?.['git-panel'] ?? {}
  const legacyPresent = LEGACY_GIT_KEYS.filter(
    (k) => parsed[k] !== undefined && existingExt[k] === undefined,
  )

  if (legacyPresent.length === 0) {
    return { performed: false, copiedKeys: [], backupPath: null }
  }

  const backupPath = settingsMigrationBackupPath()
  try {
    // Ensure ~/.mterminal/ exists — first-run users may not have it yet.
    await fs.mkdir(path.dirname(backupPath), { recursive: true })
    await fs.writeFile(backupPath, raw, 'utf-8')
  } catch (err) {
    console.warn('[ext migration] backup failed:', err)
    // Continue anyway — original file is still on disk.
  }

  const next: SettingsShape = { ...parsed }
  if (!next.extensions) next.extensions = {}
  if (!next.extensions['git-panel']) next.extensions['git-panel'] = {}
  for (const k of legacyPresent) {
    next.extensions['git-panel'][k] = parsed[k]
  }

  try {
    saveSettings(JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('[ext migration] save failed; settings unchanged:', err)
    return { performed: false, copiedKeys: [], backupPath: null }
  }

  console.log(
    `[ext migration] copied ${legacyPresent.length} legacy git settings into extensions['git-panel']`,
  )
  return {
    performed: true,
    copiedKeys: [...legacyPresent],
    backupPath,
  }
}
