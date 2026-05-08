import { shell, type BrowserWindow } from 'electron'

const EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'ftp:',
  'ftps:',
  'sftp:',
])

export function isExternalUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return EXTERNAL_PROTOCOLS.has(parsed.protocol)
}

export function attachExternalLinkHandlers(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
}
