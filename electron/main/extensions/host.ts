import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { ExtensionRegistry } from './registry'
import { ServiceRegistry, topoSortActivation } from './services'
import { getMainEventBus } from './event-bus-main'
import { getTrustStore } from './trust'
import { getSettingsShadow } from './settings-shadow'
import { createMainCtx } from './ctx'
import {
  builtInExtensionsDir,
  ensureUserDirs,
  listExtensionDirs,
  userExtensionsDir,
} from './locations'
import { readManifest, type ExtensionManifest, ManifestValidationError } from './manifest'
import { satisfies } from './semver-mini'
import { HOST_API_VERSION } from './api-version'
import { isUnlocked, purgeExtSecrets } from '../vault'

/**
 * The main-process extension host.
 *
 *   ┌──────────────────────────┐
 *   │  ExtensionHostMain        │
 *   │  ── scanAndSync()         │   reads disk, validates manifests
 *   │  ── activate(id)          │   require()s main entry, runs activate(ctx)
 *   │  ── deactivate(id)        │   runs subs in reverse, clears require.cache
 *   │  ── reload(id)            │   deactivate → re-scan → activate
 *   │  ── setEnabled / Trusted  │
 *   └──────────────────────────┘
 *
 * Renderer-side has its own host (`src/extensions/host-renderer.ts`); the two
 * communicate over the bus. This main-side host is responsible for:
 *   - reading and validating manifests
 *   - tracking enabled/trusted/state per extension
 *   - running each plugin's main-side `activate()` if it has a `main` entry
 *   - exposing data to the renderer via the IPC bridge
 *
 * The renderer host loads its own renderer entries via the `mt-ext://` protocol
 * (see `mt-ext-protocol.ts`).
 */

interface MainPluginModule {
  activate?: (ctx: unknown) => void | Promise<void>
  deactivate?: () => void | Promise<void>
}

interface ActiveEntry {
  manifest: ExtensionManifest
  ctxDispose: () => Promise<void>
  pluginDeactivate?: () => void | Promise<void>
}

export class ExtensionHostMain {
  readonly registry = new ExtensionRegistry()
  readonly services = new ServiceRegistry()
  private active = new Map<string, ActiveEntry>()
  private requireFn = createRequire(__filename)

  /**
   * Scan extensions/ (built-in) and ~/.mterminal/extensions/ (user). Read
   * manifests, validate, populate the registry. Idempotent: re-running picks
   * up new extensions and updates existing ones.
   */
  async scanAndSync(): Promise<void> {
    await ensureUserDirs()
    const seenIds = new Set<string>()

    const sources: Array<{ dir: string; source: 'built-in' | 'user' }> = [
      { dir: builtInExtensionsDir(), source: 'built-in' },
      { dir: userExtensionsDir(), source: 'user' },
    ]

    for (const { dir, source } of sources) {
      const entries = await listExtensionDirs(dir)
      for (const { id: dirId, path: extPath } of entries) {
        try {
          const manifest = await readManifest(extPath, source)
          // API version compatibility check.
          if (!isApiCompatible(manifest.apiVersionRange)) {
            this.markIncompatible(manifest, extPath)
            continue
          }
          seenIds.add(manifest.id)
          const enabled = await this.computeInitialEnabled(manifest)
          const trusted = source === 'built-in' || (await getTrustStore().isTrusted(manifest.id))
          this.registry.add(manifest, { enabled, trusted })
        } catch (err) {
          if (err instanceof ManifestValidationError) {
            // A directory inside the extensions folder without a package.json
            // is almost always residue from a stale data dir or a partial
            // uninstall. Don't spam the user with warnings — only log if the
            // manifest exists but is malformed.
            if (/cannot read package\.json: ENOENT/.test(err.message)) {
              continue
            }
            console.warn(`[extensions] skipping ${extPath} (${dirId}):`, err.message)
          } else {
            console.error(`[extensions] error reading ${extPath}:`, err)
          }
        }
      }
    }

    // Remove records that no longer exist on disk.
    for (const rec of this.registry.list()) {
      if (!seenIds.has(rec.manifest.id)) {
        await this.deactivate(rec.manifest.id).catch(() => {})
        this.registry.remove(rec.manifest.id)
      }
    }
  }

