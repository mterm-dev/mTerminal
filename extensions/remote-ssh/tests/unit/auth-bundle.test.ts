import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import {
  buildAuthBundle,
  secretKeyForHost,
  readPrivateKey,
  type SecretReader,
} from '../../src/lib/auth-bundle'
import type { HostMeta } from '../../src/shared/types'

function fakeSecrets(values: Record<string, string>): SecretReader {
  return {
    get: async (key) => values[key] ?? null,
  }
}

const baseHost: HostMeta = {
  id: 'h_1',
  name: 'srv',
  host: 'example.com',
  port: 22,
  user: 'root',
  auth: 'key',
  identityPath: '/missing',
  savePassword: false,
}

describe('secretKeyForHost', () => {
  it('namespaces by hostId', () => {
    expect(secretKeyForHost('abc')).toBe('host:abc')
  })
})

describe('buildAuthBundle', () => {
  it('builds a key bundle with identityPath', async () => {
    const bundle = await buildAuthBundle({ ...baseHost, auth: 'key', identityPath: '/k' }, fakeSecrets({}))
    expect(bundle.auth).toBe('key')
    expect(bundle.identityPath).toBe('/k')
    expect(bundle.password).toBeUndefined()
  })

  it('throws EHOSTAUTH when key auth has no identityPath', async () => {
    await expect(
      buildAuthBundle({ ...baseHost, auth: 'key', identityPath: undefined }, fakeSecrets({})),
    ).rejects.toMatchObject({ code: 'EHOSTAUTH' })
  })

  it('throws EVAULTLOCKED when password auth without savePassword', async () => {
    await expect(
      buildAuthBundle({ ...baseHost, auth: 'password', savePassword: false }, fakeSecrets({})),
    ).rejects.toMatchObject({ code: 'EVAULTLOCKED' })
  })

  it('throws EVAULTLOCKED when password is missing in secrets', async () => {
    await expect(
      buildAuthBundle(
        { ...baseHost, auth: 'password', savePassword: true },
        fakeSecrets({}),
      ),
    ).rejects.toMatchObject({ code: 'EVAULTLOCKED' })
  })

  it('builds password bundle when secret is present', async () => {
    const bundle = await buildAuthBundle(
      { ...baseHost, auth: 'password', savePassword: true },
      fakeSecrets({ 'host:h_1': 's3cret' }),
    )
    expect(bundle.auth).toBe('password')
    expect(bundle.password).toBe('s3cret')
    expect(bundle.identityPath).toBeUndefined()
  })

  it('builds agent bundle without secrets', async () => {
    const bundle = await buildAuthBundle({ ...baseHost, auth: 'agent' }, fakeSecrets({}))
    expect(bundle.auth).toBe('agent')
    expect(bundle.password).toBeUndefined()
  })
})

describe('readPrivateKey', () => {
  let tmpFile: string

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `key-${Date.now()}-${Math.random()}.pem`)
    await fsp.writeFile(tmpFile, 'PRIVKEY-CONTENT')
  })

  afterEach(async () => {
    try {
      await fsp.unlink(tmpFile)
    } catch {
      // ignore
    }
  })

  it('reads existing key file', async () => {
    const buf = await readPrivateKey(tmpFile)
    expect(buf.toString()).toBe('PRIVKEY-CONTENT')
  })

  it('throws EHOSTAUTH for non-existent file', async () => {
    await expect(readPrivateKey('/nope/missing/key')).rejects.toMatchObject({
      code: 'EHOSTAUTH',
    })
  })
})
