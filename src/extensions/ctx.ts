/**
 * `createRendererCtx` — builds the per-extension `ctx` object passed to
 * `activate(ctx)` on the renderer side.
 *
 * Responsibilities:
 *   - wire each registry method through a `subs.push()` so register* calls
 *     auto-clean on dispose
 *   - tag every contribution with the extension id (so we can drop them
 *     selectively at deactivation)
 *   - scope `ctx.events` so plugins emit under their own namespace and can't
 *     spoof `app:*`
 *   - expose `ctx.ipc` that delegates to `window.mt.ext.invoke/on` with the
 *     extension id pre-filled
 *   - resolve `ctx.services` proxies via the renderer-side service registry
 */

import type {
  Disposable,
  Disposer,
  ExtensionContext,
  Logger,
  CommandsApi,
  KeybindingsApi,
  PanelsApi,
  StatusBarApi,
  ContextMenuApi,
  TabsApi,
  DecoratorsApi,
  ThemesApi,
  ProvidersApi,
  EventBus,
  ExtIpc,
  SecretsApi,
  VaultApi,
  ServiceProxy,
  KeyValueStoreT,
} from './ctx-types'
import { getVaultGateBridge } from './vault-gate-bridge'

import { getCommandRegistry } from './registries/commands'
import { getKeybindingRegistry } from './registries/keybindings'
import { getPanelRegistry } from './registries/panels'
import { getStatusBarRegistry } from './registries/status-bar'
import { getContextMenuRegistry } from './registries/context-menu'
import { getTabTypeRegistry } from './registries/tab-types'
import { getDecoratorRegistry } from './registries/decorators'
import { getThemeRegistry } from './registries/themes'
import { getRendererEventBus } from './event-bus'
import { createGlobalState, createWorkspaceState } from './kv-store'
import { getServiceRegistry } from './services'
import { getSettingsBackend } from './settings-namespace'
import { createAiBridge } from './api-bridge/ai'
import { createGitBridge } from './api-bridge/git'
import { createTerminalBridge } from './api-bridge/terminal'
import { createWorkspaceBridge, getWorkspaceBackend } from './api-bridge/workspace'
import { createUiBridge, createNotifyBridge } from './api-bridge/ui'

export interface NormalizedManifest {
  id: string
  extensionPath: string
  dataPath: string
  contributes: {
    settings: unknown
  }
  consumedServices: Record<string, { versionRange: string; optional?: boolean }>
  providedServices: Record<string, { version: string }>
  enabledApiProposals: string[]
}

export interface CreateCtxResult {
  ctx: ExtensionContext
  dispose: () => Promise<void>
}

const NS = (id: string): string => `<ext:${id}>`

function mkLogger(id: string): Logger {
  const tag = `[ext:${id}]`
  return {
    debug: (...args) => console.debug(tag, ...args),
    info: (...args) => console.info(tag, ...args),
    warn: (...args) => console.warn(tag, ...args),
    error: (...args) => console.error(tag, ...args),
  }
}

