// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getUiStore } from '../../src/extensions/api-bridge/ui'

describe('UI store', () => {
  beforeEach(() => {
    const store = getUiStore()
    for (const t of store.listToasts()) store.dismissToast(t.id)
    store.setHostMounted(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues modals and resolves on close', async () => {
    const store = getUiStore()
    store.setHostMounted(true)
    const promise = store.openModal({
      title: 'Pick',
      render: () => {},
    })
    const open = store.listModals()
    expect(open).toHaveLength(1)
    store.closeModal(open[0].id, 'picked')
    await expect(promise).resolves.toBe('picked')
  })

  it('pushes and dismisses toasts', () => {
    const store = getUiStore()
    store.pushToast({ kind: 'info', message: 'hello', durationMs: 0 })
    expect(store.listToasts()).toHaveLength(1)
    store.dismissToast(store.listToasts()[0].id)
    expect(store.listToasts()).toHaveLength(0)
  })

  it('stores title and details on the toast spec', () => {
    const store = getUiStore()
    store.pushToast({
      kind: 'error',
      title: 'boom',
      message: 'oh no',
      details: 'stack...',
      durationMs: 0,
    })
    const t = store.listToasts()[0]
    expect(t.title).toBe('boom')
    expect(t.message).toBe('oh no')
    expect(t.details).toBe('stack...')
    expect(t.dismissible).toBe(true)
  })

  it('honors dismissible: false', () => {
    const store = getUiStore()
    store.pushToast({ kind: 'info', message: 'sticky', durationMs: 0, dismissible: false })
    expect(store.listToasts()[0].dismissible).toBe(false)
  })

  it('treats durationMs <= 0 as sticky (no auto-dismiss)', () => {
    vi.useFakeTimers()
    const store = getUiStore()
    store.pushToast({ kind: 'info', message: 'stay', durationMs: 0 })
    expect(store.listToasts()).toHaveLength(1)
    vi.advanceTimersByTime(60_000)
    expect(store.listToasts()).toHaveLength(1)
  })

  it('auto-dismisses after durationMs', () => {
    vi.useFakeTimers()
    const store = getUiStore()
    store.pushToast({ kind: 'info', message: 'go', durationMs: 1000 })
    expect(store.listToasts()).toHaveLength(1)
    vi.advanceTimersByTime(1100)
    expect(store.listToasts()).toHaveLength(0)
  })

  it('pauseDismiss prevents auto-dismiss until resumeDismiss', () => {
    vi.useFakeTimers()
    const store = getUiStore()
    const id = store.pushToast({ kind: 'info', message: 'hover me', durationMs: 1000 })
    vi.advanceTimersByTime(400)
    store.pauseDismiss(id)
    vi.advanceTimersByTime(5_000)
    expect(store.listToasts()).toHaveLength(1)
    store.resumeDismiss(id)
    vi.advanceTimersByTime(599)
    expect(store.listToasts()).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(store.listToasts()).toHaveLength(0)
  })
})
