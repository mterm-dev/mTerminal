/**
 * Local mirrors of the public API surface, used by the renderer-side host
 * implementation. Kept in this file so the implementation files don't have
 * a hard dependency on `@mterminal/extension-api` at compile time.
 *
 * The shapes here intentionally match `packages/extension-api/src/index.d.ts`
 * — keep them in sync when the public surface changes.
 */

export interface Disposable {
  dispose(): void
}

export type Disposer = Disposable | (() => void)

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

export interface CommandSpec {
  id: string
  title?: string
  run(args?: unknown): unknown | Promise<unknown>
}

export interface KeybindingSpec {
  command: string
  key: string
  when?: string
  args?: unknown
}

export interface PanelSpec {
  id: string
  title: string
  icon?: string
  location: 'sidebar' | 'sidebar.bottom' | 'bottombar'
  initialCollapsed?: boolean
  render(host: HTMLElement, panelCtx: PanelCtx): void | (() => void)
}

export interface PanelCtx {
  readonly host: HTMLElement
  readonly width: number
  readonly height: number
  readonly visible: boolean
  onResize(cb: (rect: DOMRect) => void): Disposable
  onVisibilityChange(cb: (visible: boolean) => void): Disposable
}

export interface StatusBarItemSpec {
  id: string
  align: 'left' | 'right'
  text?: string | (() => string)
  icon?: string
  tooltip?: string
  onClick?(): void
  refreshOn?: string[]
  priority?: number
}

export interface ContextMenuItemSpec {
  command: string
  context: string
  when?: string
  group?: string
  label?: string
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
  getTitle?(): string
}

export interface TabTypeSpec {
  id: string
  title: string
  icon?: string
  factory(props: TabFactoryProps): TabInstance
}

export interface ThemeDefinition {
  id: string
  label: string
  cssVars: Record<string, string>
  xterm: Record<string, string>
}

// Minimal aliases to keep ExtensionContext shape readable.
export interface ExtensionContext {
  readonly id: string
  readonly extensionPath: string
  readonly dataPath: string
  readonly manifest: unknown
  readonly logger: Logger
  readonly mt: typeof window.mt

  readonly commands: CommandsApi
  readonly keybindings: KeybindingsApi
  readonly panels: PanelsApi
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
  readonly workspaceState: KeyValueStoreT
  readonly globalState: KeyValueStoreT
  readonly secrets: SecretsApi
  readonly vault: VaultApi
  readonly services: Record<string, ServiceProxy<unknown>>
  readonly providedServices: { publish<T>(id: string, impl: T): Disposable }
  subscribe(d: Disposer): void
}

export interface SecretsApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  keys(): Promise<string[]>
  onChange(cb: (key: string, present: boolean) => void): Disposable
}

/**
 * Master-password-protected secret storage. Operations may prompt the user to
 * unlock the vault — calls await the unlock flow and resolve only after the
 * vault is open (or reject if the user cancels).
 *
 * Use for highly sensitive data (long-lived API keys, deployment tokens).
 * For low-sensitivity caches that need to survive a vault lock, use
 * `ctx.secrets` (OS keychain) instead.
 */
export interface VaultApi {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  keys(): Promise<string[]>
  onChange(cb: (key: string, present: boolean) => void): Disposable
}

export interface CommandsApi {
  register(cmd: CommandSpec): Disposable
  execute<T = unknown>(id: string, args?: unknown): Promise<T>
  list(): Array<{ id: string; title?: string; source: 'core' | string }>
  has(id: string): boolean
}

export interface KeybindingsApi {
  register(kb: KeybindingSpec): Disposable
}

export interface PanelsApi {
  register(panel: PanelSpec): Disposable
  show(id: string): void
  hide(id: string): void
}

export interface SettingsRendererCtx {
  host: HTMLElement
  extId: string
  settings: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void | Promise<void>
    onChange(cb: (key: string, value: unknown) => void): Disposable
  }
}

export interface SettingsRendererApi {
  /**
   * Replace the auto-rendered schema-properties block in this extension's
   * Settings card with a plugin-supplied UI. The host still renders the title
   * header, AI bindings section, and secrets section.
   *
   * The render function receives a host `<div>` and a settings bridge scoped
   * to this extension. Return a cleanup callback that runs when the user
   * navigates away or the extension deactivates.
   */
  register(spec: { render(host: HTMLElement, ctx: SettingsRendererCtx): void | (() => void) }): Disposable
}

export interface StatusBarApi {
  register(item: StatusBarItemSpec): Disposable
  update(id: string, patch: Partial<{ text: string; icon: string; tooltip: string; onClick: () => void }>): void
}

