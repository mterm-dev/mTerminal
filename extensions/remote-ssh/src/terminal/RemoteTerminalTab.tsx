import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { SftpAuthBundle } from '../shared/types'

export interface RemoteTerminalDeps {
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
    on(channel: string, cb: (payload: unknown) => void): { dispose(): void }
  }
  resolveAuth(hostId: string): Promise<SftpAuthBundle>
  logger?: { info(...a: unknown[]): void; error(...a: unknown[]): void }
}

export interface TerminalTabProps {
  hostId: string
}

interface TerminalOptionsSnapshot {
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  theme: ITheme
}

const TERM_OPTIONS_KEY = '__MT_TERMINAL_OPTIONS'
const TERM_OPTIONS_EVENT = 'mterminal:terminal-options-change'

const FALLBACK_OPTIONS: TerminalOptionsSnapshot = {
  fontFamily:
    '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  theme: {
    background: '#0c0c0c',
    foreground: '#ebebeb',
    cursor: '#f5b056',
    cursorAccent: '#0c0c0c',
    selectionBackground: 'rgba(245, 176, 86, 0.30)',
  },
}

function getSharedOptions(): TerminalOptionsSnapshot {
  if (typeof window === 'undefined') return FALLBACK_OPTIONS
  const cur = (window as unknown as { [TERM_OPTIONS_KEY]?: TerminalOptionsSnapshot })[
    TERM_OPTIONS_KEY
  ]
  return cur ?? FALLBACK_OPTIONS
}

function copyToClipboard(text: string): void {
  try {
    void navigator.clipboard?.writeText(text)
  } catch {
    // ignore
  }
}

export class RemoteTerminalTab {
  private term: Terminal | null = null
  private fit: FitAddon | null = null
  private sessionId: string | null = null
  private dataSub: { dispose(): void } | null = null
  private exitSub: { dispose(): void } | null = null
  private resizeObserver: ResizeObserver | null = null
  private fitTimer: ReturnType<typeof setTimeout> | null = null
  private optionsUnsubscribe: (() => void) | null = null
  private selectionDisposable: { dispose(): void } | null = null
  private currentCopyOnSelect = false
  private disposed = false
  private mounted = false

  constructor(
    private deps: RemoteTerminalDeps,
    private tabProps: TerminalTabProps,
  ) {}

  async mount(host: HTMLElement): Promise<void> {
    if (this.mounted) return
    this.mounted = true
    host.classList.add('rs-terminal-host')

    const opts = getSharedOptions()
    const term = new Terminal({
      fontFamily: opts.fontFamily,
      fontSize: opts.fontSize,
      lineHeight: opts.lineHeight,
      letterSpacing: 0,
      cursorBlink: opts.cursorBlink,
      cursorStyle: opts.cursorStyle,
      cursorWidth: opts.cursorStyle === 'bar' ? 2 : 1,
      allowTransparency: true,
      allowProposedApi: true,
      convertEol: false,
      scrollback: opts.scrollback,
      smoothScrollDuration: 80,
      theme: opts.theme,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(host)
    this.term = term
    this.fit = fit

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return true
      if (e.key.toLowerCase() !== 'c') return true
      const sel = term.getSelection()
      if (!sel) return true
      copyToClipboard(sel)
      term.clearSelection()
      return false
    })

    this.applyCopyOnSelect(opts.copyOnSelect)
    this.optionsUnsubscribe = this.subscribeOptions((next) => this.applyOptions(next))

    try {
      fit.fit()
    } catch {
      // ignore
    }

    term.onData((data) => {
      if (!this.sessionId || this.disposed) return
      void this.deps.ipc.invoke('shell:write', { sessionId: this.sessionId, data })
    })

    term.onResize(({ rows, cols }) => {
      if (!this.sessionId || this.disposed) return
      void this.deps.ipc.invoke('shell:resize', { sessionId: this.sessionId, rows, cols })
    })

    this.resizeObserver = new ResizeObserver(() => this.scheduleFit())
    this.resizeObserver.observe(host)

    try {
      const auth = await this.deps.resolveAuth(this.tabProps.hostId)
      const initial = fit.proposeDimensions() ?? { rows: term.rows, cols: term.cols }
      const result = await this.deps.ipc.invoke<{ sessionId: string; banner?: string }>(
        'shell:spawn',
        { auth, rows: initial.rows, cols: initial.cols },
      )
      if (this.disposed) {
        void this.deps.ipc.invoke('shell:kill', { sessionId: result.sessionId })
        return
      }
      this.sessionId = result.sessionId
      if (result.banner) {
        term.write(`\x1b[2m${result.banner}\x1b[0m\r\n`)
      }
      this.dataSub = this.deps.ipc.on(`shell:data:${result.sessionId}`, (chunk) => {
        if (typeof chunk === 'string') term.write(chunk)
      })
      this.exitSub = this.deps.ipc.on(`shell:exit:${result.sessionId}`, () => {
        term.write('\r\n\x1b[2m[connection closed]\x1b[0m\r\n')
      })
    } catch (err) {
      term.write(`\r\n\x1b[31m${(err as Error).message ?? String(err)}\x1b[0m\r\n`)
      this.deps.logger?.error?.('shell spawn failed', err)
    }
  }

