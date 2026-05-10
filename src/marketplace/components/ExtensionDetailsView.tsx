import { useState } from 'react'
import { useExtensionDetails, useInstallActions } from '../hooks/useMarketplace'
import { RatingStars } from './RatingStars'
import { marketplaceApi, MarketplaceClientError } from '../api'

interface Props {
  id: string
  installedVersion: string | null
  onBack: () => void
  onChanged: () => void
}

export function ExtensionDetailsView({ id, installedVersion, onBack, onChanged }: Props) {
  const { detail, loading, error } = useExtensionDetails(id)
  const { install, uninstall, update, busy, lastError } = useInstallActions()
  const [ratingStars, setRatingStars] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingMsg, setRatingMsg] = useState<string | null>(null)

  const handleInstall = async () => {
    const ok = await install(id)
    if (ok) onChanged()
  }
  const handleUninstall = async () => {
    const ok = await uninstall(id)
    if (ok) onChanged()
  }
  const handleUpdate = async () => {
    const ok = await update(id)
    if (ok) onChanged()
  }

  const submitRating = async () => {
    if (!ratingStars) return
    setRatingMsg(null)
    try {
      await marketplaceApi.submitRating({
        extensionId: id,
        stars: ratingStars,
        comment: ratingComment || undefined,
      })
      setRatingMsg('Thanks for rating')
      setRatingComment('')
    } catch (err) {
      setRatingMsg((err as MarketplaceClientError).message)
    }
  }

  const installed = !!installedVersion
  const isOutdated = installed && detail && installedVersion !== detail.latestVersion

  return (
    <div className="ext-mkt-details">
      <button type="button" className="ext-mkt-back" onClick={onBack}>
        ← Back
      </button>
      {loading && (
        <div className="ext-mkt-state">
          <div className="ext-mkt-state-sub">Loading…</div>
        </div>
      )}
      {error && <div className="ext-mkt-error">{error}</div>}
      {detail && (
        <>
          <div className="ext-mkt-head">
            <div className="ext-mkt-head-title">{detail.displayName}</div>
            {detail.description && (
              <div className="ext-mkt-head-desc">{detail.description}</div>
            )}
            <div className="ext-mkt-head-meta">
              <RatingStars value={Math.round(detail.avgStars ?? 0)} size={12} />
              <span>{detail.ratingCount} ratings</span>
              <span className="ext-mkt-row-meta-sep">·</span>
              <span>{detail.downloadTotal} downloads</span>
              <span className="ext-mkt-row-meta-sep">·</span>
              <span>by {detail.authorLogin}</span>
            </div>
          </div>
          <div className="ext-mkt-actions">
            {!installed && (
              <button
                type="button"
                className="st-btn primary"
                disabled={busy}
                onClick={() => void handleInstall()}
              >
                Install v{detail.latestVersion}
              </button>
            )}
            {installed && isOutdated && (
              <button
                type="button"
                className="st-btn primary"
                disabled={busy}
                onClick={() => void handleUpdate()}
              >
                Update to v{detail.latestVersion}
              </button>
            )}
            {installed && (
              <button
                type="button"
                className="st-btn danger"
                disabled={busy}
                onClick={() => void handleUninstall()}
              >
                Uninstall
              </button>
            )}
          </div>
          {lastError && <div className="ext-mkt-error">{lastError}</div>}

          {detail.readmeMd && (
            <div>
              <div className="st-section-label">Readme</div>
              <pre className="ext-mkt-readme">{detail.readmeMd}</pre>
            </div>
          )}

          {detail.versions.length > 0 && (
            <div>
              <div className="st-section-label">Versions</div>
              <ul className="ext-mkt-versions">
                {detail.versions.slice(0, 10).map((v) => (
                  <li key={v.version}>
                    v{v.version} {v.yanked ? '(yanked)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="st-section-label">Rate this extension</div>
            <div className="ext-mkt-rate-row" style={{ marginBottom: 6 }}>
              <RatingStars value={ratingStars} onChange={setRatingStars} size={18} />
            </div>
            <textarea
              className="ext-mkt-rate-comment"
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="Optional comment"
            />
            <div className="ext-mkt-rate-row" style={{ marginTop: 6 }}>
              <button
                type="button"
                className="st-btn"
                disabled={!ratingStars}
                onClick={() => void submitRating()}
              >
                Submit rating
              </button>
              {ratingMsg && <span className="ext-mkt-rate-msg">{ratingMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
