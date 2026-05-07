import { useEffect, useState } from 'react'
import { marketplaceApi, MarketplaceClientError } from '../api'
import type { ExtSummary } from '../types'

const FALLBACK_RECOMMENDED_IDS = ['remote-ssh', 'file-browser', 'git-panel']

interface Props {
  open: boolean
  onClose: () => void
}

interface InstallReport {
  total: number
  successes: string[]
  failures: Array<{ id: string; reason: string }>
}

export function OnboardingModal({ open, onClose }: Props) {
  const [items, setItems] = useState<ExtSummary[]>([])
  const [fallbackIds, setFallbackIds] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [report, setReport] = useState<InstallReport | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setOffline(false)
    setReport(null)
    setItems([])
    setFallbackIds([])
    marketplaceApi
      .search({ recommended: true, pageSize: 20 })
      .then((res) => {
        if (cancelled) return
        const list = res.items
        setItems(list)
        setSelected(new Set(list.map((it) => it.id)))
        setLoading(false)
      })
      .catch((err: MarketplaceClientError) => {
        if (cancelled) return
        if (err.code === 'NETWORK') {
          setOffline(true)
          setFallbackIds(FALLBACK_RECOMMENDED_IDS)
          setSelected(new Set(FALLBACK_RECOMMENDED_IDS))
        } else {
          setError(err.message)
          setFallbackIds(FALLBACK_RECOMMENDED_IDS)
          setSelected(new Set(FALLBACK_RECOMMENDED_IDS))
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const toggle = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const skip = async () => {
    try {
      await marketplaceApi.markOnboardingDone()
    } catch {}
    onClose()
  }

  const installSelected = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) {
      await skip()
      return
    }
    setInstalling(true)
    try {
      const results = await marketplaceApi.installRecommended(ids)
      const successes = results.filter((r) => r.ok).map((r) => r.id)
      const failures = results
        .filter((r) => !r.ok)
        .map((r) => ({ id: r.id, reason: r.error?.message ?? 'unknown error' }))
      setReport({ total: ids.length, successes, failures })
      try {
        await marketplaceApi.markOnboardingDone()
      } catch {}
    } catch (err) {
      setReport({
        total: ids.length,
        successes: [],
        failures: [{ id: '*', reason: (err as MarketplaceClientError).message }],
      })
    } finally {
      setInstalling(false)
    }
  }

  if (!open) return null

  const list: Array<{ id: string; displayName: string; description: string }> =
    items.length > 0
      ? items.map((it) => ({ id: it.id, displayName: it.displayName, description: it.description }))
      : fallbackIds.map((id) => ({ id, displayName: id, description: '' }))

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
      }}
    >
      <div
        style={{
          width: 540,
          maxWidth: 'calc(100vw - 60px)',
          maxHeight: 'calc(100vh - 80px)',
          background: 'var(--surface-0, #101012)',
          color: 'var(--fg, #e9e9e9)',
          border: '1px solid var(--border-subtle, #2a2a2a)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle, #2a2a2a)' }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>welcome to mterminal</div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim, #888)', marginTop: 4 }}>
            install recommended extensions to get started
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 12 }}>
          {loading && <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12 }}>loading...</div>}
          {offline && (
            <div style={{ color: 'var(--c-amber, #f7b955)', fontSize: 12, marginBottom: 8 }}>
              marketplace unavailable — using offline defaults
            </div>
          )}
          {error && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          {report && (
            <div style={{ marginBottom: 12, padding: 10, background: 'var(--surface-1, #18181a)', borderRadius: 6 }}>
              <div style={{ fontSize: 12 }}>
                installed {report.successes.length}/{report.total}
              </div>
              {report.failures.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--c-red, #d66)' }}>
                  {report.failures.map((f, i) => (
                    <li key={i}>
                      {f.id}: {f.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!loading && !report && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((it) => (
                <label
                  key={it.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: 10,
                    border: '1px solid var(--border-subtle, #2a2a2a)',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(it.id)}
                    onChange={() => toggle(it.id)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{it.displayName}</div>
                    {it.description && (
                      <div style={{ fontSize: 11, color: 'var(--fg-dim, #888)' }}>{it.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--border-subtle, #2a2a2a)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {!report && (
            <>
              <button
                type="button"
                onClick={() => void skip()}
                disabled={installing}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'transparent',
                  color: 'var(--fg-dim, #888)',
                  border: '1px solid var(--border-subtle, #2a2a2a)',
                  borderRadius: 4,
                  cursor: installing ? 'wait' : 'pointer',
                }}
              >
                skip for now
              </button>
              <button
                type="button"
                onClick={() => void installSelected()}
                disabled={installing || (loading && !offline)}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: 'var(--accent, #4a9)',
                  color: 'var(--surface-1, #111)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: installing ? 'wait' : 'pointer',
                }}
              >
                install selected ({selected.size})
              </button>
            </>
          )}
          {report && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                background: 'var(--accent, #4a9)',
                color: 'var(--surface-1, #111)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