  unmount(): void {
    if (this.disposed) return
    this.disposed = true
    this.optionsUnsubscribe?.()
    this.optionsUnsubscribe = null
    this.selectionDisposable?.dispose()
    this.selectionDisposable = null
    this.dataSub?.dispose()
    this.exitSub?.dispose()
    this.dataSub = null
    this.exitSub = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.fitTimer) clearTimeout(this.fitTimer)
    this.fitTimer = null
    if (this.sessionId) {
      const sid = this.sessionId
      this.sessionId = null
      void this.deps.ipc.invoke('shell:kill', { sessionId: sid }).catch(() => {})
    }
    try {
      this.term?.dispose()
    } catch {
      // ignore
    }
    this.term = null
    this.fit = null
  }

  onResize(): void {
    this.scheduleFit()
  }

  onFocus(): void {
    this.term?.focus()
  }

  private scheduleFit(): void {
    if (this.fitTimer) clearTimeout(this.fitTimer)
    this.fitTimer = setTimeout(() => {
      try {
        this.fit?.fit()
      } catch {
        // ignore
      }
    }, 30)
  }

  private subscribeOptions(cb: (next: TerminalOptionsSnapshot) => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<TerminalOptionsSnapshot>).detail
      if (detail) cb(detail)
    }
    window.addEventListener(TERM_OPTIONS_EVENT, handler)
    return () => window.removeEventListener(TERM_OPTIONS_EVENT, handler)
  }

  private applyOptions(next: TerminalOptionsSnapshot): void {
    const term = this.term
    if (!term) return
    try {
      term.options.fontFamily = next.fontFamily
      term.options.fontSize = next.fontSize
      term.options.lineHeight = next.lineHeight
      term.options.cursorStyle = next.cursorStyle
      term.options.cursorBlink = next.cursorBlink
      term.options.cursorWidth = next.cursorStyle === 'bar' ? 2 : 1
      term.options.scrollback = next.scrollback
      term.options.theme = next.theme
    } catch {
      // ignore
    }
    this.applyCopyOnSelect(next.copyOnSelect)
    this.scheduleFit()
  }

  private applyCopyOnSelect(enabled: boolean): void {
    if (enabled === this.currentCopyOnSelect && this.selectionDisposable) return
    this.currentCopyOnSelect = enabled
    this.selectionDisposable?.dispose()
    this.selectionDisposable = null
    if (!enabled || !this.term) return
    const sub = this.term.onSelectionChange(() => {
      const sel = this.term?.getSelection()
      if (sel) copyToClipboard(sel)
    })
    this.selectionDisposable = { dispose: () => sub.dispose() }
  }
}
