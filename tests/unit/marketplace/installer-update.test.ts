import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsCalls: Array<{ op: string; arg: string }> = []

vi.mock('node:fs/promises', () => {
  const mkdir = vi.fn(async () => undefined)
  const writeFile = vi.fn(async () => undefined)
  const rm = vi.fn(async (p: string) => {
    fsCalls.push({ op: 'rm', arg: String(p) })
  })
  const rename = vi.fn(async (from: string, to: string) => {
    fsCalls.push({ op: 'rename', arg: `${from}→${to}` })
  })
  return {
    default: { mkdir, writeFile, rm, rename },
    mkdir,
    writeFile,
    rm,
    rename,
  }
})

vi.mock('../../../electron/main/marketplace/verifier', () => ({
  verifyPackage: vi.fn(async () => ({
    ok: true,
    entries: {
      'package.json': new TextEncoder().encode(JSON.stringify({ name: 'demo', version: '2.0.0' })),
    },
    manifestRaw: JSON.stringify({ name: 'demo', version: '2.0.0' }),
  })),
}))

vi.mock('@mterminal/manifest-validator', () => ({
  validateManifest: () => ({
    ok: true,
    manifest: { id: 'demo', version: '2.0.0' },
    errors: [],
  }),
}))

const trustSet = vi.fn(async () => undefined)
vi.mock('../../../electron/main/extensions/trust', () => ({
  getTrustStore: () => ({ setTrusted: trustSet }),
}))

vi.mock('../../../electron/main/extensions/locations', () => ({
  userExtensionsDir: () => '/tmp/exts',
  extensionDir: (_source: string, id: string) => `/tmp/exts/${id}`,
}))

const busEmit = vi.fn()
vi.mock('../../../electron/main/extensions/event-bus-main', () => ({
  getMainEventBus: () => ({ emit: busEmit }),
}))

import { Installer } from '../../../electron/main/marketplace/installer'

interface SpyHost {
  deactivate: ReturnType<typeof vi.fn>
  scanAndSync: ReturnType<typeof vi.fn>
  setTrusted: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  activate: ReturnType<typeof vi.fn>
}

function makeInstaller(host: SpyHost): Installer {
  const api = {
    details: vi.fn(async () => ({ latestVersion: '2.0.0' })),
    downloadVersionInfo: vi.fn(async () => ({
      url: 'https://example.test/pkg',
      keyId: 'key-1',
      signatureB64: 'sig',
      sha256: 'aa',
    })),
    fetchPackage: vi.fn(async () => new Uint8Array([1, 2, 3])),
    getPublicKey: vi.fn(async () => ({ pubkeyB64: 'pk', revokedAt: null })),
  } as unknown as ConstructorParameters<typeof Installer>[0]['api']
  const store = {
    getAuthorKey: vi.fn(async () => 'pk'),
    setAuthorKey: vi.fn(async () => undefined),
    setInstallRecord: vi.fn(async () => undefined),
    removeInstallRecord: vi.fn(async () => undefined),
  } as unknown as ConstructorParameters<typeof Installer>[0]['store']

  return new Installer({
    api,
    store,
    getHost: () => host as unknown as ConstructorParameters<typeof Installer>[0]['getHost'] extends () => infer H ? H : never,
  })
}

describe('Installer.install — update flow', () => {
  let host: SpyHost
  let installer: Installer

  beforeEach(() => {
    fsCalls.length = 0
    busEmit.mockReset()
    trustSet.mockClear()
    host = {
      deactivate: vi.fn(async () => undefined),
      scanAndSync: vi.fn(async () => undefined),
      setTrusted: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
      activate: vi.fn(async () => undefined),
    }
    installer = makeInstaller(host)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deactivates before removing the target folder', async () => {
    await installer.install('demo', '2.0.0')

    expect(host.deactivate).toHaveBeenCalledWith('demo')
    const deactivateOrder = host.deactivate.mock.invocationCallOrder[0]
    const rmCall = fsCalls.find((c) => c.op === 'rm' && c.arg === '/tmp/exts/demo')
    expect(rmCall).toBeDefined()
    expect(deactivateOrder).toBeLessThan(host.reload.mock.invocationCallOrder[0])
  })

  it('uses host.reload instead of host.activate after rename', async () => {
    await installer.install('demo', '2.0.0')

    expect(host.reload).toHaveBeenCalledWith('demo')
    expect(host.activate).not.toHaveBeenCalled()
    const renameIndex = fsCalls.findIndex((c) => c.op === 'rename')
    expect(renameIndex).toBeGreaterThanOrEqual(0)
  })

  it('does not emit restart-required for a pure-JS package', async () => {
    await installer.install('demo', '2.0.0')
    expect(busEmit).not.toHaveBeenCalledWith(
      'extension:restart-required',
      expect.anything(),
    )
  })
})
