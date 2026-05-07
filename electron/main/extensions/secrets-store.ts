import { safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureExtensionDataDir, extensionDataDir } from './locations'

/**
 * Per-extension secrets store. Each extension gets its own JSON file under
 *   ~/.mterminal/data/<extId>/secrets.json
 *
 * Values are encrypted via Electron's `safeStorage` when the OS provides a
 * keychain (macOS Keychain, Windows DPAPI, libsecret on Linux). When
 * encryption is unavailable (e.g. headless Linux without keyring) we fall
 * back to plaintext JSON with file mode 0o600 and stamp the file with
 * `enc: false` so the user knows.
 *
 * This is a *shared* primitive — any extension can request secrets through
 * `ctx.secrets`, and any extension can declare `contributes.secrets` to make
 * the host auto-render password inputs in Settings → Extensions → <ext>.
 *
 * Decoupled from core's `vault` (which holds host-AI keys behind a master
 * password). Extensions that want their own end-to-end credential flow can
 * still ignore this API and roll their own.
 */

interface SecretsFile {
  version: 1
  enc: boolean
  values: Record<string, string>
}

const cache = new Map<string, SecretsFile>()
const listeners = new Map<string, Set<(key: string, value: string | null) => void>>()

function fileFor(extId: string): string {
  return path.join(extensionDataDir(extId), 'secrets.json')
}

async function load(extId: string): Promise<SecretsFile> {
  const cached = cache.get(extId)
  if (cached) return cached
  const file = fileFor(extId)
  try {
    const raw = await fs.readFile(file, 'utf-8')
    const parsed = JSON.parse(raw) as SecretsFile
    if (parsed && typeof parsed === 'object' && parsed.version === 1) {
      cache.set(extId, parsed)
      return parsed
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
  }
  const fresh: SecretsFile = { version: 1, enc: false, values: {} }
  cache.set(extId, fresh)
  return fresh
}

async function persist(extId: string, file: SecretsFile): Promise<void> {
  await ensureExtensionDataDir(extId)
  const dest = fileFor(extId)
  const json = JSON.stringify(file, null, 2)
  await fs.writeFile(dest, json, { encoding: 'utf-8', mode: 0o600 })
  try {
    await fs.chmod(dest, 0o600)
  } catch {
    /* mode-on-write may fail on Windows; ignore */
  }
}

function decrypt(file: SecretsFile, value: string): string {
  if (!file.enc) return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return ''
  }
}

function encrypt(file: SecretsFile, value: string): string {
  if (!file.enc) return value
  return safeStorage.encryptString(value).toString('base64')
}

function emit(extId: string, key: string, value: string | null): void {
  const set = listeners.get(extId)
  if (!set) return
  for (const cb of set) {
    try {
      cb(key, value)
    } catch {
      /* ignore listener errors */
    }
  }
}

export async function secretsGet(extId: string, key: string): Promise<string | null> {
  const file = await load(extId)
  const raw = file.values[key]
  if (raw === undefined) return null
  return decrypt(file, raw)
}

export async function secretsSet(extId: string, key: string, value: string): Promise<void> {
  const file = await load(extId)
  if (Object.keys(file.values).length === 0) {
    file.enc = canEncrypt()
  }
  file.values[key] = encrypt(file, value)
  await persist(extId, file)
  emit(extId, key, value)
}

export async function secretsDelete(extId: string, key: string): Promise<void> {
  const file = await load(extId)
  if (!(key in file.values)) return
  delete file.values[key]
  await persist(extId, file)
  emit(extId, key, null)
}

export async function secretsHas(extId: string, key: string): Promise<boolean> {
  const file = await load(extId)
  return key in file.values
}

export async function secretsKeys(extId: string): Promise<string[]> {
  const file = await load(extId)
  return Object.keys(file.values)
}

export function secretsOnChange(
  extId: string,
  cb: (key: string, value: string | null) => void,
): () => void {
  let set = listeners.get(extId)
  if (!set) {
    set = new Set()
    listeners.set(extId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
  }
}

export async function purgeSecrets(extId: string): Promise<void> {
  cache.delete(extId)
  try {
    await fs.unlink(fileFor(extId))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  emit(extId, '__all__', null)
}

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}
