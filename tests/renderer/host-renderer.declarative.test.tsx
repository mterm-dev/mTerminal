import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const busHoist = vi.hoisted(() => {
  const listeners: Array<{ event: string; cb: (payload: unknown, origin: string) => void }> = []
  return {
    listeners,
    fakeBus: {
      on(event: string, cb: (payload: unknown, origin: string) => void) {
        listeners.push({ event, cb })
        return () => {
          const i = listeners.findIndex((l) => l.event === event && l.cb === cb)
          if (i >= 0) listeners.splice(i, 1)
        }
      },
      emit: vi.fn(),
    },
  }
})

vi.mock('../../src/extensions/module-loader', () => ({
  loadPluginRendererModule: vi.fn(),
}))

vi.mock('../../src/extensions/ctx', () => ({
  createRendererCtx: vi.fn(() => ({
    ctx: { subscribe: vi.fn() },
    dispose: vi.fn(async () => {}),
  })),
}))

vi.mock('../../src/extensions/trust-flow', () => ({
  getTrustQueue: () => ({ request: vi.fn(async () => ({ trusted: true })) }),
  persistTrust: vi.fn(async () => {}),
}))

vi.mock('../../src/extensions/event-bus', () => ({
  getRendererEventBus: () => busHoist.fakeBus,
}))

import {
  ExtensionHostRenderer,
  type ManifestRecord,
  type ManifestSnapshot,
} from '../../src/extensions/host-renderer'
import { getCommandRegistry } from '../../src/extensions/registries/commands'
import { getSettingsSchemaRegistry } from '../../src/extensions/registries/settings-schema'
import { getThemeRegistry } from '../../src/extensions/registries/themes'

