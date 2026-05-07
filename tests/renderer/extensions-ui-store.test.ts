import { describe, expect, it } from 'vitest'

// jsdom-environment test (renderer)
import { getUiStore } from '../../src/extensions/api-bridge/ui'

describe('UI store', () => {
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
})
