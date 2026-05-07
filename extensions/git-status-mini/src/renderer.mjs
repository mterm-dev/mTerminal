// git-status-mini: a tiny proof-of-concept Git panel as an mTerminal
// extension. Demonstrates the public API surface used by the full Git Panel
// migration plan §14:
//   - ctx.panels.register (sidebar panel)
//   - ctx.git.status / ctx.git.diff / ctx.git.stage / ctx.git.commit
//   - ctx.ai.complete (commit message generation)
//   - ctx.commands.register + manifest keybinding
//   - ctx.settings.get with manifest defaults
//   - ctx.events.on('app:cwd:changed')
//   - ctx.ui.toast / ctx.ui.confirm
//   - ctx.subscribe (auto-cleanup on dispose)
//
// Vanilla DOM + manual subscriptions; the full Git Panel rewrite uses React
// trees rendered into the panel host.

const PANEL_ID = 'git-status-mini'

function html(tag, props = {}, children = []) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (k === 'onClick') el.addEventListener('click', v)
    else if (k === 'class') el.className = v
    else if (k === 'text') el.textContent = String(v)
    else if (k in el) el[k] = v
    else el.setAttribute(k, String(v))
  }
  for (const c of children) {
    if (c == null) continue
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return el
}

const styles = {
  panel: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' },
  branch: { fontFamily: 'var(--font-family, monospace)', opacity: 0.85 },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '2px 0',
  },
  status: {
    fontFamily: 'var(--font-family, monospace)',
    fontSize: '10px',
    width: '24px',
    opacity: 0.8,
  },
  filePath: { flex: 1, fontFamily: 'var(--font-family, monospace)' },
  btnRow: { display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' },
  btn: {
    padding: '3px 8px',
    border: '1px solid var(--border, #444)',
    borderRadius: '4px',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: '11px',
  },
  btnPrimary: {
    padding: '3px 8px',
    border: '1px solid var(--accent, #4a90e2)',
    borderRadius: '4px',
    background: 'var(--accent, #4a90e2)',
    color: 'white',
    cursor: 'pointer',
    fontSize: '11px',
  },
  textarea: {
    width: '100%',
    height: '60px',
    boxSizing: 'border-box',
    fontFamily: 'var(--font-family, monospace)',
    fontSize: '12px',
    background: 'var(--surface, #1a1a1a)',
    color: 'inherit',
    border: '1px solid var(--border, #333)',
    borderRadius: '4px',
    padding: '4px 6px',
    resize: 'vertical',
  },
  empty: { opacity: 0.6, padding: '8px 0' },
  badge: {
    display: 'inline-block',
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '999px',
    border: '1px solid var(--border, #555)',
    opacity: 0.85,
    marginLeft: '4px',
  },
}

