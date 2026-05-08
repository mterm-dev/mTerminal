import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { argon2id } from '@noble/hashes/argon2'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'

const AAD = Buffer.from('mterminal-vault-v1', 'utf8')
const KDF_M_KIB = 64 * 1024 // 64 MiB
const KDF_T = 3
const KDF_P = 4
const KEY_LEN = 32
const SALT_LEN = 16
const NONCE_LEN = 24
const VAULT_VERSION = 1

interface VaultFile {
  version: number
  kdf_salt: string
  nonce: string
  ciphertext: string
}

export interface VaultPayload {
  passwords: Record<string, string>
  ai_keys: Record<string, string>
  ext?: Record<string, Record<string, string>>
}

export const NS_AI_KEYS = 'ai_keys'
export const NS_PASSWORDS = 'passwords'
export const EXT_NS_PREFIX = 'ext:'

function emptyPayload(): VaultPayload {
  return { passwords: {}, ai_keys: {}, ext: {} }
}

interface VaultState {
  key: Uint8Array
  salt: Uint8Array
  payload: VaultPayload
}

let state: VaultState | null = null

export function configDir(): string {
  let dir: string
  if (process.platform === 'win32') {
    const base =
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    dir = path.join(base, 'mterminal')
  } else if (process.platform === 'darwin') {
    dir = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'mterminal'
    )
  } else {
    const xdg = process.env.XDG_CONFIG_HOME
    const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
    dir = path.join(base, 'mterminal')
  }
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function legacyMacConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), '.config')
  return path.join(base, 'mterminal')
}

function migrateMacVaultIfNeeded(): void {
  if (process.platform !== 'darwin') return
  const target = path.join(configDir(), 'vault.bin')
  if (fs.existsSync(target)) return
  const legacy = path.join(legacyMacConfigDir(), 'vault.bin')
  if (!fs.existsSync(legacy)) return
  try {
    fs.renameSync(legacy, target)
  } catch {
    try {
      fs.copyFileSync(legacy, target)
      fs.unlinkSync(legacy)
    } catch {}
  }
}

function isDevMode(): boolean {
  return (
    !!process.env.ELECTRON_RENDERER_URL ||
    process.env.NODE_ENV === 'development'
  )
}

function vaultFileName(): string {
  return isDevMode() ? 'vault.dev.bin' : 'vault.bin'
}

function vaultPath(): string {
  if (!isDevMode()) migrateMacVaultIfNeeded()
  return path.join(configDir(), vaultFileName())
}

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return argon2id(password, salt, {
    m: KDF_M_KIB,
    t: KDF_T,
    p: KDF_P,
    dkLen: KEY_LEN,
    version: 0x13,
  })
}

function kdfWorkerPath(): string {
  return path.join(__dirname, 'kdf-worker.js')
}

function deriveKeyAsync(password: string, salt: Uint8Array): Promise<Uint8Array> {
  if (process.env.VITEST) {
    return Promise.resolve(deriveKey(password, salt))
  }
  return new Promise((resolve, reject) => {
    const pwBytes = Buffer.from(password, 'utf8')
    const worker = new Worker(kdfWorkerPath(), {
      workerData: {
        password: pwBytes,
        salt,
        m: KDF_M_KIB,
        t: KDF_T,
        p: KDF_P,
        dkLen: KEY_LEN,
        version: 0x13,
      },
    })
    let settled = false
    worker.once('message', (key: Uint8Array) => {
      settled = true
      void worker.terminate()
      resolve(new Uint8Array(key))
    })
    worker.once('error', (err) => {
      if (settled) return
      settled = true
      reject(err)
    })
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`kdf worker exited with code ${code}`))
      }
    })
  })
}

function encryptPayload(
  key: Uint8Array,
  payload: VaultPayload
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const nonce = crypto.randomBytes(NONCE_LEN)
  const cipher = xchacha20poly1305(key, nonce, AAD)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ct = cipher.encrypt(plaintext)
  return { nonce, ciphertext: ct }
}

