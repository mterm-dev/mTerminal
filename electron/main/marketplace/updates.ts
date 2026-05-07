import { compare, parse } from '../extensions/semver-mini'
import type { ExtensionHostMain } from '../extensions/host'
import type { MarketplaceApiClient } from './api-client'
import type { MarketplaceStore } from './store'

export interface UpdateInfo {
  id: string
  installedVersion: string
  latestVersion: string
  displayName: string
  description: string
}

export interface UpdatesDeps {
  api: MarketplaceApiClient
  store: MarketplaceStore
  getHost: () => ExtensionHostMain
}

export function isNewer(installed: string, latest: string): boolean {
  const a = parse(installed)
  const b = parse(latest)
  if (!a || !b) return false
  return compare(b, a) > 0
}

export class UpdatesManager {
  private pending: UpdateInfo[] = []

  constructor(private deps: UpdatesDeps) {}

  getPending(): UpdateInfo[] {
    return [...this.pending]
  }

  async refresh(): Promise<UpdateInfo[]> {
    const { api, store, getHost } = this.deps
    const host = getHost()
    const installed = host.registry.list().filter((rec) => rec.manifest.source === 'user')
    const ids = installed.map((rec) => rec.manifest.id)
    if (ids.length === 0) {
      this.pending = []
      await store.update({ lastUpdateCheck: Date.now() })
      return this.pending
    }

    let summaries: Awaited<ReturnType<MarketplaceApiClient['listInstalledMeta']>> = []
    try {
      summaries = await api.listInstalledMeta(ids)
    } catch {
      summaries = []
    }

    const byId = new Map(summaries.map((s) => [s.id, s]))
    const out: UpdateInfo[] = []
    for (const rec of installed) {
      const meta = byId.get(rec.manifest.id)
      if (!meta) continue
      if (isNewer(rec.manifest.version, meta.latestVersion)) {
        out.push({
          id: rec.manifest.id,
          installedVersion: rec.manifest.version,
          latestVersion: meta.latestVersion,
          displayName: meta.displayName,
          description: meta.description,
        })
      }
    }

    this.pending = out
    await store.update({ lastUpdateCheck: Date.now() })
    return [...out]
  }
}
