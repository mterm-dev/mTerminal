import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getUiStore, type ToastSpec } from '../api-bridge/ui'
import type { ModalSpec } from '../api-bridge/ui-types'
import { TrustModal } from './TrustModal'
import { ToastView } from './ToastView'

/**
 * Mounts plugin-rendered modals and toasts at the App.tsx root.
 *
 * Lifecycle:
 *   - on mount, marks the UiStore as host-mounted (so `ctx.ui.openModal` no
 *     longer falls back to `window.confirm` etc.)
 *   - subscribes to the UiStore for modal/toast list changes
 *   - renders each pending modal in its own portal-ish overlay; the plugin's
 *     `render(host, ctrl)` callback writes into a host element
 *
 * Not a portal yet — uses inline z-indexed overlays. Replace with
 * `react-dom/createPortal` if z-stacking gets complicated.
 */

interface PendingModalView {
  id: number
  spec: ModalSpec
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 8500,
}

const panel: CSSProperties = {
  background: 'var(--surface, #1a1a1a)',
  color: 'var(--text, #eee)',
  borderRadius: 8,
  width: 'min(640px, 92vw)',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
}

const titleBar: CSSProperties = {
  padding: '10px 16px',
  borderBottom: '1px solid var(--border, #333)',
  fontWeight: 600,
  fontSize: 14,
}

export function PluginUiHost() {
  const store = getUiStore()
  const [modals, setModals] = useState<PendingModalView[]>([])
  const [toasts, setToasts] = useState<ToastSpec[]>([])

  useEffect(() => {
    store.setHostMounted(true)
    const sync = (): void => {
      setModals(store.listModals().map((m) => ({ id: m.id, spec: m.spec })))
      setToasts(store.listToasts())
    }
    sync()
    const off = store.subscribe(sync)
    return () => {
      off()
      store.setHostMounted(false)
    }
  }, [store])

  return (
    <>
      <TrustModal />
      {modals.map((m) => (
        <ModalEntry key={m.id} id={m.id} spec={m.spec} />
      ))}
      {toasts.length > 0 && (
        <div className="mt-toast-stack" aria-label="notifications">
          {toasts.map((t) => (
            <ToastView key={t.id} toast={t} />
          ))}
        </div>
      )}
    </>
  )
}

function ModalEntry({ id, spec }: { id: number; spec: ModalSpec }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const titleRef = useRef<HTMLDivElement | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const store = getUiStore()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const ctrl = {
      close: (value?: unknown): void => store.closeModal(id, value),
      setTitle: (newTitle: string): void => {
        if (titleRef.current) titleRef.current.textContent = newTitle
      },
    }
    let cleanup: void | (() => void) = undefined
    try {
      cleanup = spec.render(host, ctrl)
    } catch (err) {
      console.error('[ext modal render]', err)
      store.closeModal(id, undefined)
    }
    if (typeof cleanup === 'function') cleanupRef.current = cleanup
    return () => {
      if (cleanupRef.current) {
        try {
          cleanupRef.current()
        } catch {
          /* ignore */
        }
        cleanupRef.current = null
      }
    }
  }, [id, spec, store])

  const style: CSSProperties = {
    ...panel,
    width: spec.width ? `min(${spec.width}px, 92vw)` : panel.width,
    maxHeight: spec.height ? `min(${spec.height}px, 85vh)` : panel.maxHeight,
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" onClick={(e) => {
      if (e.target === e.currentTarget) store.closeModal(id, undefined)
    }}>
      <div style={style}>
        <div style={titleBar} ref={titleRef}>
          {spec.title}
        </div>
        <div ref={hostRef} />
      </div>
    </div>
  )
}
