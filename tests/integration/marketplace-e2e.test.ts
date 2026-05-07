import { describe, it, expect } from 'vitest'
import { MarketplaceApiClient } from '../../electron/main/marketplace/api-client'
import { verifyPackage } from '../../electron/main/marketplace/verifier'

const ENDPOINT = process.env.MARKETPLACE_E2E_ENDPOINT ?? 'http://localhost:8787'
const TARGET_ID = 'theme-pack-extra'
const TARGET_VER = '1.0.0'

async function isAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${ENDPOINT}/healthz`)
    return r.ok
  } catch {
    return false
  }
}

describe.skipIf(!process.env.MARKETPLACE_E2E)('marketplace e2e', () => {
  it('publish artefact verifies on client', async () => {
    if (!(await isAvailable())) {
      throw new Error(`worker unreachable at ${ENDPOINT}`)
    }
    const api = new MarketplaceApiClient({ endpoint: ENDPOINT })
    const info = await api.downloadVersionInfo(TARGET_ID, TARGET_VER)
    expect(info.signatureB64).toBeTruthy()
    expect(info.keyId).toBeTruthy()
    expect(info.sha256).toMatch(/^[0-9a-f]{64}$/)
    const buf = await api.fetchPackage(info.url)
    expect(buf.length).toBe(info.sizeBytes)
    const pub = await api.getPublicKey(info.keyId)
    const r = await verifyPackage(buf, info.signatureB64, pub.pubkeyB64, {
      expectedSha256Hex: info.sha256,
    })
    expect(r.reason).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.entries['package.json']).toBeDefined()
    expect(r.manifestRaw).toContain(TARGET_ID)
  })
})
