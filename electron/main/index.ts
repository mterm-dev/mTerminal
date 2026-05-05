import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  dialog,
  nativeImage,
  Notification,
  type OpenDialogOptions,
} from 'electron'
import path from 'node:path'
import { registerPtyHandlers, setMainWindow as setPtyWindow } from './pty'
import { registerSshHandlers } from './ssh'
import { registerSystemHandlers } from './system'
import { registerVaultHandlers } from './vault'
import { registerHostsHandlers } from './hosts'
import { registerAiHandlers } from './ai'
import { registerClaudeCodeHandlers } from './claude-code'
import { registerMcpHandlers, stopServer as stopMcpServer } from './mcp'

let mainWindow: BrowserWindow | null = null

const appIconPath = path.join(app.getAppPath(), 'build/icon.png')
const appIcon = nativeImage.createFromPath(appIconPath)

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 420,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
  .then(() => {
    registerWindowIpc()
    registerClipboardIpc()
    registerDialogIpc()
    registerNotificationIpc()

    registerPtyHandlers()
    registerSshHandlers()
    registerVaultHandlers()
    registerHostsHandlers()
    registerAiHandlers()
    registerClaudeCodeHandlers()
    registerMcpHandlers()
    app.on('before-quit', () => {
      void stopMcpServer()
    })
    registerSystemHandlers()

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
