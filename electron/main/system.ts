import { ipcMain } from 'electron'
import os from 'node:os'
import fs from 'node:fs'

function detectUser(): string {
  try {
    const u = os.userInfo().username
    if (u) return u
  } catch {}
  return (
    process.env.USER ||
    process.env.LOGNAME ||
    process.env.USERNAME ||
    'user'
  )
}

function detectHost(): string {
  let h = ''
  try {
    h = os.hostname()
  } catch {
    h = ''
  }
  if (h) return h
  if (process.platform === 'linux') {
    try {
      const txt = fs.readFileSync('/etc/hostname', 'utf8').trim()
      if (txt) return txt
    } catch {}
  }
  return process.env.COMPUTERNAME || process.env.HOSTNAME || 'host'
}

function detectHome(): string {
  try {
    const h = os.homedir()
    if (h) return h
  } catch {}
  return (
    process.env.HOME ||
    process.env.USERPROFILE ||
    process.env.HOMEPATH ||
    ''
  )
}

export function registerSystemHandlers(): void {
  ipcMain.handle('system:info', () => ({
    user: detectUser(),
    host: detectHost(),
    home: detectHome(),
    platform: process.platform,
  }))
  ipcMain.handle('system:platform', () => process.platform)
}
