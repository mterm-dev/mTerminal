import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorState, Compartment, Prec } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, undo } from '@codemirror/commands'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'
import { rust } from '@codemirror/lang-rust'
import { cpp } from '@codemirror/lang-cpp'
import { go } from '@codemirror/lang-go'
import { php } from '@codemirror/lang-php'
import { sql } from '@codemirror/lang-sql'
import { java } from '@codemirror/lang-java'
import { xml } from '@codemirror/lang-xml'
import { vue } from '@codemirror/lang-vue'
import { sass } from '@codemirror/lang-sass'
import { less } from '@codemirror/lang-less'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { r } from '@codemirror/legacy-modes/mode/r'
import { julia } from '@codemirror/legacy-modes/mode/julia'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'
import { scheme } from '@codemirror/legacy-modes/mode/scheme'
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp'
import { clojure } from '@codemirror/legacy-modes/mode/clojure'
import { erlang } from '@codemirror/legacy-modes/mode/erlang'
import { elm } from '@codemirror/legacy-modes/mode/elm'
import { oCaml, fSharp, sml } from '@codemirror/legacy-modes/mode/mllike'
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript'
import { d } from '@codemirror/legacy-modes/mode/d'
import { dart, kotlin, scala, csharp, c } from '@codemirror/legacy-modes/mode/clike'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { vb } from '@codemirror/legacy-modes/mode/vb'
import { vbScript } from '@codemirror/legacy-modes/mode/vbscript'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { dockerFile as dockerfileMode } from '@codemirror/legacy-modes/mode/dockerfile'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { protobuf } from '@codemirror/legacy-modes/mode/protobuf'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { nginx } from '@codemirror/legacy-modes/mode/nginx'
import { diff } from '@codemirror/legacy-modes/mode/diff'
import { cmake } from '@codemirror/legacy-modes/mode/cmake'
import { tcl } from '@codemirror/legacy-modes/mode/tcl'
import type { FileBackend } from '../shared/types'

interface CtxBridge {
  ipc: {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  }
  ui: {
    confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>
    toast(opts: { kind?: 'info' | 'success' | 'warn' | 'error'; message: string }): void
  }
}

interface Props {
  ctx: CtxBridge
  backend: FileBackend
  path: string
  onClose: () => void
}

function basename(p: string, backend: FileBackend): string {
  const sep = backend.kind === 'sftp' || !p.includes('\\') ? '/' : '\\'
  const idx = p.lastIndexOf(sep)
  return idx >= 0 ? p.slice(idx + 1) : p
}

