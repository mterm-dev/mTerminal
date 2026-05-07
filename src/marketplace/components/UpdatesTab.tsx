import { useUpdates } from '../hooks/useUpdates'
import { useInstallActions } from '../hooks/useMarketplace'

export function UpdatesTab() {
  const { updates, loading, error, refresh } = useUpdates()
  const { update, busy, lastError } = useInstallActions()

  const handleUpdate = async (id: string) => {
    const ok = await update(id)
    if (ok) await refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, overflow: 'auto', height: '100%' }}>
      {loading && <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12 }}>checking...</div>}
      {error && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{error}</div>}
      {lastError && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{lastError}</div>}
      {!loading && !error && updates.length === 0 && (
        <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12, textAlign: 'center', padding: 16 }}>
          all extensions up to date
        </div>
      )}
      {updates.map((u) => (
        <div
          key={u.id}
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
            <div style={{ fontSize: 13, fontWeight: 600 }}>{u.displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-dim, #888)' }}>
              v{u.installedVersion} → v{u.latestVersion}
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUpdate(u.id)}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              background: 'var(--accent, #4a9)',
              color: 'var(--surface-1, #111)',
              border: 'none',
              borderRadius: 4,
              cursor: busy ? 'wait' : 'pointer',
            }}
          >
            update
          </button>
        </div>
      ))}
    </div>
  )
}
