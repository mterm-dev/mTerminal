import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getRendererHost, type ManifestSnapshot } from '../host-renderer'

/**
 * Plugin Manager UI — installed plugins list with enable/disable, reload,
 * trust badges, capability chips, and a basic install affordance.
 *
 * Wireframe (plan §10):
 *
 *   ┌── Extensions › Installed ──────────────────────────┐
 *   │ [+ Install] (npm | url | folder)        [Reload]   │
 *   │ ─────────────────────────────────────────────────  │
 *   │ ⬢ Git Panel       v1.0.0  [trusted] [enabled]      │
 *   │   Built-in · 2 commands · 1 panel                  │
 *   │   [⚙ settings] [⟳ reload] [✕ disable]              │
 *   │ ──────────────────────────────────────────────     │
 *   │ ⬡ Tailscale       v0.1.0  [untrusted]              │
 *   │   from github:foo/...  [▶ trust & enable]          │
 *   └────────────────────────────────────────────────────┘
 *
 * For v1: install-from-url is just a placeholder that surfaces
 * `ext:install not yet implemented`. Local-folder workflow is documented:
 * drop a folder under `~/.mterminal/extensions/<id>/` and click Reload.
 */

const wrap: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 12,
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
}

const inputRow: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
}

const input: CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #444)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
}

const select: CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  border: '1px solid var(--border, #444)',
  background: 'transparent',
  color: 'inherit',
  fontSize: 13,
}

const btn: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  border: '1px solid var(--border, #444)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
}

const btnPrimary: CSSProperties = {
  ...btn,
  background: 'var(--accent, #4a90e2)',
  borderColor: 'var(--accent, #4a90e2)',
  color: 'white',
}

const card: CSSProperties = {
  border: '1px solid var(--border, #333)',
  borderRadius: 6,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const cardHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const cardName: CSSProperties = {
  fontWeight: 600,
}

const cardSub: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
}

const chip: CSSProperties = {
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border, #555)',
  opacity: 0.85,
}

const chipBuiltIn: CSSProperties = { ...chip, borderColor: '#4a90e2', color: '#7eb6f0' }
const chipUntrusted: CSSProperties = { ...chip, borderColor: '#c79534', color: '#e6b86b' }
const chipDisabled: CSSProperties = { ...chip, borderColor: '#666', opacity: 0.5 }
const chipError: CSSProperties = { ...chip, borderColor: '#c0413a', color: '#f08075' }
const chipProposed: CSSProperties = { ...chip, borderColor: '#c79534', color: '#e6b86b' }

const actionRow: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  marginTop: 4,
}

const errorBox: CSSProperties = {
  marginTop: 4,
  padding: '6px 8px',
  borderRadius: 4,
  background: 'rgba(192, 65, 58, 0.1)',
  border: '1px solid rgba(192, 65, 58, 0.4)',
  color: '#f08075',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
}

