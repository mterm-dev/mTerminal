import { app, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export function loadJsonFile(file: string): string | null {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (typeof raw === 'string' && raw.length > 0) return raw
    return null
  } catch {
    return null
  }
}

export function saveJsonFileAtomic(file: string, json: string): void {
  if (typeof json !== 'string') return
  const dir = path.dirname(file)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  try {
    fs.chmodSync(file, 0o600)
  } catch {}
}

export interface JsonStore {
  load: () => string | null
  save: (json: string) => void
  setFilePathForTests: (p: string | null) => void
  registerHandlers: () => void
}

export function createJsonStore(channel: string, fileName: string): JsonStore {
  let cachedFilePath: string | null = null
  const filePath = (): string => {
    if (cachedFilePath) return cachedFilePath
    cachedFilePath = path.join(app.getPath('userData'), fileName)
    return cachedFilePath
  }
  const load = (): string | null => loadJsonFile(filePath())
  const save = (json: string): void => saveJsonFileAtomic(filePath(), json)
  return {
    load,
    save,
    setFilePathForTests: (p) => {
      cachedFilePath = p
    },
    registerHandlers: () => {
      ipcMain.on(`${channel}:load:sync`, (e) => {
        e.returnValue = load()
      })
      ipcMain.handle(`${channel}:save`, (_e, json: string) => {
        save(json)
      })
    },
  }
}
