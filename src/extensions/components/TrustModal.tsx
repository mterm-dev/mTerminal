import { useEffect, useState, type CSSProperties } from 'react'
import { getTrustQueue, persistTrust, type TrustRequest } from '../trust-flow'

/**
 * Renders pending trust requests as a stacked dialog. If multiple plugins
 * want to activate at once, the user sees one dialog with per-row toggles
 * (anti-spam from the plan §11).
 *
 * Mounted unconditionally by PluginUiHost; only renders when the queue has
 * pending entries.
 */

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9000,
}

const panel: CSSProperties = {
  background: 'var(--surface, #1b1714)',
  color: 'var(--text, #efe7da)',
  borderRadius: 8,
  padding: '20px 24px',
  width: 'min(560px, 90vw)',
  maxHeight: '85vh',
  overflow: 'auto',
  boxShadow: 'var(--shadow-2, 0 12px 40px rgba(10, 8, 6, 0.55))',
}

const titleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  marginBottom: 8,
}

const intro: CSSProperties = {
  fontSize: 13,
  opacity: 0.8,
  lineHeight: 1.4,
  marginBottom: 16,
}

const row: CSSProperties = {
  border: '1px solid var(--border, #f0e4d11f)',
  borderRadius: 6,
  padding: 12,
  marginBottom: 10,
}

const buttonRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8,
}

const btn: CSSProperties = {
  padding: '6px 14px',
  borderRadius: 4,
  border: '1px solid var(--border, #f0e4d11f)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 13,
}

const btnPrimary: CSSProperties = {
  ...btn,
  background: 'var(--accent, #d7693a)',
  borderColor: 'var(--accent, #d7693a)',
  color: 'var(--on-accent, #fdfaf4)',
}

export function TrustModal() {
  const [requests, setRequests] = useState<TrustRequest[]>(() => getTrustQueue().list())

  useEffect(() => {
    const off = getTrustQueue().subscribe(() => {
      setRequests(getTrustQueue().list())
    })
    return off
  }, [])

  if (requests.length === 0) return null

  const decide = async (id: string, trusted: boolean): Promise<void> => {
    if (trusted) await persistTrust(id, true)
    getTrustQueue().decide(id, trusted)
  }
  const decideAll = async (trusted: boolean): Promise<void> => {
    if (trusted) {
      for (const r of requests) await persistTrust(r.id, true)
    }
    getTrustQueue().decideAll(trusted)
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true">
      <div style={panel}>
        <div style={titleStyle}>
          {requests.length === 1
            ? 'Trust extension?'
            : `${requests.length} extensions request activation`}
        </div>
        <div style={intro}>
          Capabilities listed below are <strong>not enforced</strong>. Extensions run with
          full access to your terminal sessions, files, and network. Only trust extensions
          you would run as a normal program.
        </div>
        {requests.map((req) => (
          <div key={req.id} style={row}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {req.displayName}
              <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 12, marginLeft: 8 }}>
                {req.id} · {req.source}
              </span>
            </div>
            {req.capabilities.length > 0 && (
              <ul style={{ fontSize: 12, opacity: 0.85, paddingLeft: 18, margin: '4px 0' }}>
                {req.capabilities.map((cap) => (
                  <li key={cap}>{cap}</li>
                ))}
              </ul>
            )}
            <div style={buttonRow}>
              <button style={btn} onClick={() => void decide(req.id, false)}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={() => void decide(req.id, true)}>
                Trust
              </button>
            </div>
          </div>
        ))}
        {requests.length > 1 && (
          <div style={{ ...buttonRow, marginTop: 12 }}>
            <button style={btn} onClick={() => void decideAll(false)}>
              Cancel all
            </button>
            <button style={btnPrimary} onClick={() => void decideAll(true)}>
              Trust all
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
