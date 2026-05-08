import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  dialog,
  nativeImage,
  Notification,
  shell,
  type OpenDialogOptions,
} from 'electron'
import path from 'node:path'
import { registerPtyHandlers, setMainWindow as setPtyWindow } from './pty'
import { registerSystemHandlers } from './system'
import { registerVaultHandlers } from './vault'
import { registerAiHandlers } from './ai'
import { agentBridge } from './agents/bridge-server'
import { registerStatusTracker } from './agents/status-tracker'
import {
  refreshAgentInstalls,
  registerHooksInstallerHandlers,
} from './agents/hooks-installer'
import {
  startProcessWatcher,
  stopProcessWatcher,
} from './agents/process-watcher'
import { registerMcpHandlers, stopServer as stopMcpServer } from './mcp'
import { setupAppMenu } from './menu'
import { registerWorkspaceHandlers } from './workspace'
import { registerSettingsHandlers } from './settings-store'
import { registerGitHandlers } from './git'
import { registerVoiceHandlers } from './voice'
import {
  getExtensionHost,
  registerExtensionsHost,
  registerMtExtProtocolPrivileges,
} from './extensions'
import { registerMarketplaceHandlers } from './marketplace'
import { runOneShotMarketplaceMigrations } from './extensions/migrations-marketplace'
import { attachExternalLinkHandlers, isExternalUrl } from './external-links'

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-features', 'WaylandWpColorManagerV1')
}

if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'mterminal-dev'))
}

// Custom URL scheme privileges MUST be registered before app.whenReady().
registerMtExtProtocolPrivileges()

let mainWindow: BrowserWindow | null = null

const appIconPath = path.join(app.getAppPath(), 'build/icon.png')
const appIcon = nativeImage.createFromPath(appIconPath)

const createWindow = (): BrowserWindow => {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 420,
    frame: isMac ? undefined : false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    transparent: !isMac,
    backgroundColor: isMac ? '#1a1a1a' : '#00000000',
    hasShadow: true,
    show: false,
    icon: appIcon.isEmpty() ? undefined : appIcon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow = win

  attachExternalLinkHandlers(win)

  win.once('ready-to-show', () => win.show())
  win.on('maximize', () => win.webContents.send('window:maximized-changed', true))
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL).catch((err) => {
      console.error('[main] loadURL failed:', err)
    })
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html')).catch((err) => {
      console.error('[main] loadFile failed:', err)
    })
  }

  return win
}

app
  .whenReady()
  .then(async () => {
    setupAppMenu()
    registerWindowIpc()
    registerClipboardIpc()
    registerDialogIpc()
    registerNotificationIpc()
    registerShellIpc()

    registerPtyHandlers()
    registerVaultHandlers()
    registerAiHandlers(() => mainWindow)
    try {
      agentBridge.start()
    } catch (err) {
      console.error('[main] agent bridge start failed:', err)
    }
    registerStatusTracker(() => mainWindow)
    registerHooksInstallerHandlers()
    // Re-stamp existing Claude/Codex installs with the live bridge path +
    // resource paths (dev vs packaged). No-op if user never clicked install.
    refreshAgentInstalls()
    // Process-tree watcher catches Codex sessions (no hook system) and acts
    // as a fallback for Claude when hooks aren't installed.
    startProcessWatcher()
    registerMcpHandlers()
    registerWorkspaceHandlers()
    registerSettingsHandlers()
    registerGitHandlers()
    registerVoiceHandlers()
    app.on('before-quit', () => {
      void stopMcpServer()
      try {
        stopProcessWatcher()
        agentBridge.stop()
      } catch {
        /* ignore */
      }
      void getExtensionHost().shutdown()
    })
    registerSystemHandlers()

    // Spin up the extension system. Manifest scan + activation happen here
    // so plugin contributions are visible by the time the renderer asks for
    // them via `ext:list-manifests`.
    await registerExtensionsHost()

    const marketplace = registerMarketplaceHandlers(getExtensionHost)

    void runOneShotMarketplaceMigrations({
      installer: marketplace.installer,
      store: marketplace.store,
      currentAppVersion: app.getVersion(),
    }).catch((err) => {
      console.warn('[marketplace] migrations failed:', err)
    })

    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
    void marketplace.store.load().then((state) => {
      const last = state.lastUpdateCheck ?? 0
      if (Date.now() - last > TWENTY_FOUR_HOURS_MS) {
        setImmediate(() => {
          marketplace.updates.refresh().catch((err) => {
            console.warn('[marketplace] auto update check failed:', err)
          })
        })
      }
    })

    const win = createWindow()
    setPtyWindow(win)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createWindow()
        setPtyWindow(w)
      }
    })
  })
  .catch((err) => {
    console.error('[main] startup failed:', err)
    app.exit(1)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerWindowIpc(): void {
  const focused = (): BrowserWindow | null =>
    BrowserWindow.getFocusedWindow() ?? mainWindow

  ipcMain.handle('window:minimize', () => {
    focused()?.minimize()
  })

  ipcMain.handle('window:maximize-toggle', () => {
    const w = focused()
    if (!w) return false
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
    return w.isMaximized()
  })

  ipcMain.handle('window:close', () => {
    focused()?.close()
  })

  ipcMain.handle('window:is-maximized', () => focused()?.isMaximized() ?? false)
}

function registerClipboardIpc(): void {
  ipcMain.handle('clipboard:read', () => clipboard.readText())
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''))
  })
}

function registerDialogIpc(): void {
  ipcMain.handle('dialog:open', async (_e, opts?: OpenDialogOptions) => {
    const w = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = w
      ? await dialog.showOpenDialog(w, opts ?? {})
      : await dialog.showOpenDialog(opts ?? {})
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })
}

function registerNotificationIpc(): void {
  ipcMain.handle(
    'notification:send',
    (_e, opts: { title: string; body?: string }) => {
      if (!Notification.isSupported()) return false
      const n = new Notification({ title: opts.title, body: opts.body ?? '' })
      n.show()
      return true
    }
  )
  ipcMain.handle('notification:permission', () => 'granted' as const)
}

function registerShellIpc(): void {
  ipcMain.handle('shell:open-external', async (_e, url: unknown) => {
    if (!isExternalUrl(url)) return false
    await shell.openExternal(url as string)
    return true
  })
}
