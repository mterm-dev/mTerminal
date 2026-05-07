import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

function sendMenuEvent(action: string): void {
  const w = BrowserWindow.getFocusedWindow()
  if (w) w.webContents.send('app:menu', action)
}

export function setupAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      role: 'fileMenu',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendMenuEvent('new-tab'),
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendMenuEvent('close-tab'),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'mTerminal on GitHub',
          click: async () => {
            const { shell } = await import('electron')
            await shell.openExternal('https://github.com/arthurr0/mTerminal')
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