function languageFor(name: string): Extension | null {
  const lower = name.toLowerCase()
  const base = lower.split('/').pop()?.split('\\').pop() ?? lower
  const ext = base.includes('.') ? base.split('.').pop() ?? '' : ''

  switch (base) {
    case 'dockerfile':
    case 'containerfile':
      return StreamLanguage.define(dockerfileMode)
    case 'makefile':
    case 'gnumakefile':
      return StreamLanguage.define(properties)
    case 'cmakelists.txt':
      return StreamLanguage.define(cmake)
    case '.gitignore':
    case '.dockerignore':
    case '.npmignore':
    case '.eslintignore':
    case '.prettierignore':
      return StreamLanguage.define(properties)
    case '.env':
    case '.env.local':
    case '.env.development':
    case '.env.production':
    case '.env.test':
      return StreamLanguage.define(properties)
    case '.bashrc':
    case '.zshrc':
    case '.bash_profile':
    case '.profile':
    case '.zprofile':
    case '.bash_aliases':
      return StreamLanguage.define(shell)
  }

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true, jsx: ext === 'tsx' })
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return javascript({ typescript: false, jsx: ext === 'jsx' })
    case 'json':
    case 'jsonc':
    case 'json5':
    case 'webmanifest':
      return json()
    case 'md':
    case 'markdown':
    case 'mdx':
      return markdown()
    case 'css':
    case 'pcss':
    case 'postcss':
      return css()
    case 'scss':
    case 'sass':
      return sass({ indented: ext === 'sass' })
    case 'less':
      return less()
    case 'html':
    case 'htm':
    case 'xhtml':
      return html()
    case 'vue':
      return vue()
    case 'svelte':
      return html()
    case 'xml':
    case 'svg':
    case 'xsl':
    case 'xsd':
    case 'plist':
    case 'rss':
    case 'atom':
      return xml()
    case 'py':
    case 'pyi':
    case 'pyx':
      return python()
    case 'yaml':
    case 'yml':
      return yaml()
    case 'toml':
      return StreamLanguage.define(toml)
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties':
    case 'editorconfig':
      return StreamLanguage.define(properties)
    case 'rs':
      return rust()
    case 'go':
      return go()
    case 'c':
    case 'h':
      return StreamLanguage.define(c)
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'c++':
    case 'hpp':
    case 'hh':
    case 'hxx':
    case 'h++':
      return cpp()
    case 'java':
      return java()
    case 'kt':
    case 'kts':
      return StreamLanguage.define(kotlin)
    case 'scala':
    case 'sbt':
      return StreamLanguage.define(scala)
    case 'cs':
      return StreamLanguage.define(csharp)
    case 'fs':
    case 'fsx':
    case 'fsi':
      return StreamLanguage.define(fSharp)
    case 'ml':
    case 'mli':
      return StreamLanguage.define(oCaml)
    case 'sml':
      return StreamLanguage.define(sml)
    case 'd':
    case 'di':
      return StreamLanguage.define(d)
    case 'dart':
      return StreamLanguage.define(dart)
    case 'php':
    case 'phtml':
      return php()
    case 'sql':
    case 'mysql':
    case 'pgsql':
      return sql()
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ksh':
    case 'ash':
      return StreamLanguage.define(shell)
    case 'rb':
    case 'rake':
    case 'gemspec':
      return StreamLanguage.define(ruby)
    case 'lua':
      return StreamLanguage.define(lua)
    case 'swift':
      return StreamLanguage.define(swift)
    case 'pl':
    case 'pm':
      return StreamLanguage.define(perl)
    case 'r':
    case 'rmd':
      return StreamLanguage.define(r)
    case 'jl':
      return StreamLanguage.define(julia)
    case 'hs':
    case 'lhs':
      return StreamLanguage.define(haskell)
    case 'scm':
    case 'ss':
    case 'rkt':
      return StreamLanguage.define(scheme)
    case 'lisp':
    case 'lsp':
    case 'cl':
    case 'el':
      return StreamLanguage.define(commonLisp)
    case 'clj':
    case 'cljs':
    case 'cljc':
    case 'edn':
      return StreamLanguage.define(clojure)
    case 'erl':
    case 'hrl':
      return StreamLanguage.define(erlang)
    case 'elm':
      return StreamLanguage.define(elm)
    case 'coffee':
    case 'cson':
      return StreamLanguage.define(coffeeScript)
    case 'groovy':
    case 'gradle':
      return StreamLanguage.define(groovy)
    case 'vb':
    case 'bas':
      return StreamLanguage.define(vb)
    case 'vbs':
      return StreamLanguage.define(vbScript)
    case 'tex':
    case 'latex':
    case 'sty':
    case 'cls':
      return StreamLanguage.define(stex)
    case 'proto':
      return StreamLanguage.define(protobuf)
    case 'ps1':
    case 'psd1':
    case 'psm1':
      return StreamLanguage.define(powerShell)
    case 'patch':
    case 'diff':
      return StreamLanguage.define(diff)
    case 'cmake':
      return StreamLanguage.define(cmake)
    case 'tcl':
      return StreamLanguage.define(tcl)
    case 'nginx':
      return StreamLanguage.define(nginx)
    default:
      return null
  }
}

function readChannel(backend: FileBackend): string {
  return backend.kind === 'local' ? 'fs:read' : 'sftp:read'
}
function writeChannel(backend: FileBackend): string {
  return backend.kind === 'local' ? 'fs:write' : 'sftp:write'
}
function readArgs(backend: FileBackend, path: string): Record<string, unknown> {
  return backend.kind === 'local' ? { path } : { hostId: backend.hostId, path }
}
function writeArgs(backend: FileBackend, path: string, content: string): Record<string, unknown> {
  return backend.kind === 'local'
    ? { path, content }
    : { hostId: backend.hostId, path, content }
}

const mtHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.quote], color: 'var(--fg-dim)', fontStyle: 'italic' },
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.modifier,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.self,
      t.null,
      t.atom,
      t.bool,
    ],
    color: 'var(--xt-magenta)',
  },
  {
    tag: [t.string, t.special(t.string), t.regexp, t.escape, t.character],
    color: 'var(--xt-green)',
  },
  { tag: [t.number, t.integer, t.float, t.literal], color: 'var(--xt-yellow)' },
  { tag: [t.meta, t.annotation, t.processingInstruction], color: 'var(--xt-yellow)' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: 'var(--xt-blue)',
  },
  { tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--xt-blue)', fontWeight: 'bold' },
  {
    tag: [t.typeName, t.namespace, t.standard(t.name)],
    color: 'var(--xt-cyan)',
  },
  {
    tag: [t.className, t.definition(t.className), t.standard(t.tagName)],
    color: 'var(--xt-cyan)',
  },
  { tag: [t.tagName, t.angleBracket], color: 'var(--xt-red)' },
  { tag: [t.attributeName], color: 'var(--xt-yellow)' },
  { tag: [t.attributeValue], color: 'var(--xt-green)' },
  { tag: [t.propertyName, t.variableName, t.labelName], color: 'var(--fg)' },
  { tag: [t.bracket, t.squareBracket, t.paren, t.brace, t.punctuation, t.separator], color: 'var(--fg-muted)' },
  { tag: [t.operator, t.derefOperator, t.compareOperator, t.logicOperator, t.arithmeticOperator, t.bitwiseOperator, t.updateOperator], color: 'var(--fg-muted)' },
  { tag: [t.link, t.url], color: 'var(--xt-green)', textDecoration: 'underline' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: 'bold' },
  { tag: [t.invalid], color: 'var(--xt-red)' },
  { tag: [t.deleted], color: 'var(--xt-red)' },
  { tag: [t.inserted], color: 'var(--xt-green)' },
  { tag: [t.changed], color: 'var(--xt-yellow)' },
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: '13px',
      backgroundColor: 'transparent',
      color: 'var(--fg)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.5',
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--accent) 25%, transparent)',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--fg-dim)',
      borderRight: '1px solid var(--border-subtle)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--bg-hover)',
      color: 'var(--fg-muted)',
    },
    '.cm-activeLine': {
      backgroundColor: 'var(--bg-hover)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--bg-active)',
      color: 'var(--fg-muted)',
      border: 'none',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'color-mix(in oklch, var(--accent) 20%, transparent)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'color-mix(in oklch, var(--c-amber) 30%, transparent)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-raised)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-sm)',
    },
  },
  { dark: true },
)

