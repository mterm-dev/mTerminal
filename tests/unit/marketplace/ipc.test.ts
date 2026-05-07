import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { __invoke, __reset } from '../../mocks/electron'
import { registerMarketplaceHandlers } from '../../../electron/main/marketplace'
import { MarketplaceApiClient } from '../../../electron/main/marketplace/api-client'
import { MarketplaceStore } from '../../../electron/main/marketplace/store'

interface RegistryRecord {
  manifest: { id: string; version: string; source: 'user' | 'built-in'; displayName?: string; description?: string }
  enabled: boolean
  trusted: boolean
  state: string
}

function fakeHost(records: RegistryRecord[] = []) {
  return {
    registry: { list: () => records },
  } as unknown as import('../../../electron/main/extensions/host').ExtensionHostMain
}

beforeEach(() => {
  __reset()
})

describe('marketplace ipc handlers', () => {
  it('registers all expected channels', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-mp-ipc-'))
    const store = new MarketplaceStore({
      home: tmp,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmp },
      appVersion: '0.1.0',
    })
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    const api = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl })
    const handle = registerMarketplaceHandlers(() => fakeHost(), { api, store })

    const search = (await __invoke('marketplace:search', {})) as { ok: boolean }
    expect(search.ok).toBe(true)

    const firstRun = (await __invoke('marketplace:is-first-run')) as { ok: boolean; value: boolean }
    expect(firstRun.ok).toBe(true)
    expect(firstRun.value).toBe(true)

    const markDone = (await __invoke('marketplace:mark-onboarding-done')) as { ok: boolean }
    expect(markDone.ok).toBe(true)

    const firstRun2 = (await __invoke('marketplace:is-first-run')) as { ok: boolean; value: boolean }
    expect(firstRun2.value).toBe(false)

    const list = (await __invoke('marketplace:list-installed-with-marketplace-meta')) as {
      ok: boolean
      value: unknown[]
    }
    expect(list.ok).toBe(true)
    expect(list.value).toEqual([])

    handle.unregister()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('returns NETWORK error when fetch fails', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-mp-ipc-'))
    const store = new MarketplaceStore({
      home: tmp,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmp },
      appVersion: '0.1.0',
    })
    const fetchImpl: typeof fetch = (async () => {
      throw new Error('econnrefused')
    }) as typeof fetch
    const api = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl })
    registerMarketplaceHandlers(() => fakeHost(), { api, store })

    const result = (await __invoke('marketplace:search', {})) as { ok: boolean; error?: { code: string } }
    expect(result.ok).toBe(false)
    expect(result.error?.code).toBe('NETWORK')

    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
