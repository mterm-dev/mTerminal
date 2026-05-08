import { useCallback, useEffect, useRef, useState } from 'react'
import { getUiStore, type ToastSpec } from '../api-bridge/ui'

const KIND_ICON: Record<ToastSpec['kind'], string> = {
  info: 'i',
  success: '✓',
  warn: '!',
  error: '×',
}

const KIND_ROLE: Record<ToastSpec['kind'], 'status' | 'alert'> = {
  info: 'status',
  success: 'status',
  warn: 'alert',
  error: 'alert',
}

function serializeToast(t: ToastSpec): string {
  const parts: string[] = []
  if (t.title) parts.push(t.title)
  if (t.message) parts.push(t.message)
  if (t.details) parts.push(t.details)
  return parts.join('\n')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  try {
    const mt = (window as unknown as { mt?: { clipboard?: { writeText: (t: string) => Promise<void> } } }).mt
    if (mt?.clipboard?.writeText) {
      await mt.clipboard.writeText(text)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function ToastView({ toast }: { toast: ToastSpec }) {
  const store = getUiStore()
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    }
  }, [])

  const onCopy = useCallback(async () => {
    const ok = await copyToClipboard(serializeToast(toast))
    if (!ok) return
    setCopied(true)
    if (copyResetRef.current) clearTimeout(copyResetRef.current)
    copyResetRef.current = setTimeout(() => setCopied(false), 1200)
  }, [toast])

  const onMouseEnter = useCallback(() => store.pauseDismiss(toast.id), [store, toast.id])
  const onMouseLeave = useCallback(() => store.resumeDismiss(toast.id), [store, toast.id])

  return (
    <div
      className={`mt-toast mt-toast--${toast.kind}`}
      role={KIND_ROLE[toast.kind]}
      aria-live={toast.kind === 'error' || toast.kind === 'warn' ? 'assertive' : 'polite'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onMouseEnter}
      onBlur={onMouseLeave}
    >
      <div className="mt-toast__icon" aria-hidden="true">
        {KIND_ICON[toast.kind]}
      </div>
      <div className="mt-toast__body">
        {toast.title && <div className="mt-toast__title">{toast.title}</div>}
        <div className="mt-toast__message">{toast.message}</div>
        {toast.details && (
          <>
            <button
              type="button"
              className="mt-toast__details-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'hide details' : 'show details'}
            </button>
            {expanded && <pre className="mt-toast__details">{toast.details}</pre>}
          </>
        )}
      </div>
      <div className="mt-toast__actions">
        <button
          type="button"
          className="mt-toast__btn"
          onClick={onCopy}
          aria-label="copy toast content"
          title="copy"
        >
          {copied ? 'copied' : 'copy'}
        </button>
        {toast.dismissible && (
          <button
            type="button"
            className="mt-toast__btn mt-toast__btn--close"
            onClick={() => store.dismissToast(toast.id)}
            aria-label="dismiss"
            title="dismiss"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}
