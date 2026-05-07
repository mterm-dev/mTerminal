import fs from 'node:fs/promises'
import path from 'node:path'
import { manifestPath, type ExtensionSource } from './locations'

// Mirror of the public ExtensionManifest type, kept in sync with
// packages/extension-api/src/index.d.ts. We don't import that file here
// because it's a .d.ts (no runtime), and we want runtime-validated shapes.

export type ActivationEvent =
  | 'onStartupFinished'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onTabType:${string}`
  | `onUri:${string}`
  | `onEvent:${string}`
  | 'onSelection'
  | string

export interface CommandContribution {
  id: string
  title?: string
  category?: string
  icon?: string
  args?: Array<{
    name: string
    type: 'string' | 'number' | 'boolean'
    required?: boolean
    default?: unknown
    description?: string
  }>
}

export interface KeybindingContribution {
  command: string
  key: string
  when?: string
  args?: unknown
}

export interface PanelContribution {
  id: string
  title: string
  icon?: string
  location: 'sidebar' | 'sidebar.bottom' | 'bottombar'
  initialCollapsed?: boolean
}

export interface StatusBarContribution {
  id: string
  align: 'left' | 'right'
  text?: string
  icon?: string
  tooltip?: string
  command?: string
  refreshOn?: string[]
  priority?: number
}

export interface ContextMenuContribution {
  command: string
  context: string
  when?: string
  group?: string
  label?: string
}

export interface TabTypeContribution {
  id: string
  title: string
  icon?: string
}

export interface DecoratorContribution {
  id: string
  appliesTo: 'terminal.output'
}

export interface ThemeContribution {
  id: string
  label: string
  path: string
}

export interface ProviderContribution {
  kind: 'ai' | 'voice' | 'git-auth'
  id: string
  label: string
}

export type AiProviderId = 'anthropic' | 'openai' | 'ollama'

export interface AiBindingContribution {
  /** Stable id for this AI workflow inside the extension (e.g. "commit"). */
  id: string
  /** Human-readable label. */
  label: string
  /** Optional explainer rendered under the title. */
  description?: string
  /**
   * If true, the user can pick "Use mTerminal AI" (host-managed providers,
   * vault-backed keys). Default: true.
   */
  supportsCore?: boolean
  /** Restrict to a subset of providers. Default: all three. */
  providers?: AiProviderId[]
  /** Default provider when nothing has been chosen yet. */
  defaultProvider?: AiProviderId
  /** Default model per provider. */
  defaultModels?: Partial<Record<AiProviderId, string>>
}

export interface SecretContribution {
  /** Storage key, e.g. "anthropic.apiKey". */
  key: string
  /** Human-readable label rendered in Settings → Extensions → <ext>. */
  label: string
  /** Optional helper text shown beneath the input. */
  description?: string
  /** Optional URL where the user can obtain the secret. */
  link?: string
  /** Optional placeholder shown in the empty input. */
  placeholder?: string
}

export interface VaultKeyContribution {
  key: string
  label: string
  description?: string
  link?: string
  placeholder?: string
}

export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'boolean' | 'array'
  title?: string
  description?: string
  default?: unknown
  enum?: Array<string | number>
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
  required?: string[]
  minimum?: number
  maximum?: number
  pattern?: string
}

export interface ExtensionManifest {
  /** Stable identifier — defaults to `name` minus the `mterminal-plugin-` prefix. */
  id: string
  /** Original npm package name. */
  packageName: string
  version: string
  displayName?: string
  description?: string
  author?: string
  icon?: string

  /** Resolved absolute path to main entry, if any. */
  mainEntry: string | null
  /** Resolved absolute path to renderer entry, if any. */
  rendererEntry: string | null
  /** Manifest engines.mterminal-api semver range. */
  apiVersionRange: string

  activationEvents: ActivationEvent[]
  capabilities: string[]
  enabledApiProposals: string[]
  providedServices: Record<string, { version: string }>
  consumedServices: Record<string, { versionRange: string; optional?: boolean }>

  contributes: {
    commands: CommandContribution[]
    keybindings: KeybindingContribution[]
    settings: JsonSchema | null
    panels: PanelContribution[]
    statusBar: StatusBarContribution[]
    contextMenu: ContextMenuContribution[]
    tabTypes: TabTypeContribution[]
    decorators: DecoratorContribution[]
    themes: ThemeContribution[]
    providers: ProviderContribution[]
    secrets: SecretContribution[]
    vaultKeys: VaultKeyContribution[]
    aiBindings: AiBindingContribution[]
  }

  /** Where the extension lives on disk. */
  source: ExtensionSource
  extensionPath: string
}

export class ManifestValidationError extends Error {
  constructor(
    public readonly extensionPath: string,
    public readonly issues: string[],
  ) {
    super(
      `Invalid extension manifest at ${extensionPath}:\n  - ${issues.join('\n  - ')}`,
    )
    this.name = 'ManifestValidationError'
  }
}

/**
 * Read and validate a `package.json` from `extensionPath`. Returns a fully
 * normalized manifest with all optional fields filled in, or throws
 * `ManifestValidationError`.
 */
export async function readManifest(
  extensionPath: string,
  source: ExtensionSource,
): Promise<ExtensionManifest> {
  const file = manifestPath(extensionPath)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf-8')
  } catch (err) {
    throw new ManifestValidationError(extensionPath, [
      `cannot read package.json: ${(err as Error).message}`,
    ])
  }

  let pkg: unknown
  try {
    pkg = JSON.parse(raw)
  } catch (err) {
    throw new ManifestValidationError(extensionPath, [
      `package.json is not valid JSON: ${(err as Error).message}`,
    ])
  }

  return validateManifest(pkg, extensionPath, source)
}

export function validateManifest(
  pkg: unknown,
  extensionPath: string,
  source: ExtensionSource,
): ExtensionManifest {
  const issues: string[] = []
  const o = isObject(pkg) ? pkg : {}

  const packageName = typeof o.name === 'string' ? o.name : ''
  if (!packageName) issues.push('missing "name"')

  const version = typeof o.version === 'string' ? o.version : ''
  if (!version) issues.push('missing "version"')

  const mt = isObject(o.mterminal) ? o.mterminal : null
  if (!mt) issues.push('missing "mterminal" block')

  const id = typeof mt?.id === 'string' && mt.id.length > 0 ? mt.id : defaultIdFor(packageName)
  if (!id) issues.push('cannot derive extension id')

  const engines = isObject(o.engines) ? o.engines : {}
  const apiVersionRange =
    typeof engines['mterminal-api'] === 'string' ? (engines['mterminal-api'] as string) : '*'

  const main = typeof o.main === 'string' ? o.main : null
  const renderer = typeof o.renderer === 'string' ? o.renderer : null
  const mainEntry = main ? path.resolve(extensionPath, main) : null
  const rendererEntry = renderer ? path.resolve(extensionPath, renderer) : null

  // Declarative-only plugins (e.g. theme packs, snippet libraries) need
  // neither main nor renderer entry; their contributes block is enough.
  // We require either an entry OR at least one declarative contribution
  // that the host can act on without loading code.
  const hasDeclarativeContribution =
    isObject(mt?.contributes) &&
    (
      Array.isArray((mt!.contributes as { themes?: unknown }).themes) ||
      Array.isArray((mt!.contributes as { keybindings?: unknown }).keybindings) ||
      isObject((mt!.contributes as { settings?: unknown }).settings)
    )

  if (!mainEntry && !rendererEntry && !hasDeclarativeContribution) {
    issues.push(
      'extension defines neither "main" nor "renderer" entry, and no declarative contributions',
    )
  }

  const activationEvents = readArrayOf<string>(mt?.activationEvents, isString)
  for (const ev of activationEvents) {
    if (!isValidActivationEvent(ev)) {
      issues.push(`unknown activation event: ${ev}`)
    }
  }

  const capabilities = readArrayOf<string>(mt?.capabilities, isString)
  const enabledApiProposals = readArrayOf<string>(mt?.enabledApiProposals, isString)

  const providedServices = readProvidedServices(mt?.providedServices, issues)
  const consumedServices = readConsumedServices(mt?.consumedServices, issues)

  const contributes = readContributes(mt?.contributes, issues)

  if (issues.length) {
    throw new ManifestValidationError(extensionPath, issues)
  }

  return {
    id,
    packageName,
    version,
    displayName: typeof mt?.displayName === 'string' ? mt.displayName : undefined,
    description: typeof o.description === 'string' ? o.description : undefined,
    author:
      typeof o.author === 'string'
        ? o.author
        : isObject(o.author) && typeof o.author.name === 'string'
          ? o.author.name
          : undefined,
    icon: typeof mt?.icon === 'string' ? mt.icon : undefined,
    mainEntry,
    rendererEntry,
    apiVersionRange,
    activationEvents,
    capabilities,
    enabledApiProposals,
    providedServices,
    consumedServices,
    contributes,
    source,
    extensionPath,
  }
}

function defaultIdFor(name: string): string {
  if (!name) return ''
  // mterminal-plugin-foo → foo, @scope/mterminal-plugin-foo → foo, else name
  const stripped = name.replace(/^@[^/]+\//, '')
  const m = stripped.match(/^mterminal-plugin-(.+)$/)
  return m ? m[1] : stripped
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function readArrayOf<T>(v: unknown, guard: (x: unknown) => x is T): T[] {
  if (!Array.isArray(v)) return []
  return v.filter(guard)
}

const ACTIVATION_PREFIXES = ['onCommand:', 'onView:', 'onTabType:', 'onUri:', 'onEvent:'] as const
function isValidActivationEvent(ev: string): boolean {
  if (ev === 'onStartupFinished') return true
  if (ev === 'onSelection') return true
  return ACTIVATION_PREFIXES.some((p) => ev.startsWith(p) && ev.length > p.length)
}

function readProvidedServices(
  v: unknown,
  issues: string[],
): Record<string, { version: string }> {
  const out: Record<string, { version: string }> = {}
  if (!isObject(v)) return out
  for (const [id, entry] of Object.entries(v)) {
    if (!isObject(entry) || typeof entry.version !== 'string') {
      issues.push(`providedServices["${id}"] missing "version"`)
      continue
    }
    out[id] = { version: entry.version }
  }
  return out
}

function readConsumedServices(
  v: unknown,
  issues: string[],
): Record<string, { versionRange: string; optional?: boolean }> {
  const out: Record<string, { versionRange: string; optional?: boolean }> = {}
  if (!isObject(v)) return out
  for (const [id, entry] of Object.entries(v)) {
    if (!isObject(entry) || typeof entry.versionRange !== 'string') {
      issues.push(`consumedServices["${id}"] missing "versionRange"`)
      continue
    }
    out[id] = {
      versionRange: entry.versionRange,
      optional: typeof entry.optional === 'boolean' ? entry.optional : undefined,
    }
  }
  return out
}

function readContributes(v: unknown, issues: string[]): ExtensionManifest['contributes'] {
  const c = isObject(v) ? v : {}
  return {
    commands: readArrayOf(c.commands, (x): x is CommandContribution =>
      isObject(x) && typeof x.id === 'string',
    ),
    keybindings: readArrayOf(c.keybindings, (x): x is KeybindingContribution =>
      isObject(x) && typeof x.command === 'string' && typeof x.key === 'string',
    ),
    settings: isObject(c.settings) ? (c.settings as JsonSchema) : null,
    panels: readArrayOf(c.panels, (x): x is PanelContribution => {
      if (!isObject(x)) return false
      if (typeof x.id !== 'string' || typeof x.title !== 'string') return false
      const loc = x.location
      if (loc !== 'sidebar' && loc !== 'sidebar.bottom' && loc !== 'bottombar') {
        issues.push(`panel "${String(x.id)}" has invalid location "${String(loc)}"`)
        return false
      }
      return true
    }),
    statusBar: readArrayOf(c.statusBar, (x): x is StatusBarContribution =>
      isObject(x) && typeof x.id === 'string' && (x.align === 'left' || x.align === 'right'),
    ),
    contextMenu: readArrayOf(c.contextMenu, (x): x is ContextMenuContribution =>
      isObject(x) && typeof x.command === 'string' && typeof x.context === 'string',
    ),
    tabTypes: readArrayOf(c.tabTypes, (x): x is TabTypeContribution =>
      isObject(x) && typeof x.id === 'string' && typeof x.title === 'string',
    ),
    decorators: readArrayOf(c.decorators, (x): x is DecoratorContribution =>
      isObject(x) && typeof x.id === 'string' && x.appliesTo === 'terminal.output',
    ),
    themes: readArrayOf(c.themes, (x): x is ThemeContribution =>
      isObject(x) && typeof x.id === 'string' && typeof x.label === 'string' && typeof x.path === 'string',
    ),
    providers: readArrayOf(c.providers, (x): x is ProviderContribution =>
      isObject(x) &&
      (x.kind === 'ai' || x.kind === 'voice' || x.kind === 'git-auth') &&
      typeof x.id === 'string' &&
      typeof x.label === 'string',
    ),
    secrets: readArrayOf(c.secrets, (x): x is SecretContribution =>
      isObject(x) && typeof x.key === 'string' && typeof x.label === 'string',
    ),
    vaultKeys: readArrayOf(c.vaultKeys, (x): x is VaultKeyContribution =>
      isObject(x) && typeof x.key === 'string' && typeof x.label === 'string',
    ),
    aiBindings: readArrayOf(c.aiBindings, (x): x is AiBindingContribution =>
      isObject(x) && typeof x.id === 'string' && typeof x.label === 'string',
    ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// `when` clause parser
//
// Grammar:
//   expr   := or
//   or     := and ('||' and)*
//   and    := unary ('&&' unary)*
//   unary  := '!' unary | atom
//   atom   := '(' expr ')' | comparison | identifier
//   comp   := identifier ('==' | '!=') value
//   value  := identifier | string | number | bool
//
// Tokens:
//   identifier := [a-zA-Z_][a-zA-Z0-9_.]*
//   string     := "..." | '...'
//   number     := \d+
//   bool       := true | false
// ─────────────────────────────────────────────────────────────────────────────

export type WhenContext = Record<string, unknown>

export interface WhenExpr {
  evaluate(ctx: WhenContext): boolean
}

export function parseWhen(source: string): WhenExpr {
  const tokens = tokenizeWhen(source)
  const parser = new WhenParser(tokens)
  const expr = parser.parseExpr()
  if (parser.peek() !== undefined) {
    throw new Error(`unexpected token "${parser.peek()?.text}" in when clause: ${source}`)
  }
  return expr
}

interface Token {
  kind: 'op' | 'ident' | 'string' | 'number' | 'bool' | 'paren'
  text: string
  value?: string | number | boolean
}

function tokenizeWhen(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]
    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }
    if (c === '(' || c === ')') {
      tokens.push({ kind: 'paren', text: c })
      i++
      continue
    }
    if (c === '!' && source[i + 1] === '=') {
      tokens.push({ kind: 'op', text: '!=' })
      i += 2
      continue
    }
    if (c === '!') {
      tokens.push({ kind: 'op', text: '!' })
      i++
      continue
    }
    if (c === '=' && source[i + 1] === '=') {
      tokens.push({ kind: 'op', text: '==' })
      i += 2
      continue
    }
    if (c === '&' && source[i + 1] === '&') {
      tokens.push({ kind: 'op', text: '&&' })
      i += 2
      continue
    }
    if (c === '|' && source[i + 1] === '|') {
      tokens.push({ kind: 'op', text: '||' })
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      const quote = c
      let j = i + 1
      let value = ''
      while (j < source.length && source[j] !== quote) {
        value += source[j]
        j++
      }
      if (source[j] !== quote) throw new Error(`unterminated string in when: ${source}`)
      tokens.push({ kind: 'string', text: source.slice(i, j + 1), value })
      i = j + 1
      continue
    }
    if (/\d/.test(c)) {
      let j = i
      while (j < source.length && /\d/.test(source[j])) j++
      const text = source.slice(i, j)
      tokens.push({ kind: 'number', text, value: Number(text) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      // Allow hyphens *inside* identifiers (e.g. `view == git-panel`) but
      // not as the leading character — otherwise `!ident` would over-consume.
      while (j < source.length && /[a-zA-Z0-9_.\-]/.test(source[j])) j++
      const text = source.slice(i, j)
      if (text === 'true' || text === 'false') {
        tokens.push({ kind: 'bool', text, value: text === 'true' })
      } else {
        tokens.push({ kind: 'ident', text })
      }
      i = j
      continue
    }
    throw new Error(`unexpected character "${c}" in when clause: ${source}`)
  }
  return tokens
}

class WhenParser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.pos]
  }
  private next(): Token | undefined {
    return this.tokens[this.pos++]
  }
  private match(kind: Token['kind'], text?: string): Token | null {
    const t = this.peek()
    if (!t) return null
    if (t.kind !== kind) return null
    if (text !== undefined && t.text !== text) return null
    this.pos++
    return t
  }

  parseExpr(): WhenExpr {
    return this.parseOr()
  }
  private parseOr(): WhenExpr {
    let left = this.parseAnd()
    while (this.match('op', '||')) {
      const right = this.parseAnd()
      const l = left,
        r = right
      left = { evaluate: (ctx) => l.evaluate(ctx) || r.evaluate(ctx) }
    }
    return left
  }
  private parseAnd(): WhenExpr {
    let left = this.parseUnary()
    while (this.match('op', '&&')) {
      const right = this.parseUnary()
      const l = left,
        r = right
      left = { evaluate: (ctx) => l.evaluate(ctx) && r.evaluate(ctx) }
    }
    return left
  }
  private parseUnary(): WhenExpr {
    if (this.match('op', '!')) {
      const inner = this.parseUnary()
      return { evaluate: (ctx) => !inner.evaluate(ctx) }
    }
    return this.parseAtom()
  }
  private parseAtom(): WhenExpr {
    if (this.match('paren', '(')) {
      const inner = this.parseExpr()
      if (!this.match('paren', ')')) throw new Error('expected ")" in when clause')
      return inner
    }
    const t = this.next()
    if (!t) throw new Error('unexpected end of when clause')
    if (t.kind !== 'ident') {
      throw new Error(`expected identifier, got "${t.text}"`)
    }
    const ident = t.text
    const op = this.peek()
    if (op?.kind === 'op' && (op.text === '==' || op.text === '!=')) {
      this.pos++
      const rhs = this.next()
      if (!rhs) throw new Error('expected value after comparison operator')
      const literal = readLiteral(rhs)
      return {
        evaluate: (ctx) => {
          const lhs = readIdent(ctx, ident)
          return op.text === '==' ? lhs === literal : lhs !== literal
        },
      }
    }
    // Bare identifier — coerced to boolean.
    return { evaluate: (ctx) => Boolean(readIdent(ctx, ident)) }
  }
}

function readLiteral(t: Token): string | number | boolean {
  if (t.kind === 'string' || t.kind === 'number' || t.kind === 'bool') {
    return t.value as string | number | boolean
  }
  if (t.kind === 'ident') return t.text // bare-word literal e.g. view == git-panel
  throw new Error(`unexpected literal "${t.text}"`)
}

function readIdent(ctx: WhenContext, ident: string): unknown {
  if (Object.prototype.hasOwnProperty.call(ctx, ident)) return ctx[ident]
  // dotted: a.b.c
  const parts = ident.split('.')
  let cur: unknown = ctx
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function evaluateWhen(expr: string | undefined, ctx: WhenContext): boolean {
  if (!expr) return true
  try {
    return parseWhen(expr).evaluate(ctx)
  } catch {
    return false
  }
}