export function PluginManager() {
  const host = getRendererHost()
  const [snaps, setSnaps] = useState<ManifestSnapshot[]>(() => host.list())
  const [installSource, setInstallSource] = useState<'folder' | 'npm' | 'url'>('folder')
  const [installRef, setInstallRef] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)

  useEffect(() => {
    return host.subscribe(() => setSnaps(host.list()))
  }, [host])

  const sortedSnaps = useMemo(() => {
    return [...snaps].sort((a, b) => {
      const sourceRank = (s: 'built-in' | 'user'): number => (s === 'built-in' ? 0 : 1)
      const sa = sourceRank(a.manifest.source)
      const sb = sourceRank(b.manifest.source)
      if (sa !== sb) return sa - sb
      return (a.manifest.displayName ?? a.manifest.id).localeCompare(
        b.manifest.displayName ?? b.manifest.id,
      )
    })
  }, [snaps])

  const reloadAll = async (): Promise<void> => {
    setBusy('all')
    try {
      await window.mt.ext.reloadAll()
      await host.refreshSnapshots()
    } finally {
      setBusy(null)
    }
  }

  const toggleEnabled = async (snap: ManifestSnapshot): Promise<void> => {
    setBusy(snap.manifest.id)
    try {
      if (snap.enabled) {
        await window.mt.ext.disable(snap.manifest.id)
      } else {
        await window.mt.ext.enable(snap.manifest.id)
      }
      await host.refreshSnapshots()
    } finally {
      setBusy(null)
    }
  }

  const reloadOne = async (snap: ManifestSnapshot): Promise<void> => {
    setBusy(snap.manifest.id)
    try {
      await host.reload(snap.manifest.id)
    } finally {
      setBusy(null)
    }
  }

  const trustOne = async (snap: ManifestSnapshot, trusted: boolean): Promise<void> => {
    setBusy(snap.manifest.id)
    try {
      await window.mt.ext.setTrusted(snap.manifest.id, trusted)
      await host.refreshSnapshots()
    } finally {
      setBusy(null)
    }
  }

  const uninstallOne = async (snap: ManifestSnapshot): Promise<void> => {
    if (snap.manifest.source === 'built-in') return
    if (!window.confirm(`Uninstall extension "${snap.manifest.displayName ?? snap.manifest.id}"?`)) {
      return
    }
    setBusy(snap.manifest.id)
    try {
      await window.mt.ext.uninstall(snap.manifest.id)
      await host.refreshSnapshots()
    } catch (err) {
      window.alert(`Uninstall failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const submitInstall = async (): Promise<void> => {
    setInstallError(null)
    if (!installRef.trim()) return
    setBusy('install')
    try {
      await window.mt.ext.install(installSource, installRef.trim())
      setInstallRef('')
      await host.refreshSnapshots()
    } catch (err) {
      setInstallError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={wrap}>
      <div style={headerRow}>
        <strong>Installed extensions</strong>
        <button style={btn} onClick={() => void reloadAll()} disabled={busy !== null}>
          {busy === 'all' ? 'Reloading…' : 'Reload all'}
        </button>
      </div>

      <div style={inputRow}>
        <select
          style={select}
          value={installSource}
          onChange={(e) => setInstallSource(e.target.value as 'folder' | 'npm' | 'url')}
        >
          <option value="folder">Folder path</option>
          <option value="npm">npm package</option>
          <option value="url">Git URL</option>
        </select>
        <input
          style={input}
          placeholder={
            installSource === 'folder'
              ? '/abs/path/to/extension'
              : installSource === 'npm'
                ? 'mterminal-plugin-foo'
                : 'https://github.com/owner/mterminal-plugin-foo'
          }
          value={installRef}
          onChange={(e) => setInstallRef(e.target.value)}
        />
        <button
          style={btnPrimary}
          onClick={() => void submitInstall()}
          disabled={busy !== null || !installRef.trim()}
        >
          Install
        </button>
      </div>
      {installError && <div style={errorBox}>{installError}</div>}

      {sortedSnaps.length === 0 && (
        <div style={cardSub}>
          No extensions installed. Drop one in <code>~/.mterminal/extensions/&lt;id&gt;/</code>{' '}
          and click <em>Reload all</em>.
        </div>
      )}

      {sortedSnaps.map((snap) => {
        const m = snap.manifest
        const isBusy = busy === m.id
        return (
          <div key={m.id} style={card}>
            <div style={cardHeader}>
              <div style={cardName}>{m.displayName ?? m.id}</div>
              <div style={cardSub}>v{m.version}</div>
              {m.source === 'built-in' && <span style={chipBuiltIn}>built-in</span>}
              {snap.enabled ? null : <span style={chipDisabled}>disabled</span>}
              {!snap.trusted && <span style={chipUntrusted}>untrusted</span>}
              {snap.lastError && <span style={chipError}>error</span>}
              {m.enabledApiProposals.length > 0 && (
                <span style={chipProposed} title={m.enabledApiProposals.join(', ')}>
                  uses proposed API
                </span>
              )}
              <div style={{ flex: 1 }} />
              <div style={cardSub}>{snap.state}</div>
            </div>

            <div style={cardSub}>
              {m.contributes.commands.length} commands · {m.contributes.panels.length} panels ·{' '}
              {m.contributes.statusBar.length} status items · {m.contributes.themes.length} themes
            </div>

            {m.capabilities.length > 0 && (
              <div style={{ ...cardSub, fontSize: 11 }}>
                capabilities: {m.capabilities.join(', ')}
              </div>
            )}

            {snap.lastError && <div style={errorBox}>{snap.lastError.message}</div>}

            <div style={actionRow}>
              <button style={btn} onClick={() => void reloadOne(snap)} disabled={isBusy}>
                {isBusy ? '…' : 'Reload'}
              </button>
              <button style={btn} onClick={() => void toggleEnabled(snap)} disabled={isBusy}>
                {snap.enabled ? 'Disable' : 'Enable'}
              </button>
              {!snap.trusted && (
                <button style={btnPrimary} onClick={() => void trustOne(snap, true)} disabled={isBusy}>
                  Trust & activate
                </button>
              )}
              {snap.trusted && m.source !== 'built-in' && (
                <button style={btn} onClick={() => void trustOne(snap, false)} disabled={isBusy}>
                  Untrust
                </button>
              )}
              {m.source !== 'built-in' && (
                <button style={btn} onClick={() => void uninstallOne(snap)} disabled={isBusy}>
                  Uninstall
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
