import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { __invoke, __reset } from '../../mocks/electron'
import { registerMarketplaceHandlers } from '../../../electron/main/marketplace'
import { MarketplaceApiClient } from '../../../electron/main/marketplace/api-client'
import { MarketplaceStore } from '../../../electron/main/marketplace/store'

function fakeHost() {
  return {
    registry: { list: () => [] },
  } as unknown as import('../../../electron/main/extensions/host').ExtensionHostMain
}

beforeEach(() => {
  __reset()
})

describe('marketplace api-client setEndpoint', () => {
  it('reflects updated endpoint in subsequent requests', async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = (async (url: string) => {
      calls.push(url)
      return new Response(
        JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch
    const client = new MarketplaceApiClient({ endpoint: 'http://a.example', fetchImpl })
    await client.search()
    client.setEndpoint('http://b.example')
    await client.search()
    expect(calls[0]?.startsWith('http://a.example')).toBe(true)
    expect(calls[1]?.startsWith('http://b.example')).toBe(true)
  })

  it('strips trailing slashes when setEndpoint receives a URL', () => {
    const client = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl: fetch })
    client.setEndpoint('http://y.example///')
    expect(client.endpoint).toBe('http://y.example')
  })

  it('reverts to env-resolved default when setEndpoint is called with empty', () => {
    const client = new MarketplaceApiClient({ endpoint: 'http://x', fetchImpl: fetch })
    client.setEndpoint(undefined)
    expect(typeof client.endpoint).toBe('string')
    expect(client.endpoint.length).toBeGreaterThan(0)
  })
})

describe('marketplace:set-endpoint ipc', () => {
  it('updates the api client endpoint', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-mp-ep-'))
    const store = new MarketplaceStore({
      home: tmp,
      platform: 'linux',
      env: { XDG_CONFIG_HOME: tmp },
      appVersion: '0.1.0',
    })
    const fetchImpl: typeof fetch = (async () =>
      new Response(JSON.stringify({}), { status: 200 })) as typeof fetch
    const api = new MarketplaceApiClient({ endpoint: 'http://initial', fetchImpl })
    const handle = registerMarketplaceHandlers(() => fakeHost(), { api, store })

    const set = (await __invoke('marketplace:set-endpoint', {
      url: 'http://override.example',
    })) as { ok: boolean; value: string }
    expect(set.ok).toBe(true)
    expect(set.value).toBe('http://override.example')

    const get = (await __invoke('marketplace:get-endpoint')) as {
      ok: boolean
      value: string
    }
    expect(get.value).toBe('http://override.example')

    const reset = (await __invoke('marketplace:set-endpoint', { url: null })) as {
      ok: boolean
      value: string
    }
    expect(reset.ok).toBe(true)
    expect(reset.value.length).toBeGreaterThan(0)

    handle.unregister()
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})
