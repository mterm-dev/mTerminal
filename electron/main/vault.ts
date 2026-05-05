import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
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
}

function emptyPayload(): VaultPayload {
  return { passwords: {}, ai_keys: {} }
}

interface VaultState {
  key: Uint8Array
  salt: Uint8Array
  payload: VaultPayload
}

let state: VaultState | null = null

export function configDir(): string {
  let base: string
  if (process.platform === 'win32') {
    base = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  } else {
    const xdg = process.env.XDG_CONFIG_HOME
    if (xdg && xdg.length > 0) {
      base = xdg
    } else {
      base = path.join(os.homedir(), '.config')
    }
  }
  const dir = path.join(base, 'mterminal')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function vaultPath(): string {
  return path.join(configDir(), 'vault.bin')
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

export function getAiKey(provider: string): string | null {
  if (!state) throw new Error('vault locked')
  const v = state.payload.ai_keys[provider]
  return typeof v === 'string' ? v : null
}

export function setAiKey(provider: string, key: string): void {
  if (!state) throw new Error('vault locked')
  state.payload.ai_keys[provider] = key
  persist()
}

export function clearAiKey(provider: string): void {
  if (!state) throw new Error('vault locked')
  if (provider in state.payload.ai_keys) {
    delete state.payload.ai_keys[provider]
    persist()
  }
}

export function getHostPassword(hostId: string): string | null {
  if (!state) throw new Error('vault locked')
  const v = state.payload.passwords[hostId]
  return typeof v === 'string' ? v : null
}

export function setHostPassword(hostId: string, password: string): void {
  if (!state) throw new Error('vault locked')
  state.payload.passwords[hostId] = password
  persist()
}

export function clearHostPassword(hostId: string): void {
  if (!state) throw new Error('vault locked')
  if (hostId in state.payload.passwords) {
    delete state.payload.passwords[hostId]
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
    return { exists, unlocked: isUnlocked() }
  })

  ipcMain.handle('vault:init', (_e, args: { masterPassword: string }) => {
    const pw = args?.masterPassword ?? ''
    if (pw.length === 0) throw new Error('master password cannot be empty')
    if (fs.existsSync(vaultPath())) {
      throw new Error('vault already exists — use unlock or change_password')
    }
    const salt = crypto.randomBytes(SALT_LEN)
    const key = deriveKey(pw, salt)
    const payload = emptyPayload()
    writeVaultFile(fileFromKey(key, salt, payload))
    state = { key, salt, payload }
  })

  ipcMain.handle('vault:unlock', (_e, args: { masterPassword: string }) => {
    const pw = args?.masterPassword ?? ''
    const file = readVaultFile()
    if (!file) throw new Error('vault not initialized')
    const salt = Buffer.from(file.kdf_salt, 'base64')
    if (salt.length !== SALT_LEN) throw new Error('invalid salt length')
    const nonce = Buffer.from(file.nonce, 'base64')
    const ct = Buffer.from(file.ciphertext, 'base64')
    const key = deriveKey(pw, salt)
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
    (_e, args: { oldPassword: string; newPassword: string }) => {
      const oldPw = args?.oldPassword ?? ''
      const newPw = args?.newPassword ?? ''
      if (newPw.length === 0) {
        throw new Error('new master password cannot be empty')
      }
      const file = readVaultFile()
      if (!file) throw new Error('vault not initialized')
      const oldSalt = Buffer.from(file.kdf_salt, 'base64')
      if (oldSalt.length !== SALT_LEN) throw new Error('invalid salt length')
      const oldKey = deriveKey(oldPw, oldSalt)
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
      const newKey = deriveKey(newPw, newSalt)
      writeVaultFile(fileFromKey(newKey, newSalt, payload))
      const oldState = state
      state = { key: newKey, salt: newSalt, payload }
      if (oldState) zero(oldState.key)
    }
  )
}
