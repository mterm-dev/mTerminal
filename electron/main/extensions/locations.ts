import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'

/**
 * Filesystem layout for the extension system.
 *
 *   ~/.mterminal/                              userRoot()
 *   ├── extensions/                            userExtensionsDir()
 *   │   └── <id>/                              extensionDir(id)
 *   │       ├── package.json                   manifestPath(id)
 *   │       └── data/                          extensionDataDir(id)
 *   ├── trust.json                             trustFilePath()
 *   └── settings.backup-pre-extensions.json    settingsMigrationBackupPath()
 *
 *   <app>/extensions/                          builtInExtensionsDir()
 *   └── <id>/...                               (read-only, shipped with the app)
 */

const USER_DIR_NAME = '.mterminal'

export function userRoot(): string {
  return path.join(app.getPath('home'), USER_DIR_NAME)
}

export function userExtensionsDir(): string {
  return path.join(userRoot(), 'extensions')
}

export function builtInExtensionsDir(): string | null {
  if (app.isPackaged) return null
  if (process.env.MTERMINAL_LOAD_BUILTINS !== '1') return null
  return path.join(app.getAppPath(), 'extensions')
}

export function extensionDir(source: ExtensionSource, id: string): string {
  if (source === 'built-in') {
    const dir = builtInExtensionsDir()
    if (!dir) {
      throw new Error('built-in extensions are not available in this build')
    }
    return path.join(dir, id)
  }
  return path.join(userExtensionsDir(), id)
}

/**
 * Per-extension writable data directory.
 *
 * Stored under ~/.mterminal/data/<id>/ rather than under the extensions
 * folder itself — that way creating the data dir for a built-in plugin
 * doesn't pollute ~/.mterminal/extensions/ with empty subdirectories that
 * the next manifest scan would mistake for half-installed user extensions.
 */
export function extensionDataDir(id: string): string {
  return path.join(userRoot(), 'data', id)
}

export function manifestPath(extensionPath: string): string {
  return path.join(extensionPath, 'package.json')
}

export function trustFilePath(): string {
  return path.join(userRoot(), 'trust.json')
}

export function settingsMigrationBackupPath(): string {
  return path.join(userRoot(), 'settings.backup-pre-extensions.json')
}

export type ExtensionSource = 'user' | 'built-in'

export async function ensureUserDirs(): Promise<void> {
  await fs.mkdir(userExtensionsDir(), { recursive: true })
}

export async function ensureExtensionDataDir(id: string): Promise<string> {
  const dir = extensionDataDir(id)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function listExtensionDirs(
  rootDir: string,
): Promise<Array<{ id: string; path: string }>> {
  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => ({ id: e.name, path: path.join(rootDir, e.name) }))
}
