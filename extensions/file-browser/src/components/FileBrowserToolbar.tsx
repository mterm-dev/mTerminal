import React from 'react'
import {
  IconArrowDown,
  IconArrowRight,
  IconChevronsDown,
  IconChevronsUp,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconRefresh,
} from './icons'
import type { FileBackend } from '../shared/types'

interface Props {
  cwd: string | null
  backend: FileBackend | null
  showHidden: boolean
  hasActiveTerminal: boolean
  sftpStatus: 'connected' | 'disconnected' | 'idle'
  onSyncFromTerminal: () => void
  onCdTerminalHere: () => void
  onRefresh: () => void
  onToggleHidden: () => void
  onExpandAll: () => void
  onCollapseAll: () => void
  onNewFolder: () => void
  onNewFile: () => void
  onNavigate: (path: string) => void
  onReconnect: () => void
}

function splitPath(backend: FileBackend | null, p: string): Array<{ label: string; path: string }> {
  if (!p) return []
  const isPosix = !backend || backend.kind === 'sftp' || !p.includes('\\')
  const sep = isPosix ? '/' : '\\'
  const segments = p.split(sep)
  const out: Array<{ label: string; path: string }> = []
  let acc = ''
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (i === 0) {
      acc = s === '' ? sep : s
      out.push({ label: s === '' ? sep : s, path: acc })
    } else if (s === '') {
      continue
    } else {
      acc = acc.endsWith(sep) ? acc + s : acc + sep + s
      out.push({ label: s, path: acc })
    }
  }
  return out
}

export function FileBrowserToolbar(props: Props): React.JSX.Element {
  const { cwd, backend, showHidden, hasActiveTerminal, sftpStatus } = props
  const segments = cwd ? splitPath(backend, cwd) : []
  return (
    <div className="fb-toolbar">
      <div className="fb-toolbar-row">
        <button
          className="ghost-btn small"
          onClick={props.onSyncFromTerminal}
          disabled={!hasActiveTerminal}
          title="sync cwd from active terminal"
          aria-label="sync from terminal"
        >
          <IconArrowDown />
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onCdTerminalHere}
          disabled={!hasActiveTerminal || !cwd}
          title="cd active terminal here"
          aria-label="cd terminal here"
        >
          <IconArrowRight />
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onRefresh}
          disabled={!cwd}
          title="refresh"
          aria-label="refresh"
        >
          <IconRefresh />
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onToggleHidden}
          title={showHidden ? 'hide dotfiles' : 'show dotfiles'}
          aria-label="toggle hidden"
        >
          {showHidden ? <IconEye /> : <IconEyeOff />}
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onExpandAll}
          disabled={!cwd}
          title="expand all directories"
          aria-label="expand all directories"
        >
          <IconChevronsDown />
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onCollapseAll}
          disabled={!cwd}
          title="collapse all directories"
          aria-label="collapse all directories"
        >
          <IconChevronsUp />
        </button>
        <span className="fb-spacer" />
        <button
          className="ghost-btn small"
          onClick={props.onNewFolder}
          disabled={!cwd}
          title="new folder"
          aria-label="new folder"
        >
          <IconPlus />
          <span style={{ marginLeft: 2 }}>dir</span>
        </button>
        <button
          className="ghost-btn small"
          onClick={props.onNewFile}
          disabled={!cwd}
          title="new file"
          aria-label="new file"
        >
          <IconPlus />
          <span style={{ marginLeft: 2 }}>file</span>
        </button>
      </div>
      <div className="fb-breadcrumbs">
        {segments.length === 0 && <span className="fb-bc-empty">no cwd — click sync</span>}
        {segments.map((s, idx) => (
          <React.Fragment key={s.path + ':' + idx}>
            {idx > 0 && <span className="fb-bc-sep">/</span>}
            <button
              className="fb-bc-seg"
              onClick={() => props.onNavigate(s.path)}
              title={s.path}
            >
              {s.label}
            </button>
          </React.Fragment>
        ))}
      </div>
      {backend?.kind === 'sftp' && sftpStatus !== 'connected' && (
        <div className="fb-sftp-banner" onClick={props.onReconnect} role="button">
          {sftpStatus === 'idle' ? 'sftp idle' : 'sftp disconnected'} — click to reconnect
        </div>
      )}
    </div>
  )
}
