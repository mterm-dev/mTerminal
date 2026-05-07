import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Installer } from '../../electron/main/marketplace/installer'
import { MarketplaceApiClient } from '../../electron/main/marketplace/api-client'
import { MarketplaceStore } from '../../electron/main/marketplace/store'

const ENDPOINT = process.env.MARKETPLACE_E2E_ENDPOINT ?? 'http://127.0.0.1:8787'

async function isAvailable(): Promise<boolean> {
  try {
    const r = await fetch(`${ENDPOINT}/healthz`)
    return r.ok
  } catch {
    return false
  }
}

function createInstaller(tmp: string) {
  const api = new MarketplaceApiClient({ endpoint: ENDPOINT })
  const store = new MarketplaceStore({
    home: tmp,
    platform: 'linux',
    env: { XDG_CONFIG_HOME: tmp },
    appVersion: '0.1.0',
  })
  const fakeHost = {
    registry: { list: () => [] },
    scanAndSync: async () => {},
    setTrusted: async () => {},
    activate: async () => {},
    uninstall: async () => {},
  }
  return new Installer({
    api,
    store,
    getHost: () => fakeHost as unknown as import('../../electron/main/extensions/host').ExtensionHostMain,
  })
}

describe.skipIf(!process.env.MARKETPLACE_E2E)('installer e2e', () => {
  beforeAll(async () => {
    if (!(await isAvailable())) throw new Error(`worker unreachable at ${ENDPOINT}`)
  })

  it('downloads, verifies, and writes extension to user dir', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-installer-e2e-'))
    process.env.HOME = tmp
    const electron = await import('electron')
    ;(electron.app as { getPath: (k: string) => string }).getPath = (k: string) =>
      k === 'home' ? tmp : tmp

    const installer = createInstaller(tmp)

    const events: string[] = []
    const result = await installer.install('theme-pack-extra', undefined, {
      onProgress: (e) => events.push(e.kind),
    })

    expect(result.id).toBe('theme-pack-extra')
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(events).toContain('verifying')
    expect(events).toContain('extracting')
    expect(events).toContain('done')

    const extDir = path.join(tmp, '.mterminal', 'extensions', 'theme-pack-extra')
    expect(fs.existsSync(extDir)).toBe(true)
    expect(fs.existsSync(path.join(extDir, 'package.json'))).toBe(true)
    const themesDir = path.join(extDir, 'themes')
    expect(fs.existsSync(themesDir)).toBe(true)
    const themeFiles = fs.readdirSync(themesDir)
    expect(themeFiles.length).toBeGreaterThan(0)
    const sigPath = path.join(extDir, 'signature.sig')
    expect(fs.existsSync(sigPath)).toBe(false)
  }, 30_000)

  it('installs two different extensions into the same user dir', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-installer-multi-'))
    process.env.HOME = tmp
    const electron = await import('electron')
    ;(electron.app as { getPath: (k: string) => string }).getPath = (k: string) =>
      k === 'home' ? tmp : tmp

    const installer = createInstaller(tmp)

    const first = await installer.install('theme-pack-extra')
    expect(first.id).toBe('theme-pack-extra')

    const second = await installer.install('error-linkifier')
    expect(second.id).toBe('error-linkifier')

    const extRoot = path.join(tmp, '.mterminal', 'extensions')
    expect(fs.existsSync(path.join(extRoot, 'theme-pack-extra', 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(extRoot, 'error-linkifier', 'package.json'))).toBe(true)

    const installed = fs.readdirSync(extRoot).sort()
    expect(installed).toEqual(['error-linkifier', 'theme-pack-extra'])
  }, 60_000)
})