export function createRendererCtx(manifest: NormalizedManifest): CreateCtxResult {
  const id = manifest.id
  const logger = mkLogger(id)
  const subs: Array<() => void> = []
  const subscribe = (d: Disposer): void => {
    subs.push(typeof d === 'function' ? d : () => d.dispose())
  }

  // Registries (singletons)
  const cmdReg = getCommandRegistry()
  const kbReg = getKeybindingRegistry()
  const panelReg = getPanelRegistry()
  const sbReg = getStatusBarRegistry()
  const cmReg = getContextMenuRegistry()
  const ttReg = getTabTypeRegistry()
  const decReg = getDecoratorRegistry()
  const themeReg = getThemeRegistry()
  const bus = getRendererEventBus()
  const settingsBackend = getSettingsBackend()
  const wsBackend = getWorkspaceBackend()
  const serviceReg = getServiceRegistry()

  // ─ commands ────────────────────────────────────────────────────────────
  const commands: CommandsApi = {
    register(spec) {
      const d = cmdReg.register({ ...spec, source: id })
      subscribe(d)
      return d
    },
    execute: (id, args) => cmdReg.execute(id, args),
    list: () => cmdReg.list().map((c) => ({ id: c.id, title: c.title, source: c.source })),
    has: (id) => cmdReg.has(id),
  }

  // ─ keybindings ─────────────────────────────────────────────────────────
  const keybindings: KeybindingsApi = {
    register(kb) {
      const d = kbReg.register({ ...kb, source: id })
      subscribe(d)
      return d
    },
  }

  // ─ panels ──────────────────────────────────────────────────────────────
  const panels: PanelsApi = {
    register(spec) {
      const d = panelReg.register({ ...spec, source: id })
      subscribe(d)
      return d
    },
    show: (panelId) => bus.emit('app:panel:show', { id: panelId }),
    hide: (panelId) => bus.emit('app:panel:hide', { id: panelId }),
  }

  // ─ status bar ──────────────────────────────────────────────────────────
  const statusBar: StatusBarApi = {
    register(item) {
      const d = sbReg.register({ ...item, source: id })
      subscribe(d)
      return d
    },
    update: (itemId, patch) => sbReg.update(itemId, patch),
  }

  // ─ context menu ────────────────────────────────────────────────────────
  const contextMenu: ContextMenuApi = {
    register(item) {
      const d = cmReg.register({ ...item, source: id })
      subscribe(d)
      return d
    },
  }

  // ─ tabs ────────────────────────────────────────────────────────────────
  const tabs: TabsApi = {
    registerTabType(spec) {
      const d = ttReg.register({ ...spec, source: id })
      subscribe(d)
      return d
    },
    open: (args) => wsBackend.openTab(args),
    close: (tabId) => wsBackend.closeTab(tabId),
    active: () => wsBackend.active(),
    list: () => wsBackend.list(),
    onChange(cb) {
      const d = wsBackend.onTabsChange(cb)
      subscribe(d)
      return d
    },
  }

  // ─ decorators ──────────────────────────────────────────────────────────
  const decorators: DecoratorsApi = {
    register(decorator) {
      const d = decReg.register({ ...decorator, source: id })
      subscribe(d)
      return d
    },
    skip(tabId) {
      const d = decReg.skip(tabId)
      subscribe(d)
      return d
    },
  }

  // ─ themes ──────────────────────────────────────────────────────────────
  const themes: ThemesApi = {
    register(theme) {
      const d = themeReg.register(theme, id)
      subscribe(d)
      return d
    },
    list: () => themeReg.list().map((t) => ({ id: t.id, label: t.label, source: t.source })),
    active: () => themeReg.getActive(),
    setActive: (themeId) => themeReg.setActive(themeId),
  }

  // ─ providers (voice etc.) ──────────────────────────────────────────────
  const providers: ProvidersApi = {
    registerVoice(_p) {
      // Voice provider registry is not implemented in v1 — voice still ships
      // as core. The hook is here for forward compat.
      logger.warn('providers.registerVoice is a no-op in v1')
      return { dispose: () => {} }
    },
  }

  // ─ settings ────────────────────────────────────────────────────────────
  const settings = {
    get<T = unknown>(key: string): T | undefined {
      const fromUser = settingsBackend.read(id, key) as T | undefined
      if (fromUser !== undefined) return fromUser
      const schema = manifest.contributes.settings as
        | { properties?: Record<string, { default?: unknown }> }
        | undefined
      const def = schema?.properties?.[key]?.default
      return def as T | undefined
    },
    getAll() {
      const schema = manifest.contributes.settings as
        | { properties?: Record<string, { default?: unknown }> }
        | undefined
      const defaults: Record<string, unknown> = {}
      if (schema?.properties) {
        for (const [k, v] of Object.entries(schema.properties)) {
          if (v && Object.prototype.hasOwnProperty.call(v, 'default')) defaults[k] = v.default
        }
      }
      return { ...defaults, ...settingsBackend.readAll(id) }
    },
    set(key: string, value: unknown) {
      return settingsBackend.write(id, key, value)
    },
    onChange(cb: (key: string, value: unknown) => void) {
      const d = settingsBackend.onChange(id, cb)
      subscribe(d)
      return d
    },
    core: {
      get: <T = unknown>(key: string) => settingsBackend.readCore<T>(key),
      onChange(cb: (key: string, value: unknown) => void) {
        const d = settingsBackend.onCoreChange(cb)
        subscribe(d)
        return d
      },
    },
  }

  // ─ events ──────────────────────────────────────────────────────────────
  const events: EventBus = {
    emit(event, payload) {
      if (event.startsWith('app:')) {
        logger.warn(`ignored attempt to emit reserved event "${event}"`)
        return
      }
      const fullName = event.includes(':') ? event : `${id}:${event}`
      bus.emit(fullName, payload)
    },
    on(event, cb) {
      const off = bus.on(event, (payload) => cb(payload))
      const d: Disposable = { dispose: off }
      subscribe(d)
      return d
    },
    once(event, cb) {
      const off = bus.once(event, (payload) => cb(payload))
      const d: Disposable = { dispose: off }
      subscribe(d)
      return d
    },
  }

  // ─ ipc ─────────────────────────────────────────────────────────────────
  const ipc: ExtIpc = {
    invoke<T = unknown>(channel: string, args?: unknown): Promise<T> {
      return window.mt.ext.invoke(id, channel, args) as Promise<T>
    },
    on(channel, cb) {
      const off = window.mt.ext.on(id, channel, cb)
      const d: Disposable = { dispose: off }
      subscribe(d)
      return d
    },
  }

  // ─ ai / git / terminal / workspace / ui / notify ───────────────────────
  const ai = createAiBridge({ extId: id })
  const git = createGitBridge()
  const terminal = createTerminalBridge()
  const workspace = createWorkspaceBridge()
  const ui = createUiBridge()
  const notify = createNotifyBridge()

  // ─ services ────────────────────────────────────────────────────────────
  const consumed = serviceReg.consume(id, manifest.consumedServices)
  subs.push(consumed.dispose)
  const providerHandles: Array<() => void> = []
  const providedServices = {
    publish<T>(serviceId: string, impl: T): Disposable {
      const versionEntry = manifest.providedServices[serviceId]
      if (!versionEntry) {
        logger.warn(
          `publish("${serviceId}") not declared in providedServices; using version 0.0.0`,
        )
      }
      const off = serviceReg.publish({
        id: serviceId,
        version: versionEntry?.version ?? '0.0.0',
        impl,
        providerExtId: id,
      })
      providerHandles.push(off)
      return { dispose: off }
    },
  }

  // ─ storage ─────────────────────────────────────────────────────────────
  const globalState: KeyValueStoreT = createGlobalState(id)
  const workspaceState: KeyValueStoreT = createWorkspaceState(id)

  // ─ secrets ─────────────────────────────────────────────────────────────
  const mtSecrets = window.mt.ext.secrets
  const secrets: SecretsApi = {
    get: (key) => mtSecrets.get(id, key),
    set: (key, value) => mtSecrets.set(id, key, value).then(() => undefined),
    delete: (key) => mtSecrets.delete(id, key).then(() => undefined),
    has: (key) => mtSecrets.has(id, key),
    keys: () => mtSecrets.keys(id),
    onChange(cb) {
      const off = mtSecrets.onChange(id, cb)
      const d: Disposable = { dispose: off }
      subscribe(d)
      return d
    },
  }

  // ─ vault (master-password protected) ──────────────────────────────────
  const mtVault = window.mt.ext.vault
  const ensureVault = async (): Promise<void> => {
    const gate = getVaultGateBridge()
    if (!gate) throw new Error('vault not available — gate not mounted')
    if (gate.isUnlocked()) return
    const ok = await gate.ensure()
    if (!ok) throw new Error('vault locked')
  }
  const vault: VaultApi = {
    async get(key) {
      await ensureVault()
      return mtVault.get(id, key)
    },
    async set(key, value) {
      await ensureVault()
      await mtVault.set(id, key, value)
    },
    async delete(key) {
      await ensureVault()
      await mtVault.delete(id, key)
    },
    async has(key) {
      await ensureVault()
      return mtVault.has(id, key)
    },
    async keys() {
      await ensureVault()
      return mtVault.keys(id)
    },
    onChange(cb) {
      const off = mtVault.onChange(id, cb)
      const d: Disposable = { dispose: off }
      subscribe(d)
      return d
    },
  }

  // ─ assemble ────────────────────────────────────────────────────────────
  const services = consumed.proxies as Record<string, ServiceProxy<unknown>>
  void NS // keep helper

  const ctx: ExtensionContext = {
    id,
    extensionPath: manifest.extensionPath,
    dataPath: manifest.dataPath,
    manifest,
    logger,
    mt: window.mt,
    commands,
    keybindings,
    panels,
    statusBar,
    contextMenu,
    tabs,
    decorators,
    themes,
    providers,
    settings,
    events,
    ipc,
    ai,
    git,
    terminal,
    workspace,
    notify,
    ui,
    workspaceState,
    globalState,
    secrets,
    vault,
    services,
    providedServices,
    subscribe,
  }

  const dispose = async (): Promise<void> => {
    while (subs.length) {
      const fn = subs.pop()!
      try {
        fn()
      } catch (err) {
        logger.error('dispose error:', err)
      }
    }
    while (providerHandles.length) {
      const fn = providerHandles.pop()!
      try {
        fn()
      } catch (err) {
        logger.error('service unpublish error:', err)
      }
    }
    // Sweep registries by source id (in case the plugin forgot to subscribe)
    cmdReg.removeBySource(id)
    kbReg.removeBySource(id)
    panelReg.removeBySource(id)
    sbReg.removeBySource(id)
    cmReg.removeBySource(id)
    ttReg.removeBySource(id)
    decReg.removeBySource(id)
    themeReg.removeBySource(id)
  }

  return { ctx, dispose }
}
