import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileBrowserPane, type CtxBridge } from './FileBrowserPane'
import { FileEditor } from './FileEditor'
import { createFsIpc, type SftpServiceLike, type ServiceProxyLike } from '../lib/sftp-adapter'
import {
  DEFAULT_BROWSER_STATE,
  type FileBackend,
  type FileBrowserClipboard,
  type FileBrowserState,
} from '../shared/types'

interface ExtCtx {
  ipc: { invoke<T = unknown>(channel: string, args?: unknown): Promise<T> }
  services: Record<string, { available: boolean; impl: unknown }>
  ui: CtxBridge['ui']
  terminal: CtxBridge['terminal']
  events: { on(event: string, cb: (payload: unknown) => void): { dispose(): void } }
  workspace: { cwd(): string | null }
  tabs: { close(tabId: number): void }
}

interface InitialProps {
  initialCwd?: string
  backend?: FileBackend
}

interface Props {
  ctx: ExtCtx
  tabId: number
  initial: InitialProps
}

export function TabBody({ ctx, tabId, initial }: Props): React.JSX.Element {
  const initialBackend: FileBackend = initial.backend ?? { kind: 'local' }

  const sftpProxy = useMemo(
    () =>
      (ctx.services['sftp-fs'] as ServiceProxyLike<SftpServiceLike> | undefined) ?? null,
    [ctx.services],
  )

  const ipc = useMemo(() => createFsIpc(ctx.ipc, sftpProxy), [ctx.ipc, sftpProxy])

  const bridge: CtxBridge = useMemo(
    () => ({
      ipc,
      ui: ctx.ui,
      terminal: ctx.terminal,
    }),
    [ipc, ctx.ui, ctx.terminal],
  )

  const [state, setState] = useState<FileBrowserState>(() => ({
    ...DEFAULT_BROWSER_STATE,
    backend: initialBackend,
    cwd: initialBackend.kind === 'local' ? initial.initialCwd ?? null : null,
  }))

  useEffect(() => {
    if (state.cwd) return
    const backend = state.backend
    if (!backend) return
    let cancelled = false
    void (async () => {
      try {
        if (backend.kind === 'sftp') {
          await ipc.invoke('sftp:connect', { hostId: backend.hostId })
        }
        const channel = backend.kind === 'sftp' ? 'sftp:home' : 'fs:home'
        const args = backend.kind === 'sftp' ? { hostId: backend.hostId } : {}
        const home = await ipc.invoke<string>(channel, args)
        if (cancelled) return
        setState((s) => (s.cwd ? s : { ...s, cwd: home }))
      } catch (err) {
        if (!cancelled) {
          ctx.ui.toast({ kind: 'error', message: `cannot open: ${(err as Error).message}` })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ipc, ctx.ui, state.backend, state.cwd])

  const onPatchState = useCallback((patch: Partial<FileBrowserState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const onClipboard = useCallback(
    (clip: FileBrowserClipboard | null) => {
      setState((s) => ({
        ...s,
        clipboard: clip ? { ...clip, sourceViewKey: `t:${tabId}` } : null,
      }))
    },
    [tabId],
  )

  const [editing, setEditing] = useState<{ path: string; backend: FileBackend } | null>(null)

  const onOpenEditor = useCallback((path: string, backend: FileBackend) => {
    setEditing({ path, backend })
  }, [])

  return (
    <>
      <FileBrowserPane
        ctx={bridge}
        state={state}
        backend={state.backend}
        activeTabCwd={ctx.workspace.cwd()}
        onPatchState={onPatchState}
        onClipboard={onClipboard}
        onClose={() => ctx.tabs.close(tabId)}
        onOpenEditor={onOpenEditor}
      />
      {editing && (
        <FileEditor
          ctx={bridge}
          backend={editing.backend}
          path={editing.path}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
