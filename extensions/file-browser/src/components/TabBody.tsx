import React, { useCallback, useEffect, useState } from 'react'
import { FileBrowserPane, type CtxBridge } from './FileBrowserPane'
import { FileEditor } from './FileEditor'
import {
  DEFAULT_BROWSER_STATE,
  type FileBackend,
  type FileBrowserClipboard,
  type FileBrowserState,
} from '../shared/types'

interface ExtCtx extends CtxBridge {
  events: {
    on(event: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  workspace: {
    cwd(): string | null
  }
  tabs: {
    close(tabId: number): void
  }
}

interface InitialProps {
  initialCwd?: string
}

interface Props {
  ctx: ExtCtx
  tabId: number
  initial: InitialProps
}

export function TabBody({ ctx, tabId, initial }: Props): React.JSX.Element {
  const [state, setState] = useState<FileBrowserState>(() => ({
    ...DEFAULT_BROWSER_STATE,
    backend: { kind: 'local' } satisfies FileBackend,
    cwd: initial.initialCwd ?? null,
  }))

  useEffect(() => {
    if (state.cwd) return
    void (async () => {
      try {
        const home = await ctx.ipc.invoke<string>('fs:home', {})
        setState((s) => (s.cwd ? s : { ...s, cwd: home }))
      } catch {
        /* ignore */
      }
    })()
  }, [ctx, state.cwd])

  const onPatchState = useCallback((patch: Partial<FileBrowserState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const onClipboard = useCallback((clip: FileBrowserClipboard | null) => {
    setState((s) => ({
      ...s,
      clipboard: clip ? { ...clip, sourceViewKey: `t:${tabId}` } : null,
    }))
  }, [tabId])

  const [editing, setEditing] = useState<{ path: string; backend: FileBackend } | null>(null)

  const onOpenEditor = useCallback((path: string, backend: FileBackend) => {
    setEditing({ path, backend })
  }, [])

  return (
    <>
      <FileBrowserPane
        ctx={ctx}
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
          ctx={ctx}
          backend={editing.backend}
          path={editing.path}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
