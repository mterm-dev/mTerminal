// error-linkifier: scans terminal output for file:line:col patterns and
// exposes a command that types the configured "open" template into the active
// terminal. Showcases:
//   - app:terminal:output subscription
//   - command registration that touches the active terminal
//   - settings.get with manifest defaults
//
// We deliberately keep this tiny — a richer version would render an inline
// overlay decoration. That uses the @proposed terminalRawOutput surface and
// is left as an exercise for follow-ups.

const PATTERNS = [
  // generic stack trace: "at someFn (file:line:col)" or "file:line:col"
  /\b((?:[A-Za-z]:)?[^\s:()]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|swift|cpp|cc|h|cs|rb)):(\d+)(?::(\d+))?/g,
]

let lastMatch = null

export function activate(ctx) {
  ctx.logger.info('error-linkifier activated')

  ctx.events.on('app:terminal:output', (payload) => {
    const text = payload && typeof payload === 'object' ? String(payload.chunk ?? '') : ''
    if (!text) return
    for (const re of PATTERNS) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text))) {
        lastMatch = { file: m[1], line: Number(m[2] ?? 1), col: Number(m[3] ?? 1) }
      }
    }
  })

  ctx.commands.register({
    id: 'errorLinkifier.openLast',
    title: 'Error Linkifier: Open last detected file:line',
    run: async () => {
      if (!lastMatch) {
        ctx.ui.toast({ kind: 'info', message: 'no file:line detected yet' })
        return
      }
      const term = ctx.terminal.active()
      if (!term) {
        ctx.ui.toast({ kind: 'warn', message: 'no active terminal' })
        return
      }
      const tmpl = ctx.settings.get('openCommand') ?? 'code +{line}:{col} {file}'
      const cmd = String(tmpl)
        .replace('{file}', lastMatch.file)
        .replace('{line}', String(lastMatch.line))
        .replace('{col}', String(lastMatch.col))
      await term.write(cmd + '\n')
    },
  })
}

export function deactivate() {
  lastMatch = null
}