function decryptPayload(
  key: Uint8Array,
  nonce: Uint8Array,
  ct: Uint8Array
): VaultPayload {
  const cipher = xchacha20poly1305(key, nonce, AAD)
  let pt: Uint8Array
  try {
    pt = cipher.decrypt(ct)
  } catch {
    throw new Error('decrypt failed — wrong master password or corrupted vault')
  }
  const obj = JSON.parse(Buffer.from(pt).toString('utf8')) as Partial<VaultPayload>
  return {
    passwords: obj.passwords ?? {},
    ai_keys: obj.ai_keys ?? {},
    ext: obj.ext ?? {},
  }
}

function readVaultFile(): VaultFile | null {
  const p = vaultPath()
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p)
  if (raw.length === 0) return null
  return JSON.parse(raw.toString('utf8')) as VaultFile
}

function writeVaultFile(file: VaultFile): void {
  const p = vaultPath()
  const tmp = p + '.tmp'
  const bytes = Buffer.from(JSON.stringify(file), 'utf8')
  const fd = fs.openSync(tmp, 'w', 0o600)
  try {
    fs.writeSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, p)
  try {
    fs.chmodSync(p, 0o600)
  } catch {}
}

function fileFromKey(
  key: Uint8Array,
  salt: Uint8Array,
  payload: VaultPayload
): VaultFile {
  const { nonce, ciphertext } = encryptPayload(key, payload)
  return {
    version: VAULT_VERSION,
    kdf_salt: Buffer.from(salt).toString('base64'),
    nonce: Buffer.from(nonce).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  }
}

function persist(): void {
  if (!state) throw new Error('vault locked')
  writeVaultFile(fileFromKey(state.key, state.salt, state.payload))
}

export function zero(buf: Uint8Array): void {
  buf.fill(0)
}

export function isUnlocked(): boolean {
  return state !== null
}

function assertUnlocked(): VaultState {
  if (!state) throw new Error('vault locked')
  return state
}

function bucket(s: VaultState, ns: string, create: boolean): Record<string, string> | null {
  if (ns === NS_AI_KEYS) return s.payload.ai_keys
  if (ns === NS_PASSWORDS) return s.payload.passwords
  if (ns.startsWith(EXT_NS_PREFIX)) {
    const extId = ns.slice(EXT_NS_PREFIX.length)
    if (extId.length === 0) throw new Error('invalid namespace: empty extension id')
    if (!s.payload.ext) s.payload.ext = {}
    let b = s.payload.ext[extId]
    if (!b) {
      if (!create) return null
      b = {}
      s.payload.ext[extId] = b
    }
    return b
  }
  throw new Error(`invalid vault namespace: ${ns}`)
}

export function getSecret(ns: string, key: string): string | null {
  const s = assertUnlocked()
  const b = bucket(s, ns, false)
  if (!b) return null
  const v = b[key]
  return typeof v === 'string' ? v : null
}

export function setSecret(ns: string, key: string, value: string): void {
  const s = assertUnlocked()
  const b = bucket(s, ns, true)!
  b[key] = value
  persist()
}

export function clearSecret(ns: string, key: string): void {
  const s = assertUnlocked()
  const b = bucket(s, ns, false)
  if (!b) return
  if (key in b) {
    delete b[key]
    persist()
  }
}

export function listSecretKeys(ns: string): string[] {
  const s = assertUnlocked()
  const b = bucket(s, ns, false)
  return b ? Object.keys(b) : []
}

export function getAiKey(provider: string): string | null {
  return getSecret(NS_AI_KEYS, provider)
}

export function setAiKey(provider: string, key: string): void {
  setSecret(NS_AI_KEYS, provider, key)
}

export function clearAiKey(provider: string): void {
  clearSecret(NS_AI_KEYS, provider)
}

function extNs(extId: string): string {
  if (!extId || typeof extId !== 'string') {
    throw new Error('invalid extension id')
  }
  return EXT_NS_PREFIX + extId
}

export function getExtSecret(extId: string, key: string): string | null {
  return getSecret(extNs(extId), key)
}

