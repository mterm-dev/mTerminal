import { describe, it, expect } from 'vitest'
import { isNewer, UpdatesManager } from '../../../electron/main/marketplace/updates'
import { MarketplaceApiClient } from '../../../electron/main/marketplace/api-client'

describe('isNewer', () => {
  it('detects newer versions', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(true)
    expect(isNewer('1.0.0', '2.0.0')).toBe(true)
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isNewer('2.0.0', '1.0.0')).toBe(false)
  })

  it('returns false for invalid versions', () => {
    expect(isNewer('garbage', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0', 'garbage')).toBe(false)
  })
})

interface RegistryRecord {
  manifest: { id: string; version: string; source: 'user' | 'built-in'; displayName?: string; description?: string }
}

class FakeRegistry {
  constructor(private records: RegistryRecord[]) {}
  list(): RegistryRecord[] {
    return this.records
  }
}

class FakeStore {
  state = {
    lastUpdateCheck: null as number | null,
    onboardingDone: false,
    installRecords: {},
    knownAuthorKeys: {},
    appVersionAtLastBoot: '0.0.0',
  }
  async update(patch: Record<string, unknown>) {
    this.state = { ...this.state, ...patch } as typeof this.state
    return this.state
  }
}

describe('UpdatesManager.refresh', () => {
  it('returns updates when latestVersion is greater', async () => {
    const fetchImpl: typeof fetch = (async () => {
      return new Response(
        JSON.stringify({
          items: [
            {
              id: 'foo',
              displayName: 'foo',
              description: 'd',
              category: 'other',
              latestVersion: '1.1.0',
              downloadTotal: 0,
              ratingCount: 0,
              authorLogin: 'a',
              recommended: false,
              apiRange: '*',
            },
            {
              id: 'bar',
              displayName: 'bar',
              description: 'd',
              category: 'other',
              latestVersion: '1.0.0',
              downloadTotal: 0,
              ratingCount: 0,
              authorLogin: 'a',
              recommended: false,
              apiRange: '*',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 50,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const api = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl })
    const store = new FakeStore() as unknown as import('../../../electron/main/marketplace/store').MarketplaceStore
    const registry = new FakeRegistry([
      { manifest: { id: 'foo', version: '1.0.0', source: 'user', displayName: 'foo', description: 'd' } },
      { manifest: { id: 'bar', version: '1.0.0', source: 'user', displayName: 'bar', description: 'd' } },
    ])
    const host = { registry } as unknown as import('../../../electron/main/extensions/host').ExtensionHostMain
    const mgr = new UpdatesManager({ api, store, getHost: () => host })
    const result = await mgr.refresh()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('foo')
    expect(result[0].latestVersion).toBe('1.1.0')
  })

  it('returns empty when no installed extensions', async () => {
    const fetchImpl: typeof fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch
    const api = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl })
    const store = new FakeStore() as unknown as import('../../../electron/main/marketplace/store').MarketplaceStore
    const registry = new FakeRegistry([])
    const host = { registry } as unknown as import('../../../electron/main/extensions/host').ExtensionHostMain
    const mgr = new UpdatesManager({ api, store, getHost: () => host })
    const result = await mgr.refresh()
    expect(result).toEqual([])
  })
})
