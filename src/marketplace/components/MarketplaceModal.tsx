import { useEffect, useState } from 'react'
import { marketplaceApi } from '../api'
import type { ExtSummary, InstalledWithMeta } from '../types'
import { BrowseTab } from './BrowseTab'
import { InstalledTab } from './InstalledTab'
import { UpdatesTab } from './UpdatesTab'
import { ExtensionDetailsView } from './ExtensionDetailsView'
import { useUpdates } from '../hooks/useUpdates'

type Tab = 'browse' | 'installed' | 'updates'

interface Props {
  open: boolean
  onClose: () => void
}

export function MarketplaceModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('browse')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledWithMeta[]>([])
  const { count: updateCount } = useUpdates()

  const refreshInstalled = async () => {
    try {
      const list = await marketplaceApi.listInstalled()
      setInstalled(list)
    } catch {
      setInstalled([])
    }
  }

  useEffect(() => {
    if (open) {
      void refreshInstalled()
      setSelectedId(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const installedIds = new Set(installed.map((it) => it.id))
  const installedVersionFor = (id: string): string | null =>
    installed.find((it) => it.id === id)?.installedVersion ?? null

  const handleSelect = (ext: ExtSummary) => setSelectedId(ext.id)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 720,
          maxWidth: 'calc(100vw - 60px)',
          height: 560,
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-subtle, #2a2a2a)',
          }}
        >
          <div style={{ display: 'flex', gap: 4 }}>
            <TabButton active={tab === 'browse'} onClick={() => { setTab('browse'); setSelectedId(null) }}>
              browse
            </TabButton>
            <TabButton active={tab === 'installed'} onClick={() => { setTab('installed'); setSelectedId(null) }}>
              installed
            </TabButton>
            <TabButton active={tab === 'updates'} onClick={() => { setTab('updates'); setSelectedId(null) }}>
              updates{updateCount > 0 ? ` (${updateCount})` : ''}
            </TabButton>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              color: 'var(--fg-dim, #888)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {selectedId ? (
            <ExtensionDetailsView
              id={selectedId}
              installedVersion={installedVersionFor(selectedId)}
              onBack={() => setSelectedId(null)}
              onChanged={() => void refreshInstalled()}
            />
          ) : tab === 'browse' ? (
            <BrowseTab installedIds={installedIds} onSelect={handleSelect} />
          ) : tab === 'installed' ? (
            <InstalledTab onRefresh={() => void refreshInstalled()} />
          ) : (
            <UpdatesTab />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        fontSize: 12,
        background: active ? 'var(--surface-2, #222)' : 'transparent',
        color: active ? 'var(--fg, #e9e9e9)' : 'var(--fg-dim, #888)',
        border: '1px solid',
        borderColor: active ? 'var(--border-subtle, #2a2a2a)' : 'transparent',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
