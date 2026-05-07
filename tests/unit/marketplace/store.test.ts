import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MarketplaceStore, configRoot, defaultStoreState, storeFilePath } from '../../../electron/main/marketplace/store'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-mp-store-'))
})

afterEach(() => {
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  } catch {}
})

describe('configRoot', () => {
  it('uses XDG_CONFIG_HOME on linux', () => {
    expect(configRoot('/home/u', 'linux', { XDG_CONFIG_HOME: '/x/cfg' })).toBe('/x/cfg/mterminal')
    expect(configRoot('/home/u', 'linux', {})).toBe('/home/u/.config/mterminal')
  })

  it('uses Application Support on darwin', () => {
    expect(configRoot('/Users/u', 'darwin', {})).toBe('/Users/u/Library/Application Support/mterminal')
  })

  it('uses APPDATA on win32', () => {
    expect(configRoot('C:/Users/u', 'win32', { APPDATA: 'C:/Users/u/AppData/Roaming' })).toBe(
      'C:/Users/u/AppData/Roaming/mterminal',
    )
  })
})

describe('storeFilePath', () => {
  it('joins with marketplace.json', () => {
    expect(storeFilePath('/h', 'linux', { XDG_CONFIG_HOME: '/x' })).toBe('/x/mterminal/marketplace.json')
  })
})

describe('defaultStoreState', () => {
  it('returns canonical defaults', () => {
    const s = defaultStoreState('1.2.3')
    expect(s.lastUpdateCheck).toBeNull()
    expect(s.onboardingDone).toBe(false)
    expect(s.installRecords).toEqual({})
    expect(s.knownAuthorKeys).toEqual({})
    expect(s.appVersionAtLastBoot).toBe('1.2.3')
  })
})

describe('MarketplaceStore', () => {
  it('returns defaults when file does not exist', async () => {
    const s = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    const state = await s.load()
    expect(state.onboardingDone).toBe(false)
    expect(state.appVersionAtLastBoot).toBe('0.1.0')
  })

  it('persists install records', async () => {
    const s = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    await s.load()
    await s.setInstallRecord('foo', { installedAt: 123, version: '1.0.0' })
    const fresh = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    const reloaded = await fresh.load()
    expect(reloaded.installRecords.foo).toEqual({ installedAt: 123, version: '1.0.0' })
  })

  it('marks onboarding done', async () => {
    const s = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    await s.update({ onboardingDone: true })
    const fresh = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    const state = await fresh.load()
    expect(state.onboardingDone).toBe(true)
  })

  it('caches and retrieves author keys', async () => {
    const s = new MarketplaceStore({
      home: tmpHome,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmpHome },
      appVersion: '0.1.0',
    })
    await s.setAuthorKey('k1', 'pub1')
    expect(await s.getAuthorKey('k1')).toBe('pub1')
    expect(await s.getAuthorKey('missing')).toBeNull()
  })
})