function makeManifest(overrides: Partial<ManifestRecord> = {}): ManifestRecord {
  return {
    id: 'ext-a',
    packageName: 'ext-a',
    version: '1.0.0',
    displayName: 'Extension A',
    description: '',
    author: '',
    icon: '',
    mainEntry: null,
    rendererEntry: null,
    apiVersionRange: '^1.0.0',
    activationEvents: [],
    capabilities: [],
    enabledApiProposals: [],
    providedServices: {},
    consumedServices: {},
    contributes: {
      commands: [{ id: 'ext-a.do', title: 'Do thing' }],
      keybindings: [],
      settings: { type: 'object', properties: {} },
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
    extensionPath: '/abs/path/ext-a',
    ...overrides,
  }
}

function makeSnapshot(m: ManifestRecord, enabled = true): ManifestSnapshot {
  return {
    manifest: m,
    state: 'installed',
    enabled,
    trusted: true,
    lastError: null,
    activatedAt: null,
  }
}

const fireBus = (event: string, payload: unknown): void => {
  for (const l of busHoist.listeners.slice()) {
    if (l.event === event) l.cb(payload, 'main')
  }
}

const tick = async (times = 3): Promise<void> => {
  for (let i = 0; i < times; i++) {
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('ExtensionHostRenderer declarative lifecycle', () => {
  const trackedIds = new Set<string>()
  let manifests: ManifestSnapshot[]

  beforeEach(() => {
    manifests = []
    busHoist.listeners.length = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ cssVars: {}, xterm: {} }),
      })),
    )

    vi.stubGlobal('window', {
      mt: {
        ext: {
          listManifests: vi.fn(async () =>
            manifests.map((s) => ({ ...s, manifest: { ...s.manifest } })),
          ),
          reportLoadError: vi.fn(async () => ({ ok: true })),
        },
        notification: { send: vi.fn(async () => true) },
      },
    })
  })

  afterEach(() => {
    for (const id of trackedIds) {
      getCommandRegistry().removeBySource(id)
      getSettingsSchemaRegistry().removeByExt(id)
      getThemeRegistry().removeBySource(id)
    }
    trackedIds.clear()
    vi.unstubAllGlobals()
  })

  const track = (id: string): void => {
    trackedIds.add(id)
  }

  it('registers declarative contributions for each manifest at boot', async () => {
    track('boot-a')
    track('boot-b')
    manifests = [
      makeSnapshot(
        makeManifest({
          id: 'boot-a',
          contributes: { ...makeManifest().contributes, commands: [{ id: 'boot-a.do' }] },
        }),
      ),
      makeSnapshot(
        makeManifest({
          id: 'boot-b',
          contributes: { ...makeManifest().contributes, commands: [{ id: 'boot-b.run' }] },
        }),
      ),
    ]

    const host = new ExtensionHostRenderer()
    await host.boot()

    expect(getCommandRegistry().has('boot-a.do')).toBe(true)
    expect(getCommandRegistry().has('boot-b.run')).toBe(true)
    expect(getSettingsSchemaRegistry().get('boot-a')).toBeDefined()
    expect(getSettingsSchemaRegistry().get('boot-b')).toBeDefined()
  })

  it('applies declarative contributions for newly installed extension via bus event', async () => {
    track('install-base')
    track('install-new')
    manifests = [makeSnapshot(makeManifest({ id: 'install-base' }))]

    const host = new ExtensionHostRenderer()
    await host.boot()

    expect(getCommandRegistry().has('install-new.cmd')).toBe(false)

    manifests = [
      ...manifests,
      makeSnapshot(
        makeManifest({
          id: 'install-new',
          contributes: {
            ...makeManifest().contributes,
            commands: [{ id: 'install-new.cmd', title: 'Cmd' }],
          },
        }),
      ),
    ]

    fireBus('extension:activated', { id: 'install-new' })
    await tick()

    expect(getCommandRegistry().has('install-new.cmd')).toBe(true)
    expect(getSettingsSchemaRegistry().get('install-new')).toBeDefined()
  })

  it('is idempotent across repeated activated events', async () => {
    track('idem')
    manifests = [
      makeSnapshot(
        makeManifest({
          id: 'idem',
          contributes: { ...makeManifest().contributes, commands: [{ id: 'idem.do' }] },
        }),
      ),
    ]

    const host = new ExtensionHostRenderer()
    await host.boot()

    const baseline = getCommandRegistry().list().filter((c) => c.source === 'idem').length

    fireBus('extension:activated', { id: 'idem' })
    await tick()
    fireBus('extension:activated', { id: 'idem' })
    await tick()

    const after = getCommandRegistry().list().filter((c) => c.source === 'idem').length
    expect(after).toBe(baseline)
  })

  it('sweeps declarative contributions when extension disappears from snapshots', async () => {
    track('gone')
    manifests = [
      makeSnapshot(
        makeManifest({
          id: 'gone',
          contributes: { ...makeManifest().contributes, commands: [{ id: 'gone.cmd' }] },
        }),
      ),
    ]

    const host = new ExtensionHostRenderer()
    await host.boot()

    expect(getCommandRegistry().has('gone.cmd')).toBe(true)
    expect(getSettingsSchemaRegistry().get('gone')).toBeDefined()

    manifests = []
    fireBus('extension:deactivated', { id: 'gone' })
    await tick()

    expect(getCommandRegistry().has('gone.cmd')).toBe(false)
    expect(getSettingsSchemaRegistry().get('gone')).toBeUndefined()
  })

  it('skips a theme fetch that resolves after uninstall', async () => {
    track('race')
    let resolveFetch: (v: unknown) => void = () => {}
    const fetchPromise = new Promise((res) => {
      resolveFetch = res
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => fetchPromise),
    )

    manifests = [
      makeSnapshot(
        makeManifest({
          id: 'race',
          contributes: {
            ...makeManifest().contributes,
            commands: [],
            themes: [{ id: 'race-theme', label: 'Race', path: 'themes/race.json' }],
          },
        }),
      ),
    ]

    const host = new ExtensionHostRenderer()
    await host.boot()

    manifests = []
    fireBus('extension:deactivated', { id: 'race' })
    await tick()

    resolveFetch({ ok: true, json: async () => ({ cssVars: {}, xterm: {} }) })
    await tick()

    expect(getThemeRegistry().get('race-theme')).toBeUndefined()
  })

  it('fires a restart-required desktop notification once', async () => {
    track('native-ext')
    manifests = [makeSnapshot(makeManifest({ id: 'native-ext' }))]

    const host = new ExtensionHostRenderer()
    await host.boot()

    fireBus('extension:restart-required', { id: 'native-ext', version: '2.0.0' })
    await tick()
    fireBus('extension:restart-required', { id: 'native-ext', version: '2.0.0' })
    await tick()

    const send = window.mt.notification.send as ReturnType<typeof vi.fn>
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({
      title: 'Restart required',
      body: expect.stringContaining('native modules'),
    })
  })
})
