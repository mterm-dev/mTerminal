import { ipcMain } from 'electron'
import type { ExtensionHostMain } from '../extensions/host'
import { MarketplaceApiClient, getApiClient, MarketplaceHttpError, MarketplaceNetworkError } from './api-client'
import { MarketplaceStore, getMarketplaceStore } from './store'
import { Installer } from './installer'
import { UpdatesManager } from './updates'

export interface MarketplaceModuleHandle {
  api: MarketplaceApiClient
  store: MarketplaceStore
  installer: Installer
  updates: UpdatesManager
  unregister: () => void
}

const CHANNELS = [
  'marketplace:search',
  'marketplace:details',
  'marketplace:install',
  'marketplace:uninstall',
  'marketplace:update',
  'marketplace:check-updates',
  'marketplace:list-installed-with-marketplace-meta',
  'marketplace:rating:submit',
  'marketplace:is-first-run',
  'marketplace:mark-onboarding-done',
  'marketplace:install-recommended',
  'marketplace:get-updates',
  'marketplace:set-endpoint',
  'marketplace:get-endpoint',
] as const

function toErrorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof MarketplaceNetworkError) return { code: 'NETWORK', message: err.message }
  if (err instanceof MarketplaceHttpError) return { code: 'HTTP', message: `${err.status}: ${err.body || err.message}` }
  const e = err as { code?: string; message?: string }
  return { code: e?.code ?? 'UNKNOWN', message: e?.message ?? String(err) }
}

export function registerMarketplaceHandlers(
  getHost: () => ExtensionHostMain,
  opts: { api?: MarketplaceApiClient; store?: MarketplaceStore } = {},
): MarketplaceModuleHandle {
  const api = opts.api ?? getApiClient()
  const store = opts.store ?? getMarketplaceStore()
  const installer = new Installer({ api, store, getHost })
  const updates = new UpdatesManager({ api, store, getHost })

  for (const ch of CHANNELS) {
    try {
      ipcMain.removeHandler(ch)
    } catch {}
  }

  ipcMain.handle('marketplace:search', async (_e, req: unknown) => {
    try {
      return { ok: true, value: await api.search((req ?? {}) as Parameters<MarketplaceApiClient['search']>[0]) }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle('marketplace:details', async (_e, args: { id: string }) => {
    try {
      return { ok: true, value: await api.details(args.id) }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle(
    'marketplace:install',
    async (_e, args: { id: string; version?: string }) => {
      try {
        return { ok: true, value: await installer.install(args.id, args.version) }
      } catch (err) {
        return { ok: false, error: toErrorPayload(err) }
      }
    },
  )

  ipcMain.handle('marketplace:uninstall', async (_e, args: { id: string }) => {
    try {
      await installer.uninstall(args.id)
      return { ok: true, value: { id: args.id } }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle('marketplace:update', async (_e, args: { id: string }) => {
    try {
      return { ok: true, value: await installer.update(args.id) }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle('marketplace:check-updates', async () => {
    try {
      return { ok: true, value: await updates.refresh() }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle('marketplace:get-updates', async () => {
    return { ok: true, value: updates.getPending() }
  })

  ipcMain.handle('marketplace:list-installed-with-marketplace-meta', async () => {
    try {
      const host = getHost()
      const recs = host.registry.list().filter((r) => r.manifest.source === 'user')
      const ids = recs.map((r) => r.manifest.id)
      let metas: Awaited<ReturnType<MarketplaceApiClient['listInstalledMeta']>> = []
      try {
        metas = await api.listInstalledMeta(ids)
      } catch {
        metas = []
      }
      const byId = new Map(metas.map((m) => [m.id, m]))
      const result = recs.map((rec) => ({
        id: rec.manifest.id,
        installedVersion: rec.manifest.version,
        displayName: rec.manifest.displayName ?? rec.manifest.id,
        description: rec.manifest.description ?? '',
        meta: byId.get(rec.manifest.id) ?? null,
        enabled: rec.enabled,
        trusted: rec.trusted,
        state: rec.state,
      }))
      return { ok: true, value: result }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle(
    'marketplace:rating:submit',
    async (
      _e,
      req: { extensionId: string; stars: number; comment?: string },
    ) => {
      try {
        const result = await api.submitRating(req)
        return { ok: true, value: result }
      } catch (err) {
        return { ok: false, error: toErrorPayload(err) }
      }
    },
  )

  ipcMain.handle('marketplace:is-first-run', async () => {
    const cur = await store.load()
    return { ok: true, value: !cur.onboardingDone }
  })

  ipcMain.handle('marketplace:mark-onboarding-done', async () => {
    await store.update({ onboardingDone: true, softOnboardingPending: false })
    return { ok: true, value: true }
  })

  ipcMain.handle('marketplace:set-endpoint', async (_e, args: { url?: string | null }) => {
    try {
      api.setEndpoint(args?.url ?? undefined)
      return { ok: true, value: api.endpoint }
    } catch (err) {
      return { ok: false, error: toErrorPayload(err) }
    }
  })

  ipcMain.handle('marketplace:get-endpoint', async () => {
    return { ok: true, value: api.endpoint }
  })

  ipcMain.handle(
    'marketplace:install-recommended',
    async (_e, args: { ids: string[] }) => {
      const ids = Array.isArray(args?.ids) ? args.ids : []
      const results: Array<{ id: string; ok: boolean; error?: { code: string; message: string } }> = []
      for (const id of ids) {
        try {
          await installer.install(id)
          results.push({ id, ok: true })
        } catch (err) {
          results.push({ id, ok: false, error: toErrorPayload(err) })
        }
      }
      return { ok: true, value: results }
    },
  )

  return {
    api,
    store,
    installer,
    updates,
    unregister: () => {
      for (const ch of CHANNELS) {
        try {
          ipcMain.removeHandler(ch)
        } catch {}
      }
    },
  }
}

export { Installer } from './installer'
export { UpdatesManager, isNewer } from './updates'
export { MarketplaceStore, getMarketplaceStore } from './store'
export { MarketplaceApiClient, getApiClient } from './api-client'
