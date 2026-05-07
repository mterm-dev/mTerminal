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
      setRatingMsg('thanks for rating')
      setRatingComment('')
    } catch (err) {
      setRatingMsg((err as MarketplaceClientError).message)
    }
  }

  const installed = !!installedVersion
  const isOutdated = installed && detail && installedVersion !== detail.latestVersion

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, overflow: 'auto', height: '100%' }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: 'flex-start',
          padding: '4px 8px',
          fontSize: 11,
          background: 'transparent',
          color: 'var(--fg-dim, #888)',
          border: '1px solid var(--border-subtle, #2a2a2a)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        ← back
      </button>
      {loading && <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12 }}>loading...</div>}
      {error && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{error}</div>}
      {detail && (
        <>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{detail.displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-dim, #888)', marginTop: 2 }}>
              {detail.description}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11, color: 'var(--fg-dim, #888)' }}>
              <RatingStars value={Math.round(detail.avgStars ?? 0)} size={12} />
              <span>{detail.ratingCount} ratings</span>
              <span>•</span>
              <span>{detail.downloadTotal} downloads</span>
              <span>•</span>
              <span>by {detail.authorLogin}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!installed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleInstall()}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: 'var(--accent, #4a9)',
                  color: 'var(--surface-1, #111)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                install v{detail.latestVersion}
              </button>
            )}
            {installed && isOutdated && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleUpdate()}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: 'var(--accent, #4a9)',
                  color: 'var(--surface-1, #111)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                update to v{detail.latestVersion}
              </button>
            )}
            {installed && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleUninstall()}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  background: 'transparent',
                  color: 'var(--c-red, #d66)',
                  border: '1px solid var(--border-subtle, #2a2a2a)',
                  borderRadius: 4,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                uninstall
              </button>
            )}
          </div>
          {lastError && <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{lastError}</div>}

          {detail.readmeMd && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>readme</div>
              <pre
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono, monospace)',
                  whiteSpace: 'pre-wrap',
                  background: 'var(--surface-1, #18181a)',
                  border: '1px solid var(--border-subtle, #2a2a2a)',
                  borderRadius: 4,
                  padding: 10,
                  margin: 0,
                  color: 'var(--fg, #e9e9e9)',
                }}
              >
                {detail.readmeMd}
              </pre>
            </div>
          )}

          {detail.versions.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>versions</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {detail.versions.slice(0, 10).map((v) => (
                  <li key={v.version} style={{ fontSize: 11, color: 'var(--fg-dim, #888)' }}>
                    v{v.version} {v.yanked ? '(yanked)' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>rate this extension</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <RatingStars value={ratingStars} onChange={setRatingStars} size={18} />
            </div>
            <textarea
              value={ratingComment}
              onChange={(e) => setRatingComment(e.target.value)}
              placeholder="optional comment"
              style={{
                width: '100%',
                minHeight: 50,
                padding: 6,
                background: 'var(--surface-2, #222)',
                color: 'var(--fg, #e9e9e9)',
                border: '1px solid var(--border-subtle, #2a2a2a)',
                borderRadius: 4,
                fontSize: 11,
                outline: 'none',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
              <button
                type="button"
                disabled={!ratingStars}
                onClick={() => void submitRating()}
                style={{
                  padding: '4px 10px',
                  fontSize: 11,
                  background: 'var(--surface-2, #222)',
                  color: 'var(--fg, #e9e9e9)',
                  border: '1px solid var(--border-subtle, #2a2a2a)',
                  borderRadius: 4,
                  cursor: ratingStars ? 'pointer' : 'not-allowed',
                }}
              >
                submit rating
              </button>
              {ratingMsg && <span style={{ fontSize: 11, color: 'var(--fg-dim, #888)' }}>{ratingMsg}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
