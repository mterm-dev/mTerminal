import type { ExtSummary } from '../types'
import { RatingStars } from './RatingStars'

interface Props {
  ext: ExtSummary
  installed?: boolean
  onClick?: () => void
}

export function ExtensionCard({ ext, installed, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-marketplace-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 10,
        border: '1px solid var(--border-subtle, #2a2a2a)',
        borderRadius: 6,
        background: 'var(--surface-1, #18181a)',
        color: 'var(--fg, #e9e9e9)',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{ext.displayName}</span>
        {installed && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--border-subtle, #2a2a2a)',
              color: 'var(--fg-dim, #888)',
            }}
          >
            installed
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-dim, #888)' }}>{ext.description}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 11,
          color: 'var(--fg-dim, #888)',
        }}
      >
        <RatingStars value={Math.round(ext.avgStars ?? 0)} size={12} />
        <span>{ext.ratingCount}</span>
        <span>•</span>
        <span>{ext.downloadTotal} downloads</span>
        <span>•</span>
        <span>v{ext.latestVersion}</span>
      </div>
    </button>
  )
}