export function activate(ctx) {
  ctx.logger.info('git-status-mini activated')

  // Resolve cwd. The workspace bridge knows the active terminal cwd; if
  // the terminal hasn't reported one yet, fall back to the process cwd.
  const getCwd = () => ctx.workspace.cwd() ?? '/'

  // Status bar: branch + ahead/behind. Auto-refreshes on cwd change.
  let statusBranchText = ''
  ctx.statusBar.register({
    id: 'gitStatusMini.branch',
    align: 'left',
    text: () => statusBranchText,
    tooltip: 'Click to refresh git status',
    onClick: () => void ctx.commands.execute('gitStatusMini.refresh'),
    refreshOn: ['gitStatusMini:status-changed', 'app:cwd:changed'],
  })

  const refreshStatusBranch = async () => {
    try {
      const status = await ctx.git.status(getCwd())
      if (!status.isRepo) {
        statusBranchText = ''
      } else {
        const branch = status.branch ?? 'detached'
        const ahead = status.ahead ? `↑${status.ahead}` : ''
        const behind = status.behind ? `↓${status.behind}` : ''
        const dirty = status.files.some((f) => f.staged || f.unstaged) ? '*' : ''
        statusBranchText = `⎇ ${branch}${dirty} ${ahead}${behind}`.trim()
      }
    } catch {
      statusBranchText = ''
    }
    ctx.events.emit('status-changed')
  }
  void refreshStatusBranch()
  const offCwdStatus = ctx.events.on('app:cwd:changed', () => void refreshStatusBranch())
  ctx.subscribe(offCwdStatus)

  ctx.panels.register({
    id: PANEL_ID,
    title: 'Git Status (mini)',
    location: 'sidebar.bottom',
    render: (host) => {
      const root = html('div', { style: styles.panel })
      host.appendChild(root)

      let lastStatus = null
      const stagedSet = new Set()
      let commitInput = null

      const refresh = async () => {
        root.innerHTML = ''
        const cwd = getCwd()
        let status
        try {
          status = await ctx.git.status(cwd)
        } catch (err) {
          root.appendChild(html('div', { style: styles.empty, text: `error: ${err.message}` }))
          return
        }
        lastStatus = status
        if (!status.isRepo) {
          root.appendChild(html('div', { style: styles.empty, text: 'not a git repo' }))
          return
        }

        const branchLine = html(
          'div',
          { style: styles.branch },
          [
            `⎇ ${status.branch ?? 'detached'}`,
            status.upstream
              ? html('span', {
                  style: styles.badge,
                  text: `↑${status.ahead} ↓${status.behind}`,
                })
              : null,
          ],
        )
        root.appendChild(branchLine)

        if (status.files.length === 0) {
          root.appendChild(html('div', { style: styles.empty, text: 'clean' }))
          return
        }

        for (const f of status.files) {
          const isStaged = stagedSet.has(f.path) || f.staged
          const checkbox = html('input', { type: 'checkbox', checked: isStaged })
          checkbox.addEventListener('change', async () => {
            try {
              if (checkbox.checked) {
                await ctx.git.stage(cwd, [f.path])
                stagedSet.add(f.path)
              } else {
                await ctx.git.unstage(cwd, [f.path])
                stagedSet.delete(f.path)
              }
            } catch (err) {
              ctx.ui.toast({ kind: 'error', message: `git ${checkbox.checked ? 'stage' : 'unstage'} failed: ${err.message}` })
            }
            await refresh()
          })

          const tag = `${f.indexStatus || ' '}${f.worktreeStatus || ' '}`
          root.appendChild(
            html('div', { style: styles.fileRow }, [
              checkbox,
              html('span', { style: styles.status, text: tag.trim() || '?' }),
              html('span', { style: styles.filePath, text: f.path }),
            ]),
          )
        }

        // Commit message input + buttons
        commitInput = html('textarea', {
          style: styles.textarea,
          placeholder: 'commit message...',
        })
        root.appendChild(commitInput)

        const aiBtn = html('button', {
          style: styles.btn,
          text: '✨ AI message',
          onClick: () => void ctx.commands.execute('gitStatusMini.generateMessage'),
        })
        const commitBtn = html('button', {
          style: styles.btnPrimary,
          text: 'Commit',
          onClick: async () => {
            const msg = commitInput.value.trim()
            if (!msg) return
            try {
              await ctx.git.commit(cwd, msg)
              commitInput.value = ''
              ctx.ui.toast({ kind: 'success', message: 'committed' })
              ctx.events.emit('committed', { cwd })
              await refresh()
              void refreshStatusBranch()
            } catch (err) {
              ctx.ui.toast({ kind: 'error', message: `commit failed: ${err.message}` })
            }
          },
        })
        const refreshBtn = html('button', {
          style: styles.btn,
          text: '⟳',
          title: 'Refresh',
          onClick: refresh,
        })

        root.appendChild(html('div', { style: styles.btnRow }, [aiBtn, commitBtn, refreshBtn]))
      }

      // Commands
      ctx.commands.register({
        id: 'gitStatusMini.refresh',
        title: 'Git mini: Refresh status',
        run: refresh,
      })

      ctx.commands.register({
        id: 'gitStatusMini.generateMessage',
        title: 'Git mini: Generate AI commit message',
        run: async () => {
          if (!lastStatus || !commitInput) {
            ctx.ui.toast({ kind: 'warn', message: 'no panel context yet' })
            return
          }
          const cwd = getCwd()
          const stagedPaths = lastStatus.files.filter((f) => f.staged || stagedSet.has(f.path)).map((f) => f.path)
          if (stagedPaths.length === 0) {
            ctx.ui.toast({ kind: 'warn', message: 'no staged files' })
            return
          }
          const diffs = []
          for (const p of stagedPaths.slice(0, 10)) {
            try {
              const d = await ctx.git.diff(cwd, p, true)
              diffs.push(`--- ${p} ---\n${d.text}`)
            } catch {
              /* ignore individual file errors */
            }
          }
          const system = ctx.settings.get('commitSystemPrompt') ??
            'Write a concise conventional-commit message for the diff.'
          ctx.ui.toast({ kind: 'info', message: 'generating…' })
          try {
            const result = await ctx.ai.complete({
              system,
              messages: [{ role: 'user', content: diffs.join('\n\n') }],
            })
            commitInput.value = result.text.trim()
          } catch (err) {
            ctx.ui.toast({ kind: 'error', message: `AI failed: ${err.message}` })
          }
        },
      })

      // Reactive: refresh on cwd change and on a manual interval driven by
      // settings. Disposers tracked via ctx.subscribe so they auto-clean.
      void refresh()

      const offCwd = ctx.events.on('app:cwd:changed', () => void refresh())
      ctx.subscribe(offCwd)

      const intervalMs = Number(ctx.settings.get('refreshIntervalMs') ?? 5000)
      if (intervalMs > 0) {
        const timer = window.setInterval(() => void refresh(), intervalMs)
        ctx.subscribe(() => window.clearInterval(timer))
      }

      return () => {
        // Panel host is being torn down (disable / hot reload). All
        // ctx.subscribe()-tracked disposers run first, this is for any
        // DOM-only cleanup.
        root.remove()
      }
    },
  })
}

export function deactivate() {
  /* ctx.subscribe handlers already cleaned up by the host */
}