  /**
   * Activate eligible extensions in topological order (providers before
   * consumers). Skips disabled or untrusted (untrusted activation is the
   * renderer's responsibility — the trust prompt happens before the user
   * sees the panel, so the renderer host calls back here with `forceActivate`).
   */
  async activateAllEligible(): Promise<void> {
    const records = this.registry.list().filter((r) => r.enabled && r.trusted)
    const manifests = records.map((r) => r.manifest)
    const { order, cycles } = topoSortActivation(
      manifests.map((m) => ({
        id: m.id,
        providedServices: m.providedServices,
        consumedServices: m.consumedServices,
      })),
    )
    if (cycles.length) {
      for (const cycle of cycles) {
        getMainEventBus().emit('extension:cycle', { ids: cycle })
        console.warn('[extensions] service dependency cycle:', cycle.join(' → '))
      }
    }
    for (const id of order) {
      try {
        await this.activate(id)
      } catch (err) {
        // Already logged inside activate(); continue with siblings.
        void err
      }
    }
  }

  async activate(id: string): Promise<void> {
    if (this.active.has(id)) return
    const rec = this.registry.get(id)
    if (!rec) throw new Error(`unknown extension: ${id}`)
    if (!rec.enabled) throw new Error(`extension "${id}" is disabled`)
    if (!rec.trusted) throw new Error(`extension "${id}" is not trusted`)

    this.registry.setState(id, 'activating')
    const shadow = getSettingsShadow()

    const { ctx, dispose: ctxDispose } = await createMainCtx({
      manifest: rec.manifest,
      serviceRegistry: this.services,
      readCoreSetting: <T>(key: string) => shadow.get<T>(key),
      onCoreSettingChange: (cb) => ({ dispose: shadow.onCoreChange(cb) }),
      readExtSetting: (extId, key) => shadow.readExt(extId, key),
      readAllExtSettings: (extId) => shadow.readExtAll(extId),
      writeExtSetting: (extId, key, value) => shadow.writeExt(extId, key, value),
      onExtSettingChange: (extId, cb) => ({ dispose: shadow.onExtChange(extId, cb) }),
    })

    let mod: MainPluginModule | null = null
    if (rec.manifest.mainEntry) {
      try {
        // Bust require.cache below the entry path on each load (hot-reload).
        for (const k of Object.keys(this.requireFn.cache)) {
          if (k.startsWith(rec.manifest.extensionPath)) {
            delete this.requireFn.cache[k]
          }
        }
        mod = this.requireFn(rec.manifest.mainEntry) as MainPluginModule
      } catch (err) {
        await ctxDispose()
        this.registry.setError(id, err as Error)
        throw err
      }
    }

    if (mod?.activate) {
      try {
        await mod.activate(ctx)
      } catch (err) {
        await ctxDispose()
        this.registry.setError(id, err as Error)
        throw err
      }
    }

    this.active.set(id, {
      manifest: rec.manifest,
      ctxDispose,
      pluginDeactivate: mod?.deactivate?.bind(mod),
    })
    this.registry.setState(id, 'active')
    getMainEventBus().emit('extension:activated', { id })
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.active.get(id)
    if (!entry) return
    this.registry.setState(id, 'deactivating')
    try {
      if (entry.pluginDeactivate) {
        await entry.pluginDeactivate()
      }
    } catch (err) {
      console.error(`[extensions] deactivate error in ${id}:`, err)
    }
    try {
      await entry.ctxDispose()
    } catch (err) {
      console.error(`[extensions] ctx dispose error in ${id}:`, err)
    }
    // Drop require.cache for this extension's tree so a re-activate gets fresh code.
    for (const k of Object.keys(this.requireFn.cache)) {
      if (k.startsWith(entry.manifest.extensionPath)) {
        delete this.requireFn.cache[k]
      }
    }
    this.active.delete(id)
    if (this.registry.get(id)) {
      this.registry.setState(id, 'installed')
    }
    getMainEventBus().emit('extension:deactivated', { id })
  }

