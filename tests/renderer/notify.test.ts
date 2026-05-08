// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/ipc', () => ({
  sendNotification: vi.fn(),
}))

import { sendNotification } from '../../src/lib/ipc'
import { notify } from '../../src/lib/notify'
import { getUiStore } from '../../src/extensions/api-bridge/ui'

const mSend = sendNotification as unknown as ReturnType<typeof vi.fn>

describe('notify', () => {
  beforeEach(() => {
    const store = getUiStore()
    for (const t of store.listToasts()) store.dismissToast(t.id)
    store.setHostMounted(true)
    mSend.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('notify.info pushes an info toast', () => {
    notify.info('hello')
    const toasts = getUiStore().listToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].kind).toBe('info')
    expect(toasts[0].message).toBe('hello')
  })

  it('notify.error(Error) extracts message and stack into details', () => {
    const err = new Error('bang')
    notify.error(err)
    const t = getUiStore().listToasts()[0]
    expect(t.kind).toBe('error')
    expect(t.message).toBe('bang')
    expect(t.details && t.details.length > 0).toBe(true)
    expect(t.details).toContain('bang')
  })

  it('notify.error(object) preserves title/message/details verbatim', () => {
    notify.error({ title: 'fail', message: 'x', details: 'd' })
    const t = getUiStore().listToasts()[0]
    expect(t.title).toBe('fail')
    expect(t.message).toBe('x')
    expect(t.details).toBe('d')
  })

  it('notifyOrToast pushes a toast when window is focused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    notify.notifyOrToast({ title: 'T', body: 'B', kind: 'success' })
    const toasts = getUiStore().listToasts()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].kind).toBe('success')
    expect(toasts[0].title).toBe('T')
    expect(toasts[0].message).toBe('B')
    expect(mSend).not.toHaveBeenCalled()
  })

  it('notifyOrToast falls back to OS notification when unfocused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    notify.notifyOrToast({ title: 'T', body: 'B' })
    expect(getUiStore().listToasts()).toHaveLength(0)
    expect(mSend).toHaveBeenCalledWith({ title: 'T', body: 'B' })
  })
})