export function FileEditor({ ctx, backend, path, onClose }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [text, setText] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const fileName = useMemo(() => basename(path, backend), [path, backend])
  const dirty = text !== original

  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const textRef = useRef(text)
  textRef.current = text
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true
    setSaving(true)
    try {
      await ctx.ipc.invoke(writeChannel(backend), writeArgs(backend, path, textRef.current))
      setOriginal(textRef.current)
      ctx.ui.toast({ kind: 'success', message: `saved ${fileName}` })
      return true
    } catch (err) {
      ctx.ui.toast({ kind: 'error', message: (err as Error).message })
      return false
    } finally {
      setSaving(false)
    }
  }, [backend, ctx, fileName, path])

  const requestClose = useCallback(async () => {
    if (dirtyRef.current) {
      const ok = await ctx.ui.confirm({
        title: 'unsaved changes',
        message: `discard changes to ${fileName}?`,
        confirmLabel: 'discard',
        cancelLabel: 'keep editing',
      })
      if (!ok) return
    }
    onCloseRef.current()
  }, [ctx, fileName])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const r = await ctx.ipc.invoke<{ content: string }>(
          readChannel(backend),
          readArgs(backend, path),
        )
        if (cancelled) return
        setOriginal(r.content)
        setText(r.content)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [backend, ctx, path])

  useEffect(() => {
    if (loading || error) return
    const host = hostRef.current
    if (!host) return
    const lang = languageFor(fileName)
    const extensions: Extension[] = [
      Prec.highest(
        keymap.of([
          { key: 'Mod-z', preventDefault: true, run: undo },
          { key: 'Mod-Shift-z', preventDefault: true, run: redo },
          { key: 'Mod-y', preventDefault: true, run: redo },
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              void save()
              return true
            },
          },
          {
            key: 'Escape',
            run: () => {
              void requestClose()
              return true
            },
          },
        ]),
      ),
      lineNumbers(),
      foldGutter(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      indentOnInput(),
      closeBrackets(),
      syntaxHighlighting(mtHighlightStyle, { fallback: true }),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...searchKeymap,
        indentWithTab,
      ]),
      langCompartment.current.of(lang ?? []),
      editorTheme,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) setText(u.state.doc.toString())
      }),
    ]
    const view = new EditorView({
      state: EditorState.create({ doc: original, extensions }),
      parent: host,
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [loading, error, fileName, original, save, requestClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        void requestClose()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        e.stopPropagation()
        void save()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [requestClose, save])

  return (
    <div
      className="fb-editor-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) void requestClose()
      }}
    >
      <div className="fb-editor-modal" role="dialog" aria-label={`edit ${fileName}`}>
        <div className="fb-editor-header">
          <span className="fb-editor-title" title={path}>
            {fileName}
            {dirty && <span className="fb-editor-dirty"> ●</span>}
          </span>
          <span className="fb-editor-path" title={path}>{path}</span>
          <span className="fb-spacer" />
          <button
            className="ghost-btn small"
            onClick={() => void save()}
            disabled={!dirty || saving || loading || error !== null}
            title="save (Ctrl+S)"
          >
            {saving ? 'saving…' : 'save'}
          </button>
          <button
            className="ghost-btn small"
            onClick={() => void requestClose()}
            title="close (Esc)"
          >
            close
          </button>
        </div>
        <div className="fb-editor-body">
          {loading && <div className="fb-editor-status">loading…</div>}
          {error && <div className="fb-editor-status fb-editor-error">{error}</div>}
          {!loading && !error && <div className="fb-editor-host" ref={hostRef} />}
        </div>
        <div className="fb-editor-footer">
          <span>{backend.kind === 'sftp' ? `sftp · ${backend.hostId}` : 'local'}</span>
          <span className="fb-spacer" />
          <span>Ctrl+S save · Esc close</span>
        </div>
      </div>
    </div>
  )
}
