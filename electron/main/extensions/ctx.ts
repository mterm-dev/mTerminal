import path from 'node:path'
import fs from 'node:fs/promises'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ensureExtensionDataDir } from './locations'
import { getMainEventBus, type EventOrigin } from './event-bus-main'
import type { ServiceProxy, ServiceRegistry } from './services'
import type { ExtensionManifest } from './manifest'

/**
 * Build a main-side `ctx` for one extension. Each extension gets its own
 * namespaced IPC, namespaced event bus emit, scoped key-value storage in
 * `<dataDir>/global-state.json`, and a list of disposables tracked by the host.
 */

export interface MainExtensionContext {
  readonly id: string
  readonly extensionPath: string
  readonly dataPath: string
  readonly manifest: ExtensionManifest
  readonly logger: Logger
  readonly ipc: MainExtIpc
  readonly events: ScopedEventBus
  readonly settings: SettingsApi
  readonly globalState: KeyValueStore
  readonly services: Record<string, ServiceProxy<unknown>>
  readonly providedServices: { publish<T>(id: string, impl: T): Disposable }
  subscribe(d: Disposer): void
}

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

export interface MainExtIpc {
  handle(channel: string, fn: (args: unknown, sender: unknown) => unknown | Promise<unknown>): Disposable
  on(channel: string, fn: (args: unknown) => void): Disposable
  emit(channel: string, payload: unknown): void
}

export interface ScopedEventBus {
  emit(event: string, payload?: unknown): void
  on(event: string, cb: (payload: unknown, origin: EventOrigin) => void): Disposable
  once(event: string, cb: (payload: unknown, origin: EventOrigin) => void): Disposable
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

export interface KeyValueStore {
  get<T = unknown>(key: string, def?: T): T | undefined
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): string[]
  onChange(cb: (key: string, value: unknown) => void): Disposable
}

export interface CtxDeps {
  manifest: ExtensionManifest
  serviceRegistry: ServiceRegistry
  /** Read-only view of the existing settings store. */
  readCoreSetting: <T = unknown>(key: string) => T | undefined
  onCoreSettingChange: (cb: (key: string, value: unknown) => void) => Disposable
  /** Read/write extension-namespaced settings: settings.extensions[id][...]. */
  readExtSetting: (id: string, key: string) => unknown
  readAllExtSettings: (id: string) => Record<string, unknown>
  writeExtSetting: (id: string, key: string, value: unknown) => Promise<void>
  onExtSettingChange: (id: string, cb: (key: string, value: unknown) => void) => Disposable
}

const NS = 'ext:'

function mkLogger(id: string): Logger {
  const tag = `[ext:${id}]`
  return {
    debug: (...args) => console.debug(tag, ...args),
    info: (...args) => console.info(tag, ...args),
    warn: (...args) => console.warn(tag, ...args),
    error: (...args) => console.error(tag, ...args),
  }
}

