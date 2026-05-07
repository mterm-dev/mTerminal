// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

interface BridgeApi {
  search: ReturnType<typeof vi.fn>
  details: ReturnType<typeof vi.fn>
  install: ReturnType<typeof vi.fn>
  uninstall: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  checkUpdates: ReturnType<typeof vi.fn>
  getUpdates: ReturnType<typeof vi.fn>
  listInstalledWithMeta: ReturnType<typeof vi.fn>
  submitRating: ReturnType<typeof vi.fn>
  isFirstRun: ReturnType<typeof vi.fn>
  markOnboardingDone: ReturnType<typeof vi.fn>
  installRecommended: ReturnType<typeof vi.fn>
}

let bridge: BridgeApi

beforeEach(() => {
  bridge = {
    search: vi.fn(),
    details: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    update: vi.fn(),
    checkUpdates: vi.fn(),
    getUpdates: vi.fn(),
    listInstalledWithMeta: vi.fn(),
    submitRating: vi.fn(),
    isFirstRun: vi.fn(),
    markOnboardingDone: vi.fn(),
    installRecommended: vi.fn(),
  }
  ;(globalThis as unknown as { window: { mt: { marketplace: BridgeApi } } }).window =
    Object.assign(globalThis.window ?? {}, { mt: { marketplace: bridge } })
})

describe('useMarketplaceSearch', () => {
  it('populates items on success', async () => {
    bridge.search.mockResolvedValueOnce({
      ok: true,
      value: {
        items: [
          {
            id: 'foo',
            displayName: 'foo',
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
        total: 1,
        page: 1,
        pageSize: 50,
      },
    })
    const mod = await import('../../../src/marketplace/hooks/useMarketplace')
    const { result } = renderHook(() => mod.useMarketplaceSearch())
    await act(async () => {
      await result.current.search({ q: 'foo' })
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].id).toBe('foo')
    expect(result.current.offline).toBe(false)
  })

  it('flags offline on NETWORK error', async () => {
    bridge.search.mockResolvedValueOnce({
      ok: false,
      error: { code: 'NETWORK', message: 'econnrefused' },
    })
    const mod = await import('../../../src/marketplace/hooks/useMarketplace')
    const { result } = renderHook(() => mod.useMarketplaceSearch())
    await act(async () => {
      await result.current.search({})
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.offline).toBe(true)
    expect(result.current.error).toBe('econnrefused')
  })
})

describe('useInstallActions', () => {
  it('install returns true when bridge succeeds', async () => {
    bridge.install.mockResolvedValueOnce({ ok: true, value: { id: 'foo', version: '1.0.0' } })
    const mod = await import('../../../src/marketplace/hooks/useMarketplace')
    const { result } = renderHook(() => mod.useInstallActions())
    let ok: boolean = false
    await act(async () => {
      ok = await result.current.install('foo')
    })
    expect(ok).toBe(true)
    expect(bridge.install).toHaveBeenCalledWith('foo', undefined)
  })

  it('install reports error from bridge', async () => {
    bridge.install.mockResolvedValueOnce({
      ok: false,
      error: { code: 'verify', message: 'bad signature' },
    })
    const mod = await import('../../../src/marketplace/hooks/useMarketplace')
    const { result } = renderHook(() => mod.useInstallActions())
    let ok: boolean = true
    await act(async () => {
      ok = await result.current.install('foo')
    })
    expect(ok).toBe(false)
    expect(result.current.lastError).toBe('bad signature')
  })
})
