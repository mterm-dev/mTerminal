import fs from 'node:fs/promises'
import path from 'node:path'
import { validateManifest } from '@mterminal/manifest-validator'
import type { ExtensionHostMain } from '../extensions/host'
import { getTrustStore } from '../extensions/trust'
import { userExtensionsDir, extensionDir } from '../extensions/locations'
import { getMainEventBus } from '../extensions/event-bus-main'
import { MarketplaceApiClient, MarketplaceNetworkError } from './api-client'
import { MarketplaceStore } from './store'
import { verifyPackage } from './verifier'

const NATIVE_DEPENDENCY_HINTS = new Set([
  'node-gyp-build',
  'bindings',
  'node-pty',
  'better-sqlite3',
  'keytar',
  'nan',
  'node-addon-api',
])

export function detectNativeDeps(
  entries: Record<string, Buffer | Uint8Array>,
  manifest: unknown,
): boolean {
  for (const entryPath of Object.keys(entries)) {
    const normalized = entryPath.replace(/\\/g, '/')
    if (normalized === 'binding.gyp' || normalized.endsWith('/binding.gyp')) return true
    if (normalized.endsWith('.node')) return true
  }
  if (!manifest || typeof manifest !== 'object') return false
  const m = manifest as {
    dependencies?: Record<string, unknown>
    mterminal?: { requiresRestart?: unknown }
  }
  if (m.mterminal && m.mterminal.requiresRestart === true) return true
  if (m.dependencies) {
    for (const dep of Object.keys(m.dependencies)) {
      if (NATIVE_DEPENDENCY_HINTS.has(dep)) return true
    }
  }
  return false
}

export interface InstallProgressEvent {
  kind: 'fetching' | 'verifying' | 'extracting' | 'activating' | 'done'
  id: string
  version?: string
}

export interface InstallOptions {
  onProgress?: (ev: InstallProgressEvent) => void
}

export class InstallError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'InstallError'
  }
}

export interface InstallerDeps {
  api: MarketplaceApiClient
  store: MarketplaceStore
  getHost: () => ExtensionHostMain
}

export class Installer {
  constructor(private deps: InstallerDeps) {}

  async install(id: string, version?: string, opts: InstallOptions = {}): Promise<{ id: string; version: string }> {
    const { api, store, getHost } = this.deps
    let resolvedVersion = version

    if (!resolvedVersion) {
      const detail = await api.details(id)
      resolvedVersion = detail.latestVersion
    }

    opts.onProgress?.({ kind: 'fetching', id, version: resolvedVersion })

    const dl = await api.downloadVersionInfo(id, resolvedVersion)
    const buf = await api.fetchPackage(dl.url)

    let pubkey = await store.getAuthorKey(dl.keyId)
    if (!pubkey) {
      try {
        const info = await api.getPublicKey(dl.keyId)
        if (info.revokedAt) {
          throw new InstallError('key-revoked', `signing key ${dl.keyId} is revoked`)
        }
        pubkey = info.pubkeyB64
        await store.setAuthorKey(dl.keyId, pubkey)
      } catch (err) {
        if (err instanceof InstallError) throw err
        if (err instanceof MarketplaceNetworkError) throw err
        throw new InstallError('unknown-key', `cannot fetch public key ${dl.keyId}: ${(err as Error).message}`)
      }
    }

    opts.onProgress?.({ kind: 'verifying', id, version: resolvedVersion })

    const verified = await verifyPackage(buf, dl.signatureB64, pubkey, { expectedSha256Hex: dl.sha256 })
    if (!verified.ok) {
      throw new InstallError('verify', `package failed verification: ${verified.reason}`)
    }
    if (!verified.manifestRaw) {
      throw new InstallError('manifest', 'package missing package.json')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(verified.manifestRaw)
    } catch (err) {
      throw new InstallError('manifest', `package.json is not valid JSON: ${(err as Error).message}`)
    }
    const validation = validateManifest(parsed)
    if (!validation.ok) {
      throw new InstallError('manifest', `manifest invalid: ${validation.errors.join(', ')}`)
    }
    if (validation.manifest.id !== id) {
      throw new InstallError('manifest', `manifest id "${validation.manifest.id}" does not match requested "${id}"`)
    }

    opts.onProgress?.({ kind: 'extracting', id, version: resolvedVersion })

    const target = extensionDir('user', id)
    await fs.mkdir(userExtensionsDir(), { recursive: true })
    const stagingDir = `${target}.installing-${Date.now()}`

    try {
      await getHost().deactivate(id)
    } catch (err) {
      console.warn(`[marketplace] pre-install deactivate ${id} failed:`, err)
    }

    try {
      await fs.mkdir(stagingDir, { recursive: true })
      for (const [entryPath, data] of Object.entries(verified.entries)) {
        if (entryPath === 'signature.sig') continue
        const dest = path.join(stagingDir, entryPath)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, data)
      }
      try {
        await fs.rm(target, { recursive: true, force: true })
      } catch {}
      await fs.rename(stagingDir, target)
    } catch (err) {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
      throw new InstallError('extract', `failed to write extension: ${(err as Error).message}`)
    }

    await store.setInstallRecord(id, { installedAt: Date.now(), version: resolvedVersion })

    opts.onProgress?.({ kind: 'activating', id, version: resolvedVersion })

    try {
      await getTrustStore().setTrusted(id, true)
      const host = getHost()
      await host.scanAndSync()
      await host.setTrusted(id, true)
      try {
        await host.reload(id)
      } catch (err) {
        console.warn(`[marketplace] reload ${id} failed:`, err)
      }
    } catch (err) {
      console.warn(`[marketplace] post-install host wiring for ${id} failed:`, err)
    }

    if (detectNativeDeps(verified.entries, parsed)) {
      getMainEventBus().emit('extension:restart-required', { id, version: resolvedVersion })
    }

    opts.onProgress?.({ kind: 'done', id, version: resolvedVersion })
    return { id, version: resolvedVersion }
  }

  async uninstall(id: string): Promise<void> {
    const { store, getHost } = this.deps
    const host = getHost()
    try {
      await host.uninstall(id)
    } catch (err) {
      const target = extensionDir('user', id)
      await fs.rm(target, { recursive: true, force: true }).catch(() => {})
      void err
    }
    await store.removeInstallRecord(id)
  }

  async update(id: string, opts: InstallOptions = {}): Promise<{ id: string; version: string }> {
    return this.install(id, undefined, opts)
  }
}
