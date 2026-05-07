/**
 * Renderer-side extension host.
 *
 * Mirrors the main-side host: maintains a registry of installed extensions,
 * resolves activation order, runs `activate(ctx)` on the renderer entry, and
 * disposes contributions on deactivate / hot-reload.
 *
 * Lifecycle:
 *   - `boot()` fetches manifests from main via `window.mt.ext.listManifests`,
 *     applies declarative contributions (commands stubs, keybindings names,
 *     panel titles, status-bar items, themes loaded from theme files), then
 *     activates extensions whose `activationEvents` include
 *     `onStartupFinished`.
 *   - `activate(id)` checks trust (showing `TrustModal` if needed), loads the
 *     plugin renderer module via `mt-ext://` protocol, calls
 *     `mod.activate(ctx)`, and stores the dispose handle.
 *   - `deactivate(id)` runs ctx.dispose, then sweeps registries by source.
 *   - `reload(id)` is a deactivate + re-activate, with the cache-bust query
 *     param appended to the dynamic import URL.
 */

import { createRendererCtx, type NormalizedManifest } from './ctx'
import { loadPluginRendererModule } from './module-loader'
import { getCommandRegistry } from './registries/commands'
import { getThemeRegistry } from './registries/themes'
import { getSettingsSchemaRegistry } from './registries/settings-schema'
import { getRendererEventBus } from './event-bus'
import { getTrustQueue, persistTrust, type TrustRequest } from './trust-flow'

export interface ManifestSnapshot {
  manifest: ManifestRecord
  state: string
  enabled: boolean
  trusted: boolean
  lastError: { message: string; stack?: string } | null
  activatedAt: number | null
}

export interface ManifestRecord {
  id: string
  packageName: string
  version: string
  displayName?: string
  description?: string
  author?: string
  icon?: string
  mainEntry: string | null
  rendererEntry: string | null
  apiVersionRange: string
  activationEvents: string[]
  capabilities: string[]
  enabledApiProposals: string[]
  providedServices: Record<string, { version: string }>
  consumedServices: Record<string, { versionRange: string; optional?: boolean }>
  contributes: {
    commands: Array<{ id: string; title?: string }>
    keybindings: Array<{ command: string; key: string; when?: string }>
    settings: unknown
    panels: Array<{ id: string; title: string; location: string }>
    statusBar: Array<{ id: string; align: 'left' | 'right' }>
    contextMenu: Array<{ command: string; context: string }>
    tabTypes: Array<{ id: string; title: string }>
    decorators: Array<{ id: string; appliesTo: string }>
    themes: Array<{ id: string; label: string; path: string }>
    providers: Array<{ kind: string; id: string; label: string }>
    secrets: Array<{
      key: string
      label: string
      description?: string
      link?: string
      placeholder?: string
    }>
  }
  source: 'built-in' | 'user'
  extensionPath: string
}

interface ActiveEntry {
  manifest: ManifestRecord
  ctxDispose: () => Promise<void>
  pluginDeactivate?: () => unknown | Promise<unknown>
  activationToken: string
}

export class ExtensionHostRenderer {
  private snapshots = new Map<string, ManifestSnapshot>()
  private active = new Map<string, ActiveEntry>()
  private listeners = new Set<() => void>()

  async boot(): Promise<void> {
    await this.loadManifests()
    this.applyDeclarativeContributions()

    // Listen for registry events from main so we can re-fetch when extensions
    // are installed/uninstalled or hot-reloaded.
    const bus = getRendererEventBus()
    bus.on('extension:activated', () => this.refreshSnapshots())
    bus.on('extension:deactivated', () => this.refreshSnapshots())

    getRendererEventBus().emit('app:ready', { version: '1.0.0-alpha.0' })

    // Activate eligible extensions with `onStartupFinished`.
    for (const snap of this.snapshots.values()) {
      if (!snap.enabled) continue
      if (snap.manifest.activationEvents.includes('onStartupFinished')) {
        try {
          await this.activate(snap.manifest.id)
        } catch (err) {
          console.error(`[ext] activate("${snap.manifest.id}") failed:`, err)
        }
      }
    }
  }

  async loadManifests(): Promise<void> {
    const list = (await window.mt.ext.listManifests()) as ManifestSnapshot[]
    this.snapshots.clear()
    for (const snap of list) {
      this.snapshots.set(snap.manifest.id, snap)
    }
    this.fire()
  }

  async refreshSnapshots(): Promise<void> {
    await this.loadManifests()
  }

  list(): ManifestSnapshot[] {
    return Array.from(this.snapshots.values())
  }

  /**
   * Wire declarative contributions BEFORE running plugin code.
   *   - commands get stubs: invoking them activates the extension and
   *     forwards
   *   - keybindings: registered against the same stub commands
   *   - settings schema: registered so the SettingsModal knows about it
   *   - themes: load JSON theme files from disk
   */
  private applyDeclarativeContributions(): void {
    const cmdReg = getCommandRegistry()
    const schemaReg = getSettingsSchemaRegistry()
    const themeReg = getThemeRegistry()

    for (const snap of this.snapshots.values()) {
      const m = snap.manifest

      for (const cmd of m.contributes.commands) {
        cmdReg.registerStub({
          id: cmd.id,
          title: cmd.title,
          source: m.id,
          onInvoke: async () => {
            await this.activate(m.id)
          },
        })
      }

      if (m.contributes.settings) {
        schemaReg.register({
          extId: m.id,
          displayName: m.displayName ?? m.id,
          schema: m.contributes.settings,
          source: m.id,
        })
      }

      for (const t of m.contributes.themes) {
        // Load theme JSON via mt-ext:// protocol (no code activation needed).
        void this.loadThemeFile(m.id, t.id, t.label, t.path).then((def) => {
          if (def) themeReg.register(def, m.id)
        }).catch((err) => {
          console.warn(`[ext] failed to load theme ${m.id}:${t.id}:`, err)
        })
      }
    }
  }

