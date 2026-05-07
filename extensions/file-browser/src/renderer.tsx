import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { TabBody } from './components/TabBody'

interface ExtCtx {
  id: string
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }
  tabs: {
    registerTabType(spec: {
      id: string
      title: string
      icon?: string
      factory(props: { tabId: number; active: boolean; props: unknown; ctx: unknown }): {
        mount(host: HTMLElement): void
        unmount(): void
        onFocus?(): void
        onBlur?(): void
      }
    }): { dispose(): void }
    open(args: {
      type: string
      title?: string
      props?: unknown
      groupId?: string | null
    }): Promise<number>
  }
  commands: {
    register(c: { id: string; title?: string; run: (args?: unknown) => unknown }): { dispose(): void }
    execute<T = unknown>(id: string, args?: unknown): Promise<T>
  }
  keybindings: {
    register(k: { command: string; key: string; when?: string }): { dispose(): void }
  }
  workspace: {
    activeGroup(): string | null
    tabs(): Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>
    cwd(): string | null
  }
  events: {
    on(event: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  }
  services: Record<string, { available: boolean; impl: unknown }>
  ui: {
    confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>
    prompt(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string }): Promise<string | undefined>
    toast(opts: { kind?: 'info' | 'success' | 'warn' | 'error'; message: string }): void
  }
  terminal: {
    active(): {
      tabId: number
      cwd: string | null
      write(data: string): Promise<void>
    } | null
  }
  mt: typeof window.mt
  subscribe(d: { dispose(): void } | (() => void)): void
}

const STYLE_ID = 'file-browser-ext-styles'
const CSS = `
.fb-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background: transparent;
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  user-select: none;
}
.fb-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  letter-spacing: 0.04em;
  color: var(--fg-dim);
  text-transform: lowercase;
  border-bottom: 1px solid var(--border-subtle);
}
.fb-toolbar {
  flex-shrink: 0;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--border-subtle);
}
.fb-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.fb-spacer { flex: 1; }
.fb-breadcrumbs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fb-bc-empty { color: var(--fg-dim); font-style: italic; }
.fb-bc-seg {
  background: transparent;
  border: 0;
  color: var(--fg-muted);
  cursor: pointer;
  font: inherit;
  padding: 1px 4px;
  border-radius: var(--r-sm);
  transition: color 0.12s, background 0.12s;
  flex-shrink: 0;
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fb-bc-seg:hover { color: var(--fg); background: var(--bg-hover); }
.fb-bc-sep { color: var(--fg-dim); padding: 0 1px; flex-shrink: 0; }
.fb-sftp-banner {
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  padding: 4px 8px;
  border-radius: var(--r-sm);
  background: color-mix(in oklch, var(--c-amber) 14%, transparent);
  color: var(--c-amber);
  cursor: pointer;
}
.fb-body {
  flex: 1;
  overflow: auto;
  padding: 4px 0;
  min-height: 0;
}
.fb-body::-webkit-scrollbar { width: 8px; }
.fb-body::-webkit-scrollbar-track { background: transparent; }
.fb-body::-webkit-scrollbar-thumb { background: var(--n-250); border-radius: 4px; }
.fb-body::-webkit-scrollbar-thumb:hover { background: var(--n-300); }
.fb-loading, .fb-empty, .fb-error {
  padding: 12px;
  color: var(--fg-dim);
  text-align: center;
  font-family: var(--font-sans);
  font-size: var(--t-xs);
  font-style: italic;
}
.fb-error { color: var(--err); font-style: normal; }
.fb-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 22px;
  margin: 1px 4px;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg-muted);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  border-radius: var(--r-sm);
  transition: color 0.1s, background 0.1s;
  position: relative;
  user-select: none;
}
.fb-node::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background 0.12s;
}
.fb-node:hover {
  color: var(--fg);
  background: var(--bg-hover);
}
.fb-node.selected {
  color: var(--fg);
  background: var(--bg-active);
}
.fb-node.selected::before {
  background: var(--group-accent, var(--accent));
}
.fb-node.hidden-file { color: var(--fg-disabled); }
.fb-node.hidden-file:hover, .fb-node.hidden-file.selected { color: var(--fg-muted); }
.fb-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 12px;
  color: var(--fg-dim);
  font-size: 9px;
  flex-shrink: 0;
}
.fb-chevron:empty { visibility: hidden; }
.fb-icon {
  width: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.fb-icon svg { display: block; }
.fb-name {
  text-overflow: ellipsis;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.fb-spinner {
  margin-left: auto;
  color: var(--fg-dim);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  flex-shrink: 0;
}
.fb-children { margin-left: 0; }

.fb-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  font-family: var(--font-sans);
  font-size: var(--t-sm);
  color: var(--fg);
}
.fb-editor-modal {
  width: min(1200px, 100%);
  height: min(800px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.04);
  overflow: hidden;
}
.fb-editor-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  min-width: 0;
}
.fb-editor-title {
  font-family: var(--font-sans);
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--fg);
  letter-spacing: -0.01em;
  white-space: nowrap;
  flex-shrink: 0;
}
.fb-editor-dirty {
  color: var(--accent);
  font-weight: 700;
  margin-left: 2px;
}
.fb-editor-path {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.fb-editor-body {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--bg-base);
}
.fb-editor-host {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.fb-editor-host > .cm-editor {
  height: 100%;
  outline: none;
}
.fb-editor-host .cm-scroller {
  scrollbar-gutter: stable;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar {
  width: 12px;
  height: 12px;
  background: transparent;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.025);
  border-radius: 6px;
  margin: 4px 0;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb {
  background: var(--n-300);
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 6px;
  min-height: 30px;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb:hover {
  background: var(--n-500);
  background-clip: padding-box;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-thumb:active {
  background: var(--n-600);
  background-clip: padding-box;
}
.fb-editor-host .cm-scroller::-webkit-scrollbar-corner {
  background: transparent;
}
.fb-editor-status {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-dim);
  font-style: italic;
  padding: 24px;
}
.fb-editor-error { color: var(--err); font-style: normal; }
.fb-editor-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-muted);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  color: var(--fg-dim);
}
`

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface InitialProps {
  initialCwd?: string
}

export function activate(ctx: ExtCtx): void {
  ctx.logger.info('file-browser renderer activated')
  ensureStyles()

  ctx.subscribe(
    ctx.tabs.registerTabType({
      id: 'file-browser',
      title: 'files',
      factory: ({ tabId, props }) => {
        let root: Root | null = null
        return {
          mount(host: HTMLElement) {
            root = createRoot(host)
            root.render(
              <TabBody ctx={ctx} tabId={tabId} initial={(props ?? {}) as InitialProps} />,
            )
          },
          unmount() {
            try {
              root?.unmount()
            } catch {
              /* ignore */
            }
            root = null
          },
        }
      },
    }),
  )

  ctx.subscribe(
    ctx.commands.register({
      id: 'fileBrowser.openInActiveGroup',
      title: 'File Browser: Open in active group',
      run: async () => {
        const groupId = ctx.workspace.activeGroup()
        const cwd = ctx.workspace.cwd() ?? undefined
        await ctx.tabs.open({
          type: 'file-browser',
          title: 'files',
          groupId: groupId ?? undefined,
          props: { initialCwd: cwd },
        })
      },
    }),
  )

  ctx.subscribe(
    ctx.keybindings.register({
      command: 'fileBrowser.openInActiveGroup',
      key: 'Ctrl+B',
    }),
  )
}

export function deactivate(): void {
  /* ctx.subscribe handlers run automatically */
}
