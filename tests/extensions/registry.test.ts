import { describe, expect, it, vi } from 'vitest'
import { ExtensionRegistry } from '../../electron/main/extensions/registry'
import type { ExtensionManifest } from '../../electron/main/extensions/manifest'

function fakeManifest(id: string): ExtensionManifest {
  return {
    id,
    packageName: `mterminal-plugin-${id}`,
    version: '1.0.0',
    mainEntry: null,
    rendererEntry: '/tmp/x.mjs',
    apiVersionRange: '*',
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
    },
    source: 'user',
    extensionPath: `/tmp/${id}`,
  }
}

describe('ExtensionRegistry', () => {
  it('emits added when an extension first lands', () => {
    const reg = new ExtensionRegistry()
    const events: unknown[] = []
    reg.on((e) => events.push(e))
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    expect(events.some((e) => (e as { type: string }).type === 'added')).toBe(true)
  })

  it('emits manifest-updated when re-adding', () => {
    const reg = new ExtensionRegistry()
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    const events: unknown[] = []
    reg.on((e) => events.push(e))
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    expect(events.some((e) => (e as { type: string }).type === 'manifest-updated')).toBe(true)
  })

  it('tracks state transitions', () => {
    const reg = new ExtensionRegistry()
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    const cb = vi.fn()
    reg.on(cb)
    reg.setState('foo', 'activating')
    reg.setState('foo', 'active')
    expect(cb).toHaveBeenCalledTimes(2)
    expect(reg.get('foo')?.state).toBe('active')
    expect(reg.get('foo')?.activatedAt).toBeTypeOf('number')
  })

  it('toggles enabled and disabled state', () => {
    const reg = new ExtensionRegistry()
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    reg.setEnabled('foo', false)
    expect(reg.get('foo')?.enabled).toBe(false)
    expect(reg.get('foo')?.state).toBe('disabled')
    reg.setEnabled('foo', true)
    expect(reg.get('foo')?.state).toBe('installed')
  })

  it('records errors', () => {
    const reg = new ExtensionRegistry()
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    reg.setError('foo', new Error('bang'))
    expect(reg.get('foo')?.lastError?.message).toBe('bang')
    expect(reg.get('foo')?.state).toBe('error')
  })

  it('removes', () => {
    const reg = new ExtensionRegistry()
    reg.add(fakeManifest('foo'), { enabled: true, trusted: true })
    reg.remove('foo')
    expect(reg.has('foo')).toBe(false)
  })
})