  private async loadThemeFile(
    extId: string,
    themeId: string,
    label: string,
    relPath: string,
  ): Promise<{ id: string; label: string; cssVars: Record<string, string>; xterm: Record<string, string> } | null> {
    const url = `mt-ext://${extId}/${relPath.replace(/^\.?\/?/, '')}`
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const cssVars = (data?.cssVars && typeof data.cssVars === 'object') ? data.cssVars : {}
      const xterm = (data?.xterm && typeof data.xterm === 'object') ? data.xterm : {}
      return { id: themeId, label, cssVars, xterm }
    } catch (err) {
      console.warn(`[ext] theme fetch failed (${url}):`, err)
      return null
    }
  }

  async activate(id: string): Promise<void> {
    if (this.active.has(id)) return
    const snap = this.snapshots.get(id)
    if (!snap) throw new Error(`unknown extension: ${id}`)
    if (!snap.enabled) throw new Error(`extension "${id}" is disabled`)

    if (!snap.trusted) {
      const decision = await this.requestTrust(snap)
      if (!decision.trusted) {
        throw new Error(`extension "${id}" trust denied`)
      }
      snap.trusted = true
    }

    const m = snap.manifest

    // Build ctx
    const normalized: NormalizedManifest = {
      id: m.id,
      extensionPath: m.extensionPath,
      dataPath: m.extensionPath, // renderer-side dataPath isn't written from
      // here; main-side ctx writes to the real ~/.mterminal/.../data/.
      contributes: { settings: m.contributes.settings },
      consumedServices: m.consumedServices,
      providedServices: m.providedServices,
      enabledApiProposals: m.enabledApiProposals,
    }
    const { ctx, dispose: ctxDispose } = createRendererCtx(normalized)

    // Load and run renderer module
    const activationToken = String(Date.now())
    if (m.rendererEntry) {
      // Renderer entry path is absolute on the host; convert to a relative
      // path under the extension directory for the mt-ext:// URL.
      const rel = relativizeToExtPath(m.extensionPath, m.rendererEntry)
      const mod = await loadPluginRendererModule(m.id, rel, activationToken)
      if (mod && typeof mod.activate === 'function') {
        try {
          const result = await mod.activate(ctx)
          // If activate returned a Disposable, let ctx track it.
          if (result && typeof result === 'object' && typeof (result as { dispose?: unknown }).dispose === 'function') {
            ctx.subscribe(result as { dispose: () => void })
          }
        } catch (err) {
          await ctxDispose()
          console.error(`[ext] activate threw in "${m.id}":`, err)
          throw err
        }
        this.active.set(id, {
          manifest: m,
          ctxDispose,
          pluginDeactivate: typeof mod.deactivate === 'function' ? mod.deactivate.bind(mod) : undefined,
          activationToken,
        })
        this.fire()
        return
      }
      // No module or no activate — still register snapshot as active so the
      // user sees it as running (declarative-only plugin).
    }
    this.active.set(id, { manifest: m, ctxDispose, activationToken })
    this.fire()
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.active.get(id)
    if (!entry) return
    if (entry.pluginDeactivate) {
      try {
        await entry.pluginDeactivate()
      } catch (err) {
        console.error(`[ext] deactivate threw in "${id}":`, err)
      }
    }
    await entry.ctxDispose()
    this.active.delete(id)
    this.fire()
  }

  async reload(id: string): Promise<void> {
    await this.deactivate(id)
    await window.mt.ext.reload(id)
    await this.refreshSnapshots()
    const snap = this.snapshots.get(id)
    if (snap?.enabled) {
      await this.activate(id)
    }
  }

  isActive(id: string): boolean {
    return this.active.has(id)
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private fire(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }

  private async requestTrust(snap: ManifestSnapshot): Promise<{ trusted: boolean }> {
    const req: TrustRequest = {
      id: snap.manifest.id,
      displayName: snap.manifest.displayName ?? snap.manifest.id,
      source: snap.manifest.source,
      capabilities: snap.manifest.capabilities,
    }
    const decision = await getTrustQueue().request(req)
    if (decision.trusted) {
      await persistTrust(req.id, true)
    }
    return decision
  }
}

function relativizeToExtPath(extPath: string, entryPath: string): string {
  // The main process resolves entries to absolute paths. To form an
  // mt-ext:// URL, we want the segment after the extension folder.
  // Strip any path separator differences (Windows vs POSIX).
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/$/, '')
  const e = norm(extPath)
  const f = norm(entryPath)
  if (f.startsWith(e + '/')) return f.slice(e.length + 1)
  // Fallback: use the entry as-is (the protocol handler will path-traverse-check).
  return f
}

let hostInstance: ExtensionHostRenderer | null = null
export function getRendererHost(): ExtensionHostRenderer {
  if (!hostInstance) hostInstance = new ExtensionHostRenderer()
  return hostInstance
}