export function setExtSecret(extId: string, key: string, value: string): void {
  setSecret(extNs(extId), key, value)
}

export function clearExtSecret(extId: string, key: string): void {
  clearSecret(extNs(extId), key)
}

export function listExtSecretKeys(extId: string): string[] {
  return listSecretKeys(extNs(extId))
}

export function purgeExtSecrets(extId: string): void {
  const s = assertUnlocked()
  if (!s.payload.ext) return
  if (extId in s.payload.ext) {
    delete s.payload.ext[extId]
    persist()
  }
}

export function registerVaultHandlers(): void {
  ipcMain.handle('vault:status', () => {
    let exists = false
    try {
      exists = fs.existsSync(vaultPath())
    } catch {
      exists = false
    }
    return { exists, unlocked: isUnlocked(), dev: isDevMode() }
  })

  ipcMain.handle('vault:dev-reset', () => {
    if (!isDevMode()) {
      throw new Error('vault:dev-reset only available in development mode')
    }
    if (state) {
      zero(state.key)
      state = null
    }
    const p = vaultPath()
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch (err) {
      throw new Error(`failed to remove vault file: ${(err as Error).message}`)
    }
  })

  ipcMain.handle('vault:init', async (_e, args: { masterPassword: string }) => {
    const pw = args?.masterPassword ?? ''
    if (pw.length === 0) throw new Error('master password cannot be empty')
    if (fs.existsSync(vaultPath())) {
      throw new Error('vault already exists — use unlock or change_password')
    }
    const salt = crypto.randomBytes(SALT_LEN)
    const key = await deriveKeyAsync(pw, salt)
    const payload = emptyPayload()
    writeVaultFile(fileFromKey(key, salt, payload))
    state = { key, salt, payload }
  })

  ipcMain.handle('vault:unlock', async (_e, args: { masterPassword: string }) => {
    const pw = args?.masterPassword ?? ''
    const file = readVaultFile()
    if (!file) throw new Error('vault not initialized')
    const salt = Buffer.from(file.kdf_salt, 'base64')
    if (salt.length !== SALT_LEN) throw new Error('invalid salt length')
    const nonce = Buffer.from(file.nonce, 'base64')
    const ct = Buffer.from(file.ciphertext, 'base64')
    const key = await deriveKeyAsync(pw, salt)
    let payload: VaultPayload
    try {
      payload = decryptPayload(key, nonce, ct)
    } catch (e) {
      zero(key)
      throw e instanceof Error ? e : new Error(String(e))
    }
    state = { key, salt, payload }
  })

  ipcMain.handle('vault:lock', () => {
    if (state) {
      zero(state.key)
      state = null
    }
  })

  ipcMain.handle(
    'vault:change-password',
    async (_e, args: { oldPassword: string; newPassword: string }) => {
      const oldPw = args?.oldPassword ?? ''
      const newPw = args?.newPassword ?? ''
      if (newPw.length === 0) {
        throw new Error('new master password cannot be empty')
      }
      const file = readVaultFile()
      if (!file) throw new Error('vault not initialized')
      const oldSalt = Buffer.from(file.kdf_salt, 'base64')
      if (oldSalt.length !== SALT_LEN) throw new Error('invalid salt length')
      const oldKey = await deriveKeyAsync(oldPw, oldSalt)
      const nonce = Buffer.from(file.nonce, 'base64')
      const ct = Buffer.from(file.ciphertext, 'base64')
      let payload: VaultPayload
      try {
        payload = decryptPayload(oldKey, nonce, ct)
      } catch (e) {
        zero(oldKey)
        throw e instanceof Error ? e : new Error(String(e))
      }
      zero(oldKey)
      const newSalt = crypto.randomBytes(SALT_LEN)
      const newKey = await deriveKeyAsync(newPw, newSalt)
      writeVaultFile(fileFromKey(newKey, newSalt, payload))
      const oldState = state
      state = { key: newKey, salt: newSalt, payload }
      if (oldState) zero(oldState.key)
    }
  )
}