  async reload(id: string): Promise<void> {
    await this.deactivate(id)
    // Re-read manifest in case it changed (hot-reload).
    const rec = this.registry.get(id)
    if (!rec) return
    try {
      const fresh = await readManifest(rec.manifest.extensionPath, rec.manifest.source)
      if (!isApiCompatible(fresh.apiVersionRange)) {
        this.markIncompatible(fresh, rec.manifest.extensionPath)
        return
      }
      this.registry.add(fresh, { enabled: rec.enabled, trusted: rec.trusted })
    } catch (err) {
      this.registry.setError(id, err as Error)
      return
    }
    if (rec.enabled && rec.trusted) {
      await this.activate(id)
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const rec = this.registry.get(id)
    if (!rec) return
    if (rec.enabled === enabled) return
    if (!enabled) await this.deactivate(id)
    this.registry.setEnabled(id, enabled)
    if (enabled && rec.trusted) await this.activate(id)
  }

  async setTrusted(id: string, trusted: boolean): Promise<void> {
    const rec = this.registry.get(id)
    if (!rec) return
    await getTrustStore().setTrusted(id, trusted)
    this.registry.setTrusted(id, trusted)
    if (!trusted) {
      await this.deactivate(id)
    } else if (rec.enabled) {
      await this.activate(id)
    }
  }

  async uninstall(id: string): Promise<void> {
    const rec = this.registry.get(id)
    if (!rec) return
    if (rec.manifest.source === 'built-in') {
      throw new Error(`cannot uninstall built-in extension "${id}" (disable instead)`)
    }
    await this.deactivate(id)
    await fs.rm(rec.manifest.extensionPath, { recursive: true, force: true })
    if (isUnlocked()) {
      try {
        purgeExtSecrets(id)
      } catch (err) {
        console.warn(`[extensions] purgeExtSecrets failed for ${id}:`, err)
      }
    }
    this.registry.remove(id)
  }

  async shutdown(): Promise<void> {
    const ids = Array.from(this.active.keys()).reverse()
    for (const id of ids) {
      await this.deactivate(id)
    }
  }

  private async computeInitialEnabled(manifest: ExtensionManifest): Promise<boolean> {
    // For now: built-ins are enabled by default; user extensions are enabled
    // unless the user has disabled them via Plugin Manager (persistence TBD).
    void manifest
    return true
  }

  private markIncompatible(manifest: ExtensionManifest, extPath: string): void {
    console.warn(
      `[extensions] ${manifest.id} requires mterminal-api ${manifest.apiVersionRange}, host ships ${HOST_API_VERSION}`,
    )
    // Add to registry so PM can show the incompatibility to the user.
    this.registry.add(manifest, { enabled: false, trusted: false })
    this.registry.setError(
      manifest.id,
      new Error(
        `incompatible mterminal-api version (requires ${manifest.apiVersionRange}, host ${HOST_API_VERSION})`,
      ),
    )
    void extPath
  }
}

function isApiCompatible(range: string): boolean {
  if (!range || range === '*') return true
  // The host API version may carry a prerelease tag (e.g. 1.0.0-alpha.0). For
  // compatibility checks we use the base. This matches "engines.vscode" style
  // semantics where prerelease tags don't gate user-facing compatibility.
  const baseHostVersion = HOST_API_VERSION.replace(/-.+$/, '')
  return satisfies(baseHostVersion, range)
}

let hostInstance: ExtensionHostMain | null = null
export function getExtensionHost(): ExtensionHostMain {
  if (!hostInstance) hostInstance = new ExtensionHostMain()
  return hostInstance
}
