import { ipcMain, BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { dispatchExtensionInvoke } from './ctx'
import type { ExtensionRegistry } from './registry'
import type { ExtensionHostMain } from './host'
import {
  secretsDelete,
  secretsGet,
  secretsHas,
  secretsKeys,
  secretsOnChange,
  secretsSet,
} from './secrets-store'
import {
  clearExtSecret,
  getExtSecret,
  listExtSecretKeys,
  setExtSecret,
} from '../vault'

const REGISTERED_FLAG = Symbol.for('mTerminal.extensionBridge.registered')

/**
 * IPC bridge for the extension system.
 *
 * Channels owned here:
 *   - ext:invoke              call extension main-side handler: { extId, channel, args }
 *   - ext:list-manifests      registry snapshot for the renderer
 *   - ext:enable / ext:disable
 *   - ext:trust:set
 *   - ext:reload              reload one extension by id (hot-reload trigger)
 *   - ext:install             install from npm/url/folder (TODO: implemented in installer.ts)
 *   - ext:uninstall
 *
 * Bus channels (`ext:bus:emit`, `ext:bus`) are owned by event-bus-main.ts.
 */

export interface BridgeDeps {
  registry: ExtensionRegistry
  host: ExtensionHostMain
}

export function registerExtensionsBridge(deps: BridgeDeps): void {
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[REGISTERED_FLAG]) return
  g[REGISTERED_FLAG] = true

  const { registry, host } = deps

  ipcMain.handle(
    'ext:invoke',
    async (e: IpcMainInvokeEvent, payload: { extId: string; channel: string; args: unknown }) => {
      if (!payload || typeof payload.extId !== 'string' || typeof payload.channel !== 'string') {
        throw new Error('ext:invoke requires { extId, channel, args }')
      }
      return dispatchExtensionInvoke(payload.extId, payload.channel, payload.args, e.sender)
    },
  )

  ipcMain.handle('ext:list-manifests', () => {
    return registry.list().map((rec) => ({
      manifest: serializeManifest(rec.manifest),
      state: rec.state,
      enabled: rec.enabled,
      trusted: rec.trusted,
      lastError: rec.lastError,
      activatedAt: rec.activatedAt,
    }))
  })

  ipcMain.handle('ext:enable', async (_e, id: string) => {
    await host.setEnabled(id, true)
    return true
  })

  ipcMain.handle('ext:disable', async (_e, id: string) => {
    await host.setEnabled(id, false)
    return true
  })

  ipcMain.handle('ext:trust:set', async (_e, payload: { id: string; trusted: boolean }) => {
    await host.setTrusted(payload.id, payload.trusted)
    return true
  })

  ipcMain.handle('ext:reload', async (_e, id: string) => {
    await host.reload(id)
    return true
  })

  ipcMain.handle('ext:install', async (_e, _payload: { source: 'npm' | 'url' | 'folder'; ref: string }) => {
    // Placeholder until installer.ts lands. For now, the renderer can manually
    // copy folders into ~/.mterminal/extensions/ and call ext:reload-all.
    throw new Error('ext:install not yet implemented')
  })

  ipcMain.handle('ext:uninstall', async (_e, id: string) => {
    await host.uninstall(id)
    return true
  })

  ipcMain.handle('ext:reload-all', async () => {
    await host.scanAndSync()
    return true
  })

  ipcMain.handle(
    'ext:report-load-error',
    async (_e, payload: { id: string; message: string; stack?: string }) => {
      if (!payload || typeof payload.id !== 'string' || typeof payload.message !== 'string') {
        throw new Error('ext:report-load-error requires { id, message }')
      }
      const rec = registry.get(payload.id)
      if (!rec) return { ok: true }
      const err = new Error(payload.message)
      if (typeof payload.stack === 'string') {
        Object.assign(err, { stack: payload.stack })
      }
      registry.setError(payload.id, err)
      return { ok: true }
    },
  )

  ipcMain.handle('ext:secrets:get', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    return secretsGet(payload.extId, payload.key)
  })

  ipcMain.handle('ext:secrets:set', async (_e, payload: { extId: string; key: string; value: string }) => {
    requireSecretArgs(payload)
    if (typeof payload.value !== 'string') {
      throw new Error('ext:secrets:set requires a string value')
    }
    await secretsSet(payload.extId, payload.key, payload.value)
    broadcast(payload.extId, payload.key, true)
    return true
  })

  ipcMain.handle('ext:secrets:delete', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    await secretsDelete(payload.extId, payload.key)
    broadcast(payload.extId, payload.key, false)
    return true
  })

  ipcMain.handle('ext:secrets:has', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    return secretsHas(payload.extId, payload.key)
  })

  ipcMain.handle('ext:secrets:keys', async (_e, payload: { extId: string }) => {
    if (!payload || typeof payload.extId !== 'string') {
      throw new Error('ext:secrets:keys requires { extId }')
    }
    return secretsKeys(payload.extId)
  })

  // Forward in-process changes (e.g. one renderer setting a key) to all
  // renderer windows so other windows / settings forms can refresh.
  void secretsOnChange

  ipcMain.handle('ext:vault:get', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    return getExtSecret(payload.extId, payload.key)
  })

  ipcMain.handle('ext:vault:set', async (_e, payload: { extId: string; key: string; value: string }) => {
    requireSecretArgs(payload)
    if (typeof payload.value !== 'string') {
      throw new Error('ext:vault:set requires a string value')
    }
    setExtSecret(payload.extId, payload.key, payload.value)
    broadcastVault(payload.extId, payload.key, true)
    return true
  })

  ipcMain.handle('ext:vault:delete', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    clearExtSecret(payload.extId, payload.key)
    broadcastVault(payload.extId, payload.key, false)
    return true
  })

  ipcMain.handle('ext:vault:has', async (_e, payload: { extId: string; key: string }) => {
    requireSecretArgs(payload)
    return getExtSecret(payload.extId, payload.key) !== null
  })

  ipcMain.handle('ext:vault:keys', async (_e, payload: { extId: string }) => {
    if (!payload || typeof payload.extId !== 'string') {
      throw new Error('ext:vault:keys requires { extId }')
    }
    return listExtSecretKeys(payload.extId)
  })
}

function requireSecretArgs(payload: { extId?: unknown; key?: unknown }): asserts payload is {
  extId: string
  key: string
} {
  if (
    !payload ||
    typeof (payload as { extId?: unknown }).extId !== 'string' ||
    typeof (payload as { key?: unknown }).key !== 'string'
  ) {
    throw new Error('ext:secrets requires { extId, key }')
  }
}

function broadcast(extId: string, key: string, present: boolean): void {
  const env = { event: `ext:secrets:changed:${extId}`, payload: { key, present }, origin: 'm' }
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    w.webContents.send('ext:bus', env)
  }
}

function broadcastVault(extId: string, key: string, present: boolean): void {
  const env = { event: `ext:vault:changed:${extId}`, payload: { key, present }, origin: 'm' }
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    w.webContents.send('ext:bus', env)
  }
}

function serializeManifest(m: import('./manifest').ExtensionManifest): unknown {
  // Strip non-serializable fields. The struct is already pure JSON; just clone.
  return JSON.parse(JSON.stringify(m))
}
