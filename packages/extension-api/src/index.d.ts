/**
 * @mterminal/extension-api — public API surface for mTerminal extensions.
 *
 * Stable APIs only. Experimental APIs live in `@mterminal/extension-api/proposed`
 * and require an explicit `enabledApiProposals` entry in the plugin manifest.
 *
 * Versioning: separate semver track from the host application. Plugins declare
 *   "engines": { "mterminal-api": "^1.0.0" }
 *
 * Lifecycle (renderer + main side both follow this shape):
 *   export function activate(ctx: ExtensionContext): void | Disposable | Promise<void | Disposable>
 *   export function deactivate?(): void | Promise<void>
 */

import type { AnyEventMap, EventName, TabSummary } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// Disposables (Obsidian-style register* lifecycle)
// ─────────────────────────────────────────────────────────────────────────────

export interface Disposable {
  dispose(): void
}

export type Disposer = Disposable | (() => void)

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest types (mirror of the JSON `mterminal` field in package.json)
// ─────────────────────────────────────────────────────────────────────────────

export type ActivationEvent =
  | 'onStartupFinished'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onTabType:${string}`
  | `onUri:${string}`
  | `onEvent:${string}`
  | `onSelection`
  | (string & {})

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
  /** Optional `when` clause expression. See docs for grammar. */
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
  /** Where this item is shown. */
  context:
    | 'terminal'
    | 'terminal.selection'
    | 'tab'
    | `${string}.${string}`
  when?: string
  group?: string
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
  /** Path inside the extension folder to a theme JSON file. */
  path: string
}

export interface ProviderContribution {
  kind: 'ai' | 'voice' | 'git-auth'
  id: string
  label: string
}

/**
 * Declares an AI workflow an extension needs configured (e.g. one binding
 * per "feature that calls an LLM"). The host renders a polished card per
 * binding in Settings → Extensions → <ext> with:
 *   - segmented control: "Use mTerminal AI" (vault-backed) vs "Custom keys"
 *   - provider dropdown / model input / base URL
 *   - password input for the API key (custom mode), wired to `ctx.secrets`
 *
 * Provider ids are dynamic strings — they correspond to whatever AI provider
 * extensions the user has installed (`registerProvider({ id })`).
 *
 * At runtime the extension reads the chosen config via `ctx.settings.get`
 * (key `ai.binding.<id>`) and the secret via `ctx.secrets.get`.
 */
export interface AiBindingContribution {
  id: string
  label: string
  description?: string
  /** Default true. When false the binding is "custom keys only". */
  supportsCore?: boolean
  /** Restrict to a subset of provider ids. Default: all installed providers. */
  providers?: string[]
  /** Default provider id when nothing has been chosen yet. */
  defaultProvider?: string
  /** Default model per provider id. */
  defaultModels?: Record<string, string>
}

/**
 * Declares a secret an extension needs (API key, token, …). The host renders
 * a password input for each entry under Settings → Extensions → <ext>, and
 * persists values via `ctx.secrets` — separate from regular plugin settings,
 * stored in `~/.mterminal/data/<id>/secrets.json` (encrypted via the OS
 * keychain when available).
 */
export interface SecretContribution {
  /** Storage key, e.g. `"anthropic.apiKey"`. */
  key: string
  /** Human-readable label rendered next to the input. */
  label: string
  /** Optional helper text shown beneath the input. */
  description?: string
  /** Optional URL where the user can obtain the secret. */
  link?: string
  /** Optional placeholder shown in the empty input. */
  placeholder?: string
}

export interface ExtensionManifest {
  /** Stable identifier — defaults to `name` minus the `mterminal-plugin-` prefix. */
  id: string
  displayName?: string
  icon?: string
  activationEvents: ActivationEvent[]
  /** Informational capability list shown in the trust modal. NOT enforced. */
  capabilities?: string[]
  enabledApiProposals?: string[]
  providedServices?: Record<string, { version: string }>
  consumedServices?: Record<string, { versionRange: string; optional?: boolean }>
  contributes?: {
    commands?: CommandContribution[]
    keybindings?: KeybindingContribution[]
    settings?: JsonSchema
    panels?: PanelContribution[]
    statusBar?: StatusBarContribution[]
    contextMenu?: ContextMenuContribution[]
    tabTypes?: TabTypeContribution[]
    decorators?: DecoratorContribution[]
    themes?: ThemeContribution[]
    providers?: ProviderContribution[]
    secrets?: SecretContribution[]
    aiBindings?: AiBindingContribution[]
  }
}

/**
 * Subset of JSON Schema (draft-07) understood by the auto-renderer.
 * Plugins should restrict themselves to: `string`, `number`, `boolean`,
 * `enum` (string/number), nested `object`. Other shapes render as raw JSON.
 */
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

// ─────────────────────────────────────────────────────────────────────────────
// Plugin module entry shape
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginModule<C = ExtensionContext> {
  activate(ctx: C): void | Disposable | Promise<void | Disposable>
  deactivate?(): void | Promise<void>
}

/**
 * Type-only identity helper. Wraps a plugin module so authoring tools can
 * surface inline diagnostics. Returns the module unchanged at runtime.
 */
export declare function defineExtension<C = ExtensionContext>(mod: PluginModule<C>): PluginModule<C>

// ─────────────────────────────────────────────────────────────────────────────
// Renderer-side ExtensionContext
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtensionContext {
  readonly id: string
  readonly extensionPath: string
  readonly dataPath: string
  readonly manifest: ExtensionManifest
  readonly logger: Logger

  /**
   * Raw `window.mt` API. Escape hatch — anything reachable here bypasses
   * the curated `ctx` surface and is not subject to API stability guarantees.
   */
  readonly mt: MtApi

  readonly commands: CommandsApi
  readonly keybindings: KeybindingsApi
  readonly panels: PanelsApi
  /**
   * Replace the auto-rendered settings card for this extension with a
   * plugin-supplied React UI. Useful when the JSON-Schema auto-renderer
   * can't express your settings well (e.g. lists of complex objects).
   *
   * @since mterminal-api 1.2.0
   */
  readonly settingsRenderer: SettingsRendererApi
  readonly statusBar: StatusBarApi
  readonly contextMenu: ContextMenuApi
  readonly tabs: TabsApi
  readonly decorators: DecoratorsApi
  readonly themes: ThemesApi
  readonly providers: ProvidersApi
  readonly settings: SettingsApi
  readonly events: EventBus
  readonly ipc: ExtIpc
  readonly ai: AiApi
  readonly terminal: TerminalApi
  readonly workspace: WorkspaceApi
  readonly notify: NotifyApi
  readonly ui: UiApi
  readonly workspaceState: KeyValueStore
  readonly globalState: KeyValueStore
  readonly secrets: SecretsApi
  /**
   * Master-password protected secret storage. Reads/writes prompt the user
   * to unlock the vault when locked; resolves only after unlock or rejects
   * if the user cancels. For low-sensitivity caches that should survive a
   * vault lock, use `secrets` (OS keychain) instead.
   *
   * @since mterminal-api 1.1.0
   */
  readonly vault: VaultApi

  /** Service consumption: keys are service ids declared in `consumedServices`. */
  readonly services: ServiceMap

  /** Service production. Call once during `activate()` per provided service. */
  readonly providedServices: ServicesPublishApi

  /**
   * Track a disposable so it runs at deactivate time (in reverse order).
   * Every `register*()` call already auto-tracks; use this for ad-hoc cleanup.
   */
  subscribe(d: Disposer): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Main-side ExtensionContext
// ─────────────────────────────────────────────────────────────────────────────

export interface MainExtensionContext {
  readonly id: string
  readonly extensionPath: string
  readonly dataPath: string
  readonly manifest: ExtensionManifest
  readonly logger: Logger
  readonly ipc: MainExtIpc
  readonly events: EventBus
  readonly settings: SettingsApi
  readonly globalState: KeyValueStore
  readonly services: ServiceMap
  readonly providedServices: ServicesPublishApi
  subscribe(d: Disposer): void
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-APIs
// ─────────────────────────────────────────────────────────────────────────────

export interface CommandsApi {
  register(cmd: {
    id: string
    title?: string
    run(args?: unknown): unknown | Promise<unknown>
  }): Disposable
  execute<T = unknown>(id: string, args?: unknown): Promise<T>
  list(): Array<{ id: string; title?: string; source: 'core' | string }>
  has(id: string): boolean
}

export interface KeybindingsApi {
  register(kb: {
    command: string
    key: string
    when?: string
    args?: unknown
  }): Disposable
}

export interface PanelCtx {
  /** Element where the panel renders. */
  readonly host: HTMLElement
  readonly width: number
  readonly height: number
  readonly visible: boolean
  onResize(cb: (rect: DOMRect) => void): Disposable
  onVisibilityChange(cb: (visible: boolean) => void): Disposable
}

/**
 * Settings bridge handed to a custom settings renderer. Scoped to the
 * extension's own settings namespace.
 *
 * @since mterminal-api 1.2.0
 */
export interface SettingsRendererCtx {
  /** The host-owned `<div>` to render into. */
  readonly host: HTMLElement
  readonly extId: string
  readonly settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
    onChange(cb: (key: string, value: unknown) => void): Disposable
  }
}

/**
 * Replace the auto-rendered schema-properties block in this extension's
 * Settings card with a plugin-supplied UI. The host still renders the
 * card title, AI bindings section, and secrets section.
 *
 * @since mterminal-api 1.2.0
 */
export interface SettingsRendererApi {
  register(spec: {
    /**
     * Mount your UI into the supplied `host` element. Return a cleanup
     * callback (called when the user navigates away from this extension's
     * settings page or when the extension deactivates). React renderers
     * typically `createRoot(host).render(...)` and return `() => root.unmount()`.
     */
    render(host: HTMLElement, ctx: SettingsRendererCtx): void | (() => void)
  }): Disposable
}

export interface PanelsApi {
  register(panel: {
    id: string
    title: string
    icon?: string
    location: 'sidebar' | 'sidebar.bottom' | 'bottombar'
    initialCollapsed?: boolean
    /**
     * Render the panel. Return a disposer to clean up DOM listeners; React
     * panels typically `createRoot(host).render(...)` and return `() => root.unmount()`.
     */
    render(host: HTMLElement, panelCtx: PanelCtx): void | (() => void)
  }): Disposable
  show(id: string): void
  hide(id: string): void
}

export interface StatusBarApi {
  register(item: {
    id: string
    align: 'left' | 'right'
    text?: string | (() => string)
    icon?: string
    tooltip?: string
    onClick?(): void
    /** Event names that trigger re-evaluation of `text`/`icon`/`tooltip`. */
    refreshOn?: string[]
    priority?: number
  }): Disposable
  update(
    id: string,
    patch: Partial<{
      text: string
      icon: string
      tooltip: string
      onClick: () => void
    }>,
  ): void
}

export interface ContextMenuApi {
  register(item: {
    command: string
    context:
      | 'terminal'
      | 'terminal.selection'
      | 'tab'
      | `${string}.${string}`
    when?: string
    group?: string
    label?: string
  }): Disposable
}

export interface TabFactoryProps {
  readonly tabId: number
  readonly active: boolean
  readonly props: unknown
  readonly ctx: ExtensionContext
}

export interface TabInstance {
  mount(host: HTMLElement): void
  unmount(): void
  onResize?(rect: DOMRect): void
  onFocus?(): void
  onBlur?(): void
  /** Optional title source — overrides `title` on each call. */
  getTitle?(): string
}

export interface TabsApi {
  registerTabType(type: {
    id: string
    title: string
    icon?: string
    factory(props: TabFactoryProps): TabInstance
  }): Disposable
  open(args: {
    type: string
    title?: string
    props?: unknown
    groupId?: string | null
  }): Promise<number>
  close(tabId: number): void
  active(): { id: number; type: string } | null
  list(): TabSummary[]
  onChange(cb: (tabs: TabSummary[]) => void): Disposable
}

// Terminal access ─────────────────────────────────────────────────────────────

export interface SpawnOptions {
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  groupId?: string | null
  title?: string
}

export interface TerminalApi {
  active(): TerminalHandle | null
  byId(tabId: number): TerminalHandle | null
  /** Spawn a new local PTY-backed tab. */
  spawn(opts?: SpawnOptions): Promise<TerminalHandle>
  list(): TerminalHandle[]
}

export interface TerminalHandle {
  readonly tabId: number
  readonly ptyId: number
  readonly cwd: string | null
  readonly cmd: string | null
  readonly title: string

  /** Read the most recent N bytes of scrollback (defaults to 64KiB). */
  read(maxBytes?: number): Promise<string>

  /** Write raw input (as if typed by the user). Newlines submit. */
  write(data: string): Promise<void>

  /** Insert text at the prompt position without auto-submitting. */
  insertAtPrompt(data: string): Promise<void>

  /**
   * Send a named key. `'enter'`, `'ctrl-c'`, `'ctrl-d'`, etc., or any single
   * character / key sequence understood by the underlying PTY.
   */
  sendKey(key: 'enter' | 'ctrl-c' | 'ctrl-d' | (string & {})): Promise<void>

  /** Currently selected text in the xterm buffer, if any. */
  getSelection(): string | null

  onData(cb: (chunk: string) => void): Disposable
  onExit(cb: (code?: number) => void): Disposable
  onTitleChange(cb: (title: string) => void): Disposable
}

// Decorators ──────────────────────────────────────────────────────────────────

export interface DecorationSpec {
  range: {
    startLine: number
    endLine?: number
    startCol?: number
    endCol?: number
  }
  kind: 'underline' | 'badge' | 'overlay'
  className?: string
  render?(host: HTMLElement): void
  onClick?(): void
  tooltip?: string
}

export interface HoverSpec {
  contents: string | HTMLElement
}

export interface DecoratorsApi {
  register(decorator: {
    id: string
    onOutput(ctx: {
      tabId: number
      chunk: string
      absLine: number
    }): DecorationSpec[] | void
    hover?(ctx: {
      tabId: number
      line: string
      range: [number, number]
    }): HoverSpec | null
  }): Disposable
  /** Skip running decorators on a specific tab (useful for high-volume sessions). */
  skip(tabId: number): Disposable
}

// Themes ──────────────────────────────────────────────────────────────────────

export interface ThemeDefinition {
  id: string
  label: string
  cssVars: Record<string, string>
  xterm: {
    background: string
    foreground: string
    cursor: string
    cursorAccent?: string
    selection?: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

export interface ThemesApi {
  register(theme: ThemeDefinition): Disposable
  list(): Array<{ id: string; label: string; source: 'core' | string }>
  active(): string
  setActive(id: string): void
}

// Providers ───────────────────────────────────────────────────────────────────

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd?: number
}

export interface AiDelta {
  text?: string
  finished?: boolean
  usage?: AiUsage
}

export interface AiStreamReq {
  provider?: string
  model?: string
  system?: string
  messages: AiMessage[]
  signal?: AbortSignal
}

export interface AiProviderImpl {
  id: string
  label: string
  models?: Array<{ id: string; label?: string }>
  /** Default true. When false, no vault-stored API key is required (e.g. local Ollama). */
  requiresVault?: boolean
  /** Vault path where the API key lives, e.g. 'ai_keys.anthropic'. */
  vaultKeyPath?: string
  /** Optional dynamic model fetch — powers the "refresh models" button in Settings. */
  listModels?(): Promise<Array<{ id: string; label?: string }>>
  complete(req: AiStreamReq): Promise<{ text: string; usage: AiUsage }>
  stream?(req: AiStreamReq): AsyncIterable<AiDelta>
}

export interface AiProviderInfo {
  id: string
  label: string
  source: 'core' | string
  models?: Array<{ id: string; label?: string }>
  requiresVault?: boolean
  vaultKeyPath?: string
}

export interface AiApi {
  complete(req: AiStreamReq): Promise<{ text: string; usage: AiUsage }>
  stream(req: AiStreamReq): AsyncIterable<AiDelta>
  registerProvider(p: AiProviderImpl): Disposable
  listProviders(): AiProviderInfo[]
  /**
   * Returns the live SDK client published by an AI provider extension as the
   * service `ai.sdk.<providerId>`, or null if the provider is not active.
   * Bypasses the manifest `consumedServices` declaration — escape hatch for
   * casual consumers. For typed access with proper service lifecycle, declare
   * `consumedServices: { 'ai.sdk.<id>': { versionRange: '^1.0.0' } }` and use
   * `ctx.services['ai.sdk.<id>']`.
   * @since mterminal-api 1.4.0
   */
  getSdk<T = unknown>(providerId: string): T | null
}

export interface ProvidersApi {
  /** Voice transcription engines. */
  registerVoice(p: {
    id: string
    label: string
    transcribe(audio: ArrayBuffer, opts?: { language?: string }): Promise<{ text: string }>
  }): Disposable
}

// Settings ────────────────────────────────────────────────────────────────────

export interface SettingsApi {
  /** Get a setting from this extension's namespace, with manifest defaults applied. */
  get<T = unknown>(key: string): T | undefined
  getAll(): Record<string, unknown>
  set(key: string, value: unknown): void | Promise<void>
  onChange(cb: (key: string, value: unknown) => void): Disposable
  /** Read-only access to core (host) settings. */
  core: {
    get<T = unknown>(key: string): T | undefined
    onChange(cb: (key: string, value: unknown) => void): Disposable
  }
}

// Events ──────────────────────────────────────────────────────────────────────

export interface EventBus {
  emit<E extends EventName>(event: E, payload?: PayloadOf<E>): void
  on<E extends EventName>(event: E, cb: (payload: PayloadOf<E>) => void): Disposable
  once<E extends EventName>(event: E, cb: (payload: PayloadOf<E>) => void): Disposable
}

type PayloadOf<E extends EventName> = E extends keyof AnyEventMap ? AnyEventMap[E] : unknown

// IPC ─────────────────────────────────────────────────────────────────────────

export interface ExtIpc {
  /** Calls a handler registered by the same extension's main-side `activate()`. */
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  /** Listens for events sent by the same extension's main-side `ipc.emit(...)`. */
  on(channel: string, cb: (payload: unknown) => void): Disposable
}

export interface MainExtIpc {
  handle(
    channel: string,
    fn: (args: unknown, sender: unknown) => unknown | Promise<unknown>,
  ): Disposable
  on(channel: string, fn: (args: unknown) => void): Disposable
  /** Send an event to all renderers subscribed via `ctx.ipc.on(channel, ...)`. */
  emit(channel: string, payload: unknown): void
}

// Workspace ───────────────────────────────────────────────────────────────────

export interface WorkspaceApi {
  groups(): Array<{ id: string; label: string }>
  activeGroup(): string | null
  setActiveGroup(id: string): void
  tabs(groupId?: string): TabSummary[]
  /** Get the current working directory of the active terminal, if any. */
  cwd(): string | null
}

// UI helpers ──────────────────────────────────────────────────────────────────

export interface ModalSpec {
  title: string
  width?: number
  height?: number
  render(host: HTMLElement, ctrl: ModalController): void | (() => void)
}

export interface ModalController {
  close(result?: unknown): void
  setTitle(title: string): void
}

export interface UiApi {
  openModal<T = unknown>(spec: ModalSpec): Promise<T | undefined>
  confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string }): Promise<boolean>
  prompt(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string }): Promise<string | undefined>
  toast(opts: { kind?: 'info' | 'success' | 'warn' | 'error'; message: string; durationMs?: number }): void
}

export interface NotifyApi {
  show(opts: { title: string; body?: string; silent?: boolean }): void
  requestPermission(): Promise<'granted' | 'denied' | 'default'>
}

// Storage ─────────────────────────────────────────────────────────────────────

export interface KeyValueStore {
  get<T = unknown>(key: string, def?: T): T | undefined
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): string[]
  /** Subscribe to changes from any source (other windows, hot-reload). */
  onChange(cb: (key: string, value: unknown) => void): Disposable
}

/**
 * Per-extension secret store.
 *
 * Decoupled from regular settings — values live in `~/.mterminal/data/<id>/
 * secrets.json` (encrypted via the OS keychain when available). Extensions
 * declare which keys they need via `contributes.secrets`, the host
 * auto-renders password inputs in Settings, and code reads the value at
 * runtime via `ctx.secrets.get('<key>')`.
 *
 * Extensions are free to use this OR roll their own credential flow.
 */
export interface SecretsApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  keys(): Promise<string[]>
  onChange(cb: (key: string, present: boolean) => void): Disposable
}

/**
 * Master-password protected per-extension secret storage. Backed by the host
 * vault (Argon2id + XChaCha20-Poly1305). All read/write operations gate on
 * `vault unlocked` — when locked, the host shows the master-password modal
 * and the call resolves only after the user enters the password. If the user
 * cancels the prompt, the call rejects with `vault locked`.
 *
 * Use for highly sensitive secrets (API keys, tokens). For low-sensitivity
 * caches that should survive a vault lock, use `SecretsApi` (OS keychain).
 *
 * @since mterminal-api 1.1.0
 */
export interface VaultApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  keys(): Promise<string[]>
  onChange(cb: (key: string, present: boolean) => void): Disposable
}

// Services ────────────────────────────────────────────────────────────────────

/**
 * Proxy returned for each consumed service. While the provider is unavailable
 * (optional service or pending activation), all method calls reject with
 * `ServiceUnavailableError`. Subscribe via `onAvailable()` to react.
 */
export interface ServiceProxy<T> {
  readonly id: string
  readonly available: boolean
  readonly version: string | null
  readonly impl: T | null
  onAvailable(cb: (impl: T) => void): Disposable
  onUnavailable(cb: () => void): Disposable
}

export type ServiceMap = Record<string, ServiceProxy<unknown>>

export interface ServicesPublishApi {
  /** Publish the implementation for a service declared in `providedServices`. */
  publish<T>(id: string, impl: T): Disposable
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw `window.mt` shape — kept as `unknown`-ish to avoid leaking core internals.
// Plugins that reach into `ctx.mt` are off the stable API train.
// ─────────────────────────────────────────────────────────────────────────────

export interface MtApi {
  readonly [namespace: string]: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class ProposedApiError extends Error {
  readonly proposalName: string
}

export class ServiceUnavailableError extends Error {
  readonly serviceId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports
// ─────────────────────────────────────────────────────────────────────────────

export type { AnyEventMap, AppEventMap, PluginEventMap, EventName, TabSummary } from './events'
