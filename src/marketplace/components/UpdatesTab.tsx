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
    <div className="ext-mkt-updates">
      {loading && (
        <div className="ext-mkt-state">
          <div className="ext-mkt-state-sub">Checking for updates…</div>
        </div>
      )}
      {error && <div className="ext-mkt-error">{error}</div>}
      {lastError && <div className="ext-mkt-error">{lastError}</div>}
      {!loading && !error && updates.length === 0 && (
        <div className="ext-mkt-state">
          <div className="ext-mkt-state-title">All extensions up to date</div>
          <div className="ext-mkt-state-sub">
            We check periodically for new versions of installed extensions.
          </div>
        </div>
      )}
      {updates.map((u) => (
        <div key={u.id} className="ext-mkt-update-row">
          <div className="ext-mkt-update-info">
            <span className="ext-mkt-update-name">{u.displayName}</span>
            <span className="ext-mkt-update-bump">
              v{u.installedVersion} → v{u.latestVersion}
            </span>
          </div>
          <button
            type="button"
            className="st-btn primary"
            disabled={busy}
            onClick={() => void handleUpdate(u.id)}
          >
            Update
          </button>
        </div>
      ))}
    </div>
  )
}
