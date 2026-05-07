import { useEffect, useState } from 'react'
import type { Category, ExtSummary } from '../types'
import { useMarketplaceSearch } from '../hooks/useMarketplace'
import { ExtensionCard } from './ExtensionCard'
import { OfflineEmpty } from './OfflineEmpty'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search extensions"
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--surface-2, #222)',
            color: 'var(--fg, #e9e9e9)',
            border: '1px solid var(--border-subtle, #2a2a2a)',
            borderRadius: 4,
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '0 12px',
          flexWrap: 'wrap',
        }}
      >
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            style={{
              padding: '3px 9px',
              fontSize: 11,
              borderRadius: 999,
              border: '1px solid var(--border-subtle, #2a2a2a)',
              background:
                category === c ? 'var(--accent, #4a9)' : 'var(--surface-2, #222)',
              color:
                category === c ? 'var(--surface-1, #111)' : 'var(--fg-dim, #888)',
              cursor: 'pointer',
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '0 12px 12px',
        }}
      >
        {offline && <OfflineEmpty message={error ?? undefined} onRetry={() => void search({})} />}
        {!offline && error && (
          <div style={{ color: 'var(--c-red, #d66)', fontSize: 12 }}>{error}</div>
        )}
        {!offline && !error && items.length === 0 && !loading && (
          <div style={{ color: 'var(--fg-dim, #888)', fontSize: 12, textAlign: 'center', padding: 16 }}>
            no extensions match
          </div>
        )}
        {items.map((ext) => (
          <ExtensionCard
            key={ext.id}
            ext={ext}
            installed={installedIds.has(ext.id)}
            onClick={() => onSelect(ext)}
          />
        ))}
      </div>
    </div>
  )
}
