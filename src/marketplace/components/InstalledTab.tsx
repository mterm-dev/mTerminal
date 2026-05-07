import { useEffect, useState } from 'react'
import { marketplaceApi, MarketplaceClientError } from '../api'
import type { InstalledWithMeta } from '../types'
import { useInstallActions } from '../hooks/useMarketplace'

interface Props {
  onRefresh?: () => void
}

export function InstalledTab({ onRefresh }: Props) {
  const [items, setItems] = useState<InstalledWithMeta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { uninstall, busy } = useInstallActions()

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await marketplaceApi.listInstalled()
      setItems(list)
    } catch (err) {
      setError((err as MarketplaceClientError).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const handleUninstall = async (id: string) => {
    const ok = await uninstall(id)
    if (ok) {
      await refresh()
      onRefresh?.()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, overflow: 'auto', height: '100%' }}>
      {loading && <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12 }}>loading...</div>}
      {error && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{error}</div>}
      {items.length === 0 && !loading && !error && (
        <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12, textAlign: 'center', padding: 16 }}>
          no installed extensions
        </div>
      )}
      {items.map((it) => (
        <div
          key={it.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            border: '1px solid var(--border-subtle, #2a2a2a)',
            borderRadius: 6,
            background: 'var(--surface-1, #18181a)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{it.displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim, #888)' }}>
              v{it.installedVersion} • {it.state}
            </div>
            {it.description && (
              <div style={{ fontSize: 11, color: 'var(--fg-dim, #888)', marginTop: 2 }}>{it.description}</div>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUninstall(it.id)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              background: 'transparent',
              color: 'var(--c-red, #d66)',
              border: '1px solid var(--border-subtle, #2a2a2a)',
              borderRadius: 4,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            uninstall
          </button>
        </div>
      ))}
    </div>
  )
}
