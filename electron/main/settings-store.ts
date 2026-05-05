import { app, ipcMain } from 'electron'
import path from 'node:path'
import { loadJsonFile, saveJsonFileAtomic } from './json-store'

let cachedFilePath: string | null = null

function settingsFilePath(): string {
  if (cachedFilePath) return cachedFilePath
  cachedFilePath = path.join(app.getPath('userData'), 'settings.json')
  return cachedFilePath
}

export function setSettingsFilePathForTests(p: string | null): void {
  cachedFilePath = p
}

export function loadSettings(): string | null {
  return loadJsonFile(settingsFilePath())
}

export function saveSettings(json: string): void {
  saveJsonFileAtomic(settingsFilePath(), json)
}

export function registerSettingsHandlers(): void {
  ipcMain.on('settings:load:sync', (e) => {
    e.returnValue = loadSettings()
  })
  ipcMain.handle('settings:save', (_e, json: string) => {
    saveSettings(json)
  })
}
