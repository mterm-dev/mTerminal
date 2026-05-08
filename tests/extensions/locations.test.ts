import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'node:path'

vi.mock('electron', () => {
  const app = {
    getPath: (k: string) => (k === 'home' ? '/home/test' : '/tmp'),
    isPackaged: false,
  }
  return { app, default: { app } }
})

async function loadLocations() {
  vi.resetModules()
  return await import('../../electron/main/extensions/locations')
}

async function getApp() {
  const electron = await import('electron')
  return electron.app as unknown as { isPackaged: boolean }
}

describe('extensions/locations userRoot dev vs prod split', () => {
  let originalIsPackaged: boolean

  beforeEach(async () => {
    const app = await getApp()
    originalIsPackaged = app.isPackaged
  })

  afterEach(async () => {
    const app = await getApp()
    app.isPackaged = originalIsPackaged
  })

  it('uses .mterminal-dev under home when not packaged', async () => {
    const app = await getApp()
    app.isPackaged = false
    const loc = await loadLocations()
    expect(loc.userDirName()).toBe('.mterminal-dev')
    expect(loc.userRoot()).toBe(path.join('/home/test', '.mterminal-dev'))
    expect(loc.userExtensionsDir()).toBe(
      path.join('/home/test', '.mterminal-dev', 'extensions'),
    )
    expect(loc.trustFilePath()).toBe(
      path.join('/home/test', '.mterminal-dev', 'trust.json'),
    )
    expect(loc.disabledFilePath()).toBe(
      path.join('/home/test', '.mterminal-dev', 'disabled.json'),
    )
    expect(loc.extensionDataDir('foo')).toBe(
      path.join('/home/test', '.mterminal-dev', 'data', 'foo'),
    )
  })

  it('uses .mterminal under home when packaged', async () => {
    const app = await getApp()
    app.isPackaged = true
    const loc = await loadLocations()
    expect(loc.userDirName()).toBe('.mterminal')
    expect(loc.userRoot()).toBe(path.join('/home/test', '.mterminal'))
    expect(loc.userExtensionsDir()).toBe(
      path.join('/home/test', '.mterminal', 'extensions'),
    )
  })

  it('switches dynamically when isPackaged flips between calls', async () => {
    const app = await getApp()
    const loc = await loadLocations()
    app.isPackaged = false
    expect(loc.userRoot()).toBe(path.join('/home/test', '.mterminal-dev'))
    app.isPackaged = true
    expect(loc.userRoot()).toBe(path.join('/home/test', '.mterminal'))
  })
})