export interface ContextMenuApi {
  register(item: ContextMenuItemSpec): Disposable
}

export interface TabsApi {
  registerTabType(type: TabTypeSpec): Disposable
  open(args: { type: string; title?: string; props?: unknown; groupId?: string | null }): Promise<number>
  close(tabId: number): void
  active(): { id: number; type: string } | null
  list(): Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>
  onChange(cb: (tabs: Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>) => void): Disposable
}

export interface DecoratorsApi {
  register(decorator: {
    id: string
    onOutput(ctx: { tabId: number; chunk: string; absLine: number }): unknown
    hover?(ctx: { tabId: number; line: string; range: [number, number] }): unknown
  }): Disposable
  skip(tabId: number): Disposable
}

export interface ThemesApi {
  register(theme: ThemeDefinition): Disposable
  list(): Array<{ id: string; label: string; source: 'core' | string }>
  active(): string
  setActive(id: string): void
}

export interface ProvidersApi {
  registerVoice(p: { id: string; label: string; transcribe(audio: ArrayBuffer, opts?: { language?: string }): Promise<{ text: string }> }): Disposable
}

export interface SettingsApi {
  get<T = unknown>(key: string): T | undefined
  getAll(): Record<string, unknown>
  set(key: string, value: unknown): void | Promise<void>
  onChange(cb: (key: string, value: unknown) => void): Disposable
  core: {
    get<T = unknown>(key: string): T | undefined
    onChange(cb: (key: string, value: unknown) => void): Disposable
  }
}

export interface EventBus {
  emit(event: string, payload?: unknown): void
  on(event: string, cb: (payload: unknown) => void): Disposable
  once(event: string, cb: (payload: unknown) => void): Disposable
}

export interface ExtIpc {
  invoke<T = unknown>(channel: string, args?: unknown): Promise<T>
  on(channel: string, cb: (payload: unknown) => void): Disposable
}

export interface AiProviderInfoLite {
  id: string
  label: string
  source: 'core' | string
  models?: Array<{ id: string; label?: string }>
  requiresVault?: boolean
  vaultKeyPath?: string
}

export interface AiApi {
  complete(req: unknown): Promise<{ text: string; usage: unknown }>
  stream(req: unknown): AsyncIterable<unknown>
  registerProvider(p: unknown): Disposable
  listProviders(): AiProviderInfoLite[]
}

export interface TerminalHandle {
  readonly tabId: number
  readonly ptyId: number
  readonly cwd: string | null
  readonly cmd: string | null
  readonly title: string
  read(maxBytes?: number): Promise<string>
  write(data: string): Promise<void>
  insertAtPrompt(data: string): Promise<void>
  sendKey(key: string): Promise<void>
  getSelection(): string | null
  onData(cb: (chunk: string) => void): Disposable
  onExit(cb: (code?: number) => void): Disposable
  onTitleChange(cb: (title: string) => void): Disposable
}

export interface TerminalApi {
  active(): TerminalHandle | null
  byId(tabId: number): TerminalHandle | null
  spawn(opts?: { shell?: string; args?: string[]; cwd?: string; env?: Record<string, string>; groupId?: string | null; title?: string }): Promise<TerminalHandle>
  list(): TerminalHandle[]
}

export interface WorkspaceApi {
  groups(): Array<{ id: string; label: string }>
  activeGroup(): string | null
  setActiveGroup(id: string): void
  tabs(groupId?: string): Array<{ id: number; type: string; title: string; groupId: string | null; active: boolean }>
  cwd(): string | null
}

export interface NotifyApi {
  show(opts: { title: string; body?: string; silent?: boolean }): void
  requestPermission(): Promise<'granted' | 'denied' | 'default'>
}

export interface UiApi {
  openModal<T = unknown>(spec: { title: string; width?: number; height?: number; render(host: HTMLElement, ctrl: { close(result?: unknown): void; setTitle(t: string): void }): void | (() => void) }): Promise<T | undefined>
  confirm(opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean>
  prompt(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string }): Promise<string | undefined>
  toast(opts: {
    kind?: 'info' | 'success' | 'warn' | 'error'
    title?: string
    message: string
    details?: string
    durationMs?: number
    dismissible?: boolean
  }): void
}

export interface ServiceProxy<T> {
  readonly id: string
  readonly available: boolean
  readonly version: string | null
  readonly impl: T | null
  onAvailable(cb: (impl: T) => void): Disposable
  onUnavailable(cb: () => void): Disposable
}

export interface KeyValueStoreT {
  get<T = unknown>(key: string, def?: T): T | undefined
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): string[]
  onChange(cb: (key: string, value: unknown) => void): Disposable
}
