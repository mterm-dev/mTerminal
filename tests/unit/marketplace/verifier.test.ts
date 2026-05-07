import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import * as ed25519 from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import {
  verifyPackage,
  signDeterministic,
  getPublicKey,
  deterministicHash,
  bytesToHex,
} from '../../../electron/main/marketplace/verifier'
import { sha256 } from '@noble/hashes/sha256'

if (typeof (ed25519 as { etc?: { sha512Sync?: unknown } }).etc === 'object' && ed25519.etc) {
  ed25519.etc.sha512Sync = (...m: Uint8Array[]) => {
    let total = 0
    for (const a of m) total += a.length
    const out = new Uint8Array(total)
    let off = 0
    for (const a of m) {
      out.set(a, off)
      off += a.length
    }
    return sha512(out)
  }
}

function bytesToB64(b: Uint8Array): string {
  return Buffer.from(b).toString('base64')
}

async function buildPackage(): Promise<{ buf: Uint8Array; entries: Record<string, Uint8Array>; pubB64: string; sigB64: string; sha256Hex: string }> {
  const priv = ed25519.utils.randomPrivateKey()
  const pub = await getPublicKey(priv)
  const entries: Record<string, Uint8Array> = {
    'package.json': new TextEncoder().encode(JSON.stringify({ name: 'demo', version: '1.0.0' })),
    'dist/main.cjs': new TextEncoder().encode('module.exports={}'),
  }
  const sig = await signDeterministic(entries, priv)
  const zipEntries: Record<string, Uint8Array> = { ...entries, 'signature.sig': sig }
  const buf = zipSync(zipEntries)
  const sha = bytesToHex(sha256(buf))
  return { buf, entries, pubB64: bytesToB64(pub), sigB64: bytesToB64(sig), sha256Hex: sha }
}

describe('verifyPackage', () => {
  it('accepts a valid signed package', async () => {
    const { buf, pubB64, sigB64, sha256Hex } = await buildPackage()
    const result = await verifyPackage(buf, sigB64, pubB64, { expectedSha256Hex: sha256Hex })
    expect(result.ok).toBe(true)
    expect(result.entries['package.json']).toBeDefined()
    expect(result.manifestRaw).toContain('"name":"demo"')
  })

  it('rejects when signature is flipped', async () => {
    const { buf, pubB64, sigB64 } = await buildPackage()
    const flippedSig = Buffer.from(sigB64, 'base64')
    flippedSig[0] = flippedSig[0] ^ 0xff
    const result = await verifyPackage(buf, flippedSig.toString('base64'), pubB64)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/signature/)
  })

  it('rejects when sha256 mismatches', async () => {
    const { buf, pubB64, sigB64 } = await buildPackage()
    const result = await verifyPackage(buf, sigB64, pubB64, {
      expectedSha256Hex: '00'.repeat(32),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/sha256/)
  })

  it('detects tampered content', async () => {
    const priv = ed25519.utils.randomPrivateKey()
    const pub = await getPublicKey(priv)
    const original: Record<string, Uint8Array> = {
      'package.json': new TextEncoder().encode('{"name":"demo","version":"1.0.0"}'),
    }
    const sig = await signDeterministic(original, priv)
    const tampered: Record<string, Uint8Array> = {
      'package.json': new TextEncoder().encode('{"name":"demo","version":"9.9.9"}'),
      'signature.sig': sig,
    }
    const buf = zipSync(tampered)
    const result = await verifyPackage(buf, bytesToB64(sig), bytesToB64(pub))
    expect(result.ok).toBe(false)
  })
})

describe('deterministicHash', () => {
  it('is stable regardless of insertion order', () => {
    const a: Record<string, Uint8Array> = {
      'a.txt': new TextEncoder().encode('hello'),
      'b.txt': new TextEncoder().encode('world'),
    }
    const b: Record<string, Uint8Array> = {
      'b.txt': new TextEncoder().encode('world'),
      'a.txt': new TextEncoder().encode('hello'),
    }
    expect(bytesToHex(deterministicHash(a))).toBe(bytesToHex(deterministicHash(b)))
  })

  it('excludes signature.sig from the hash', () => {
    const base: Record<string, Uint8Array> = {
      'a.txt': new TextEncoder().encode('hello'),
    }
    const withSig: Record<string, Uint8Array> = {
      ...base,
      'signature.sig': new TextEncoder().encode('whatever'),
    }
    expect(bytesToHex(deterministicHash(base))).toBe(bytesToHex(deterministicHash(withSig)))
  })
})
