import { getExtensionHost } from './host'
import { registerExtensionsBridge } from './ipc-bridge'
import { registerEventBusIpc } from './event-bus-main'
import { getSettingsShadow } from './settings-shadow'
import { registerMtExtProtocol } from './mt-ext-protocol'
import { startWatcher, stopWatcher } from './watcher'
import { migrateLegacySettings } from './migrations'

export { getExtensionHost } from './host'
export { HOST_API_VERSION } from './api-version'
export { stopWatcher } from './watcher'
export { migrateLegacySettings } from './migrations'

/**
 * Wire up the main-process extension host. Call once after `app.whenReady()`,
 * but before the first BrowserWindow is created (so the `mt-ext://` protocol
 * is registered before any renderer starts loading plugin code).
 *
 * `registerMtExtProtocolPrivileges()` MUST be called BEFORE `app.whenReady()`.
 */
export async function registerExtensionsHost(): Promise<void> {
  registerEventBusIpc()
  registerMtExtProtocol()

  // One-shot migration of legacy git settings into extensions['git-panel'].
  // Runs before settings-shadow loads so the migrated values are present
  // when extensions activate. Non-fatal on error.
  try {
    const result = await migrateLegacySettings()
    if (result.performed) {
      console.log(
        `[extensions] migrated ${result.copiedKeys.length} legacy git settings; backup at ${result.backupPath}`,
      )
    }
  } catch (err) {
    console.error('[extensions] settings migration failed:', err)
  }

  getSettingsShadow().init()

  const host = getExtensionHost()
  registerExtensionsBridge({ registry: host.registry, host })

  await host.scanAndSync()
  await host.activateAllEligible()

  // Start the hot-reload watcher in development. The check is intentionally
  // permissive — `ELECTRON_RENDERER_URL` is set by `electron-vite dev`.
  const isDev = !!process.env.ELECTRON_RENDERER_URL || process.env.NODE_ENV === 'development'
  if (isDev) {
    startWatcher({ enabled: true })
  }
  void stopWatcher // keep the export reachable
}

export { registerMtExtProtocolPrivileges } from './mt-ext-protocol'
