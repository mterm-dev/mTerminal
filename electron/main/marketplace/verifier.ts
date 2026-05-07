import * as ed25519 from '@noble/ed25519'
import { sha256 } from '@noble/hashes/sha256'
import { sha512 } from '@noble/hashes/sha512'
import { safeUnzip } from './unzip'

if (typeof (ed25519 as { etc?: { sha512Sync?: unknown } }).etc === 'object' && ed25519.etc) {
  ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(concat(m))
}

function concat(arrays: Uint8Array[]): Uint8Array {
  let total = 0
  for (const a of arrays) total += a.length
  const out = new Uint8Array(total)
  let off = 0
  for (const a of arrays) {
    out.set(a, off)
    off += a.length
  }
  return out
}

const SIG_ENTRY = 'signature.sig'

export interface VerifyResult {
  ok: boolean
  reason?: string
  entries: Record<string, Uint8Array>
  manifestRaw: string | null
}

export function bytesToHex(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i++) {
    s += buf[i].toString(16).padStart(2, '0')
  }
  return s
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length % 2 !== 0) throw new Error('invalid hex')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64') : null
  if (bin) return new Uint8Array(bin)
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function deterministicHashHex(entries: Record<string, Uint8Array>): string {
  const names = Object.keys(entries)
    .filter((n) => n !== SIG_ENTRY)
    .sort()
  const parts: string[] = []
  for (const name of names) {
    const h = sha256(entries[name])
    parts.push(`${name} ${bytesToHex(h)}\n`)
  }
  const joined = parts.join('')
  return bytesToHex(sha256(new TextEncoder().encode(joined)))
}

export function deterministicHash(entries: Record<string, Uint8Array>): Uint8Array {
  return new TextEncoder().encode(deterministicHashHex(entries))
}

export interface VerifyPackageOptions {
  expectedSha256Hex?: string
}

export async function verifyPackage(
  buf: Uint8Array,
  signatureB64: string,
  pubkeyB64: string,
  opts: VerifyPackageOptions = {},
): Promise<VerifyResult> {
  if (opts.expectedSha256Hex) {
    const actual = bytesToHex(sha256(buf))
    if (actual.toLowerCase() !== opts.expectedSha256Hex.toLowerCase()) {
      return { ok: false, reason: 'sha256 mismatch', entries: {}, manifestRaw: null }
    }
  }

  let unzipped: Record<string, Uint8Array>
  try {
    unzipped = safeUnzip(buf).entries
  } catch (err) {
    return { ok: false, reason: (err as Error).message, entries: {}, manifestRaw: null }
  }

  const sig = base64ToBytes(signatureB64)
  const pub = base64ToBytes(pubkeyB64)
  const hash = deterministicHash(unzipped)

  let valid = false
  try {
    valid = await ed25519.verifyAsync(sig, hash, pub)
  } catch {
    valid = false
  }
  if (!valid) {
    return { ok: false, reason: 'signature invalid', entries: unzipped, manifestRaw: null }
  }

  const manifestEntry = unzipped['package.json']
  const manifestRaw = manifestEntry ? new TextDecoder().decode(manifestEntry) : null

  return { ok: true, entries: unzipped, manifestRaw }
}

export async function signDeterministic(
  entries: Record<string, Uint8Array>,
  privKey: Uint8Array,
): Promise<Uint8Array> {
  const message = new TextEncoder().encode(deterministicHashHex(entries))
  return ed25519.signAsync(message, privKey)
}

export async function getPublicKey(privKey: Uint8Array): Promise<Uint8Array> {
  return ed25519.getPublicKeyAsync(privKey)
}
