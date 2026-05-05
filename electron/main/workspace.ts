import { app, ipcMain } from 'electron'
import path from 'node:path'
import { loadJsonFile, saveJsonFileAtomic } from './json-store'

let cachedFilePath: string | null = null

function workspaceFilePath(): string {
  if (cachedFilePath) return cachedFilePath
  cachedFilePath = path.join(app.getPath('userData'), 'workspace.json')
  return cachedFilePath
}

export function setWorkspaceFilePathForTests(p: string | null): void {
  cachedFilePath = p
}

export function loadWorkspace(): string | null {
  return loadJsonFile(workspaceFilePath())
}

export function saveWorkspace(json: string): void {
  saveJsonFileAtomic(workspaceFilePath(), json)
}

export function registerWorkspaceHandlers(): void {
  ipcMain.on('workspace:load:sync', (e) => {
    e.returnValue = loadWorkspace()
  })
  ipcMain.handle('workspace:save', (_e, json: string) => {
    saveWorkspace(json)
  })
}