export async function createMainCtx(deps: CtxDeps): Promise<{ ctx: MainExtensionContext; dispose: () => Promise<void> }> {
  const { manifest } = deps
  const dataPath = await ensureExtensionDataDir(manifest.id)
  const subs: Array<() => void> = []
  const logger = mkLogger(manifest.id)
  const bus = getMainEventBus()

  // ── ipc ─────────────────────────────────────────────────────────────────
  const handlers = new Map<string, (args: unknown, sender: unknown) => unknown | Promise<unknown>>()
  const ipcInvokeChannel = `ext:invoke`
  // We add a single per-extension dispatcher; the global router lives in
  // ipc-bridge.ts (registered once for the whole process).
  const ipc: MainExtIpc = {
    handle(channel, fn) {
      handlers.set(channel, fn)
      return {
        dispose: () => {
          if (handlers.get(channel) === fn) handlers.delete(channel)
        },
      }
    },
    on(channel, fn) {
      const event = `${NS}${manifest.id}:${channel}:in`
      const off = bus.on(event, (payload) => fn(payload))
      return { dispose: off }
    },
    emit(channel, payload) {
      const event = `${NS}${manifest.id}:${channel}`
      bus.emit(event, payload)
    },
  }

  // Register handlers map on a shared global so the bridge can dispatch.
  registerExtensionDispatcher(manifest.id, handlers)

  // Best-effort silence the `ipcInvokeChannel` lint; channel name is built into bridge.
  void ipcInvokeChannel

  // ── events ──────────────────────────────────────────────────────────────
  const events: ScopedEventBus = {
    emit(event, payload) {
      // Plugins MAY NOT emit `app:*`. Auto-prefix unprefixed events.
      if (event.startsWith('app:')) {
        logger.warn(`ignored attempt to emit reserved event "${event}"`)
        return
      }
      const fullName = event.includes(':') ? event : `${manifest.id}:${event}`
      bus.emit(fullName, payload)
    },
    on(event, cb) {
      const off = bus.on(event, cb)
      return { dispose: off }
    },
    once(event, cb) {
      const off = bus.once(event, cb)
      return { dispose: off }
    },
  }

  // ── settings ────────────────────────────────────────────────────────────
  const settings: SettingsApi = {
    get(key) {
      const all = deps.readAllExtSettings(manifest.id)
      const fromUser = all[key]
      if (fromUser !== undefined) return fromUser as never
      return readDefault(manifest.contributes.settings, key) as never
    },
    getAll() {
      return { ...readAllDefaults(manifest.contributes.settings), ...deps.readAllExtSettings(manifest.id) }
    },
    set(key, value) {
      return deps.writeExtSetting(manifest.id, key, value)
    },
    onChange(cb) {
      return deps.onExtSettingChange(manifest.id, cb)
    },
    core: {
      get: deps.readCoreSetting,
      onChange: deps.onCoreSettingChange,
    },
  }

  // ── globalState ─────────────────────────────────────────────────────────
  const globalState = await openKeyValueStore(path.join(dataPath, 'global-state.json'))

  // ── services ────────────────────────────────────────────────────────────
  const consumed = deps.serviceRegistry.consume(manifest.id, manifest.consumedServices)
  subs.push(consumed.dispose)

  const providedHandles: Array<() => void> = []
  const providedServices = {
    publish<T>(id: string, impl: T): Disposable {
      const versionEntry = manifest.providedServices[id]
      if (!versionEntry) {
        logger.warn(`publish("${id}") called but service not declared in providedServices`)
      }
      const off = deps.serviceRegistry.publish({
        id,
        version: versionEntry?.version ?? '0.0.0',
        impl,
        providerExtId: manifest.id,
      })
      providedHandles.push(off)
      return { dispose: off }
    },
  }

  const ctx: MainExtensionContext = {
    id: manifest.id,
    extensionPath: manifest.extensionPath,
    dataPath,
    manifest,
    logger,
    ipc,
    events,
    settings,
    globalState,
    services: consumed.proxies as Record<string, ServiceProxy<unknown>>,
    providedServices,
    subscribe(d) {
      subs.push(typeof d === 'function' ? d : () => d.dispose())
    },
  }

  const dispose = async (): Promise<void> => {
    // Run subscriptions in reverse.
    while (subs.length) {
      const fn = subs.pop()!
      try {
        fn()
      } catch (err) {
        logger.error('dispose error:', err)
      }
    }
    while (providedHandles.length) {
      const fn = providedHandles.pop()!
      try {
        fn()
      } catch (err) {
        logger.error('service unpublish error:', err)
      }
    }
    unregisterExtensionDispatcher(manifest.id)
    await globalState.flush()
  }

  return { ctx, dispose }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher registry: ipc-bridge looks up handlers by extension id.
// ─────────────────────────────────────────────────────────────────────────────

const dispatchers = new Map<
  string,
  Map<string, (args: unknown, sender: unknown) => unknown | Promise<unknown>>
>()

function registerExtensionDispatcher(
  id: string,
  handlers: Map<string, (args: unknown, sender: unknown) => unknown | Promise<unknown>>,
): void {
  dispatchers.set(id, handlers)
}
function unregisterExtensionDispatcher(id: string): void {
  dispatchers.delete(id)
}
export function dispatchExtensionInvoke(
  id: string,
  channel: string,
  args: unknown,
  sender: unknown,
): unknown | Promise<unknown> {
  const handlers = dispatchers.get(id)
  if (!handlers) throw new Error(`extension "${id}" is not active or has no handlers`)
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`extension "${id}" has no handler for "${channel}"`)
  return fn(args, sender)
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults extracted from manifest JSON Schema
// ─────────────────────────────────────────────────────────────────────────────

function readDefault(schema: ExtensionManifest['contributes']['settings'], key: string): unknown {
  if (!schema || !schema.properties) return undefined
  const sub = schema.properties[key]
  if (sub && Object.prototype.hasOwnProperty.call(sub, 'default')) return sub.default
  return undefined
}

function readAllDefaults(schema: ExtensionManifest['contributes']['settings']): Record<string, unknown> {
  if (!schema?.properties) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema.properties)) {
    if (Object.prototype.hasOwnProperty.call(v, 'default')) out[k] = v.default
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-extension JSON KV store (used for globalState and renderer-relayed kv)
// ─────────────────────────────────────────────────────────────────────────────

export async function openKeyValueStore(filePath: string): Promise<
  KeyValueStore & {
    flush(): Promise<void>
  }
> {
  let data: Record<string, unknown> = {}
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    // missing file is fine
  }

  const listeners = new Set<(key: string, value: unknown) => void>()
  let writePending: Promise<void> | null = null

  const persist = async (): Promise<void> => {
    if (writePending) {
      await writePending
    }
    writePending = (async () => {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
    })()
    await writePending
    writePending = null
  }

  return {
    get(key, def) {
      return key in data ? (data[key] as never) : (def as never)
    },
    async set(key, value) {
      data[key] = value
      for (const cb of listeners) cb(key, value)
      await persist()
    },
    async delete(key) {
      delete data[key]
      for (const cb of listeners) cb(key, undefined)
      await persist()
    },
    keys() {
      return Object.keys(data)
    },
    onChange(cb) {
      listeners.add(cb)
      return { dispose: () => listeners.delete(cb) }
    },
    flush: persist,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Touch ipcMain so TS doesn't complain (we don't register here — bridge does).
// ─────────────────────────────────────────────────────────────────────────────

void ipcMain
export type { IpcMainInvokeEvent }
