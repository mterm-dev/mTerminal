// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent, act, waitFor, cleanup, within } from '@testing-library/react'
import { ToastView } from '../../src/extensions/components/ToastView'
import { getUiStore, type ToastSpec } from '../../src/extensions/api-bridge/ui'

function spec(partial: Partial<ToastSpec> = {}): ToastSpec {
  return {
    id: 1,
    kind: 'info',
    message: 'msg',
    durationMs: 0,
    dismissible: true,
    ...partial,
  }
}

describe('ToastView', () => {
  beforeEach(() => {
    const store = getUiStore()
    for (const t of store.listToasts()) store.dismissToast(t.id)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders title, message and toggleable details', () => {
    const { container } = render(
      <ToastView
        toast={spec({ id: 10, title: 'boom', message: 'something failed', details: 'stack-trace-here' })}
      />,
    )
    const u = within(container)
    expect(u.getByText('boom')).toBeTruthy()
    expect(u.getByText('something failed')).toBeTruthy()
    expect(u.queryByText('stack-trace-here')).toBeNull()
    fireEvent.click(u.getByText('show details'))
    expect(u.getByText('stack-trace-here')).toBeTruthy()
  })

  it('copies title + message + details to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const { container } = render(
      <ToastView
        toast={spec({ id: 11, title: 'T', message: 'M', details: 'D' })}
      />,
    )
    const u = within(container)
    fireEvent.click(u.getByLabelText('copy toast content'))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('T\nM\nD'))
    await waitFor(() => expect(u.getByText('copied')).toBeTruthy())
  })

  it('hides the close button when dismissible is false', () => {
    const { container } = render(<ToastView toast={spec({ id: 12, dismissible: false })} />)
    expect(within(container).queryByLabelText('dismiss')).toBeNull()
  })

  it('dismiss button removes the toast from the store', () => {
    const store = getUiStore()
    const id = store.pushToast({ kind: 'info', message: 'hello', durationMs: 0 })
    const t = store.listToasts().find((x) => x.id === id)!
    const { container } = render(<ToastView toast={t} />)
    fireEvent.click(within(container).getByLabelText('dismiss'))
    expect(store.listToasts().some((x) => x.id === id)).toBe(false)
  })

  it('hover pauses the auto-dismiss timer; mouse-leave resumes it', async () => {
    vi.useFakeTimers()
    const store = getUiStore()
    const id = store.pushToast({ kind: 'info', message: 'hover', durationMs: 1000 })
    const t = store.listToasts().find((x) => x.id === id)!
    const { container } = render(<ToastView toast={t} />)
    const card = container.querySelector('.mt-toast') as HTMLElement
    expect(card).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(400)
    })
    fireEvent.mouseEnter(card)
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(store.listToasts().some((x) => x.id === id)).toBe(true)

    fireEvent.mouseLeave(card)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    expect(store.listToasts().some((x) => x.id === id)).toBe(false)
  })
})
