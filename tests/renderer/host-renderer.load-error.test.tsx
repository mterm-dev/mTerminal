import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/extensions/module-loader', () => ({
  loadPluginRendererModule: vi.fn(),
}))

vi.mock('../../src/extensions/ctx', () => ({
  createRendererCtx: vi.fn(() => ({
    ctx: { subscribe: vi.fn() },
    dispose: vi.fn(async () => {}),
  })),
}))

vi.mock('../../src/extensions/registries/commands', () => ({
  getCommandRegistry: () => ({ registerStub: vi.fn() }),
}))

vi.mock('../../src/extensions/registries/themes', () => ({
  getThemeRegistry: () => ({ register: vi.fn() }),
}))

vi.mock('../../src/extensions/registries/settings-schema', () => ({
  getSettingsSchemaRegistry: () => ({ register: vi.fn() }),
}))

vi.mock('../../src/extensions/event-bus', () => ({
  getRendererEventBus: () => ({ on: vi.fn(), emit: vi.fn() }),
}))

vi.mock('../../src/extensions/trust-flow', () => ({
  getTrustQueue: () => ({ request: vi.fn(async () => ({ trusted: true })) }),
  persistTrust: vi.fn(async () => {}),
}))

import { ExtensionHostRenderer, type ManifestRecord, type ManifestSnapshot } from '../../src/extensions/host-renderer'
import { loadPluginRendererModule } from '../../src/extensions/module-loader'

function makeManifest(overrides: Partial<ManifestRecord> = {}): ManifestRecord {
  return {
    id: 'broken-ext',
    packageName: 'broken-ext',
    version: '1.0.0',
    displayName: 'Broken Ext',
    description: '',
    author: '',
    icon: '',
    mainEntry: null,
    rendererEntry: '/abs/path/to/broken-ext/dist/renderer.js',
    apiVersionRange: '^1.0.0',
    activationEvents: [],
    capabilities: [],
    enabledApiProposals: [],
    providedServices: {},
    consumedServices: {},
    contributes: {
      commands: [],
      keybindings: [],
      settings: null,
      panels: [],
      statusBar: [],
      contextMenu: [],
      tabTypes: [],
      decorators: [],
      themes: [],
      providers: [],
      secrets: [],
      aiBindings: [],
    },
    source: 'user',
    extensionPath: '/abs/path/to/broken-ext',
    ...overrides,
  }
}

function makeSnapshot(): ManifestSnapshot {
  return {
    manifest: makeManifest(),
    state: 'installed',
    enabled: true,
    trusted: true,
    lastError: null,
    activatedAt: null,
  }
}

describe('ExtensionHostRenderer renderer-load failure path', () => {
  let reportLoadError: ReturnType<typeof vi.fn>
  let notificationSend: ReturnType<typeof vi.fn>
  let listManifests: ReturnType<typeof vi.fn>

  beforeEach(() => {
    reportLoadError = vi.fn(async () => ({ ok: true }))
    notificationSend = vi.fn(async () => true)
    listManifests = vi.fn(async () => [makeSnapshot()])

    vi.stubGlobal('window', {
      mt: {
        ext: {
          listManifests,
          reportLoadError,
        },
        notification: {
          send: notificationSend,
        },
      },
    })
    ;(loadPluginRendererModule as unknown as ReturnType<typeof vi.fn>).mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports load failure to main and fires exactly one notification on retry', async () => {
    const boom = new Error('Cannot find module bare-import')
    boom.stack = 'at moduleLoader (mt-ext://broken-ext/dist/renderer.js:1)'
    ;(loadPluginRendererModule as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(boom)

    const host = new ExtensionHostRenderer()
    await host.loadManifests()

    await expect(host.activate('broken-ext')).rejects.toThrow('Cannot find module bare-import')

    expect(reportLoadError).toHaveBeenCalledTimes(1)
    expect(reportLoadError).toHaveBeenCalledWith(
      'broken-ext',
      'Cannot find module bare-import',
      'at moduleLoader (mt-ext://broken-ext/dist/renderer.js:1)',
    )
    expect(notificationSend).toHaveBeenCalledTimes(1)
    expect(notificationSend).toHaveBeenCalledWith({
      title: 'Extension failed to load',
      body: 'Broken Ext: Cannot find module bare-import',
    })

    expect(host.isActive('broken-ext')).toBe(false)

    await expect(host.activate('broken-ext')).rejects.toThrow('Cannot find module bare-import')

    expect(reportLoadError).toHaveBeenCalledTimes(2)
    expect(notificationSend).toHaveBeenCalledTimes(1)
  })

  it('does not register the extension as active when the renderer module fails to load', async () => {
    ;(loadPluginRendererModule as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    )

    const host = new ExtensionHostRenderer()
    await host.loadManifests()

    await expect(host.activate('broken-ext')).rejects.toThrow('boom')

    expect(host.isActive('broken-ext')).toBe(false)
  })
})
