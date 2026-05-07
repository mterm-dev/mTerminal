// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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

describe('OnboardingModal', () => {
  it('shows hardcoded recommended fallback when network fetch fails', async () => {
    bridge.search.mockResolvedValue({
      ok: false,
      error: { code: 'NETWORK', message: 'offline' },
    })

    const { OnboardingModal } = await import(
      '../../../src/marketplace/components/OnboardingModal'
    )

    const { container } = render(<OnboardingModal open={true} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getAllByText('remote-ssh').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('file-browser').length).toBeGreaterThan(0)
    expect(screen.getAllByText('git-panel').length).toBeGreaterThan(0)
    expect(container.textContent).toMatch(/marketplace unavailable/i)
  })

  it('shows hardcoded recommended fallback when fetch fails with non-network error', async () => {
    bridge.search.mockResolvedValue({
      ok: false,
      error: { code: 'HTTP', message: '500: server error' },
    })

    const { OnboardingModal } = await import(
      '../../../src/marketplace/components/OnboardingModal'
    )

    render(<OnboardingModal open={true} onClose={() => {}} />)

    await waitFor(() => {
      expect(screen.getAllByText('remote-ssh').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('file-browser').length).toBeGreaterThan(0)
    expect(screen.getAllByText('git-panel').length).toBeGreaterThan(0)
  })
})
