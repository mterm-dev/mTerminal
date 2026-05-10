import { useEffect, useState } from 'react'
import type { Category, ExtSummary } from '../types'
import { useMarketplaceSearch } from '../hooks/useMarketplace'
import { OfflineEmpty } from './OfflineEmpty'
import { RatingStars } from './RatingStars'

const CATEGORIES: Array<Category | 'all'> = [
  'all',
  'productivity',
  'language',
  'theme',
  'remote',
  'ai',
  'git',
  'other',
]

interface Props {
  installedIds: Set<string>
  onSelect: (ext: ExtSummary) => void
}

export function BrowseTab({ installedIds, onSelect }: Props) {
  const { items, loading, error, offline, search } = useMarketplaceSearch()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')

  useEffect(() => {
    const t = setTimeout(() => {
      void search({
        q: q || undefined,
        category: category === 'all' ? undefined : category,
        sort: 'downloads',
        pageSize: 50,
      })
    }, 250)
    return () => clearTimeout(t)
  }, [q, category, search])

  return (
    <div className="ext-mkt-toolbar">
      <div className="ext-mkt-search">
        <span className="ext-mkt-search-icon" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="ext-mkt-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search extensions"
        />
      </div>
      <div className="ext-mkt-cats">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`ext-mkt-cat${category === c ? ' active' : ''}`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="ext-mkt-list">
        {offline && <OfflineEmpty message={error ?? undefined} onRetry={() => void search({})} />}
        {!offline && error && <div className="ext-mkt-error">{error}</div>}
        {!offline && !error && items.length === 0 && !loading && (
          <div className="ext-mkt-state">
            <div className="ext-mkt-state-title">No extensions match</div>
            <div className="ext-mkt-state-sub">
              Try a different search term or pick another category.
            </div>
          </div>
        )}
        {!offline && !error && loading && items.length === 0 && (
          <div className="ext-mkt-state">
            <div className="ext-mkt-state-sub">Loading…</div>
          </div>
        )}
        {items.map((ext) => (
          <button
            key={ext.id}
            type="button"
            onClick={() => onSelect(ext)}
            className="ext-mkt-row"
          >
            <div className="ext-mkt-row-main">
              <div className="ext-mkt-row-title">
                <span className="ext-mkt-row-name">{ext.displayName}</span>
                {installedIds.has(ext.id) && (
                  <span className="ext-chip ext-chip--builtin">Installed</span>
                )}
              </div>
              {ext.description && <div className="ext-mkt-row-desc">{ext.description}</div>}
              <div className="ext-mkt-row-meta">
                <RatingStars value={Math.round(ext.avgStars ?? 0)} size={12} />
                <span>{ext.ratingCount}</span>
                <span className="ext-mkt-row-meta-sep">·</span>
                <span>{ext.downloadTotal} downloads</span>
                <span className="ext-mkt-row-meta-sep">·</span>
                <span>v{ext.latestVersion}</span>
              </div>
            </div>
            <span className="ext-mkt-row-cta">Details →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
