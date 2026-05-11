import { app, BrowserWindow, ipcMain, shell } from 'electron'
import {
  autoUpdater,
  type UpdateInfo,
  type ProgressInfo,
} from 'electron-updater'
import { compare, parse, type ParsedVersion } from './extensions/semver-mini'
import { loadSettings } from './settings-store'

type Phase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  phase: Phase
  isFullUpdate: boolean
  version?: string
  releaseNotes?: string
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
  releaseUrl?: string
}

const REPO = { owner: 'arthurr0', repo: 'mTerminal' }

const computeIsFullUpdate = (): boolean =>
  process.platform === 'win32' ||
  (process.platform === 'linux' && !!process.env.APPIMAGE)

let currentState: UpdaterState = {
  phase: 'idle',
  isFullUpdate: computeIsFullUpdate(),
}
let getWindow: () => BrowserWindow | null = () => null

function emit(next: Partial<UpdaterState>): void {
  currentState = { ...currentState, ...next }
  const w = getWindow()
  if (w && !w.isDestroyed()) {
    w.webContents.send('updater:state', currentState)
  }
}

function readBeta(): boolean {
  try {
    const raw = loadSettings()
    if (!raw) return false
    const obj = JSON.parse(raw) as { updaterBetaChannel?: unknown }
    return obj.updaterBetaChannel === true
  } catch {
    return false
  }
}

function configureAutoUpdater(beta: boolean): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = beta
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => emit({ phase: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) =>
    emit({
      phase: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    })
  )
  autoUpdater.on('update-not-available', () => emit({ phase: 'not-available' }))
  autoUpdater.on('download-progress', (p: ProgressInfo) =>
    emit({
      phase: 'downloading',
      progress: {
        percent: p.percent,
        bytesPerSecond: p.bytesPerSecond,
        transferred: p.transferred,
        total: p.total,
      },
    })
  )
  autoUpdater.on('update-downloaded', (info: UpdateInfo) =>
    emit({ phase: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    emit({ phase: 'error', error: err?.message ?? String(err) })
  )
}

interface GitHubRelease {
  tag_name?: string
  html_url?: string
  body?: string
  draft?: boolean
  prerelease?: boolean
}

async function checkNotifyOnly(beta: boolean): Promise<void> {
  emit({ phase: 'checking' })
  try {
    const url = beta
      ? `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases?per_page=10`
      : `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases/latest`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `mTerminal/${app.getVersion()}`,
      },
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}`)
    const data = (await res.json()) as GitHubRelease | GitHubRelease[]
    const releases: GitHubRelease[] = Array.isArray(data) ? data : [data]
    const current = parse(app.getVersion())
    if (!current) {
      emit({ phase: 'not-available' })
      return
    }
    let bestVersion: string | null = null
    let bestParsed: ParsedVersion | null = null
    let bestUrl = ''
    let bestNotes = ''
    for (const r of releases) {
      if (r.draft) continue
      if (r.prerelease && !beta) continue
      const tag = String(r.tag_name ?? '').replace(/^v/, '')
      const v = parse(tag)
      if (!v) continue
      if (compare(v, current) <= 0) continue
      if (!bestParsed || compare(v, bestParsed) > 0) {
        bestVersion = tag
        bestParsed = v
        bestUrl = r.html_url ?? ''
        bestNotes = r.body ?? ''
      }
    }
    if (bestVersion) {
      emit({
        phase: 'available',
        version: bestVersion,
        releaseUrl: bestUrl,
        releaseNotes: bestNotes,
      })
    } else {
      emit({ phase: 'not-available' })
    }
  } catch (err) {
    emit({ phase: 'error', error: (err as Error).message })
  }
}

export function registerUpdaterHandlers(
  windowGetter: () => BrowserWindow | null
): void {
  getWindow = windowGetter
  const full = computeIsFullUpdate()

  ipcMain.handle('updater:get-state', () => currentState)

  ipcMain.handle('updater:set-beta-channel', (_e, enabled: unknown) => {
    const v = enabled === true
    if (full && app.isPackaged) autoUpdater.allowPrerelease = v
    return v
  })

  if (!app.isPackaged) {
    ipcMain.handle('updater:check', () => currentState)
    ipcMain.handle('updater:download', () => currentState)
    ipcMain.handle('updater:install', () => currentState)
    return
  }

  if (full) configureAutoUpdater(readBeta())

  ipcMain.handle('updater:check', async () => {
    const beta = readBeta()
    if (full) {
      autoUpdater.allowPrerelease = beta
      try {
        await autoUpdater.checkForUpdates()
      } catch (err) {
        emit({ phase: 'error', error: (err as Error).message })
      }
    } else {
      await checkNotifyOnly(beta)
    }
    return currentState
  })

  ipcMain.handle('updater:download', async () => {
    if (!full) {
      if (currentState.releaseUrl) {
        await shell.openExternal(currentState.releaseUrl)
      }
      return currentState
    }
    try {
      await autoUpdater.downloadUpdate()
    } catch (err) {
      emit({ phase: 'error', error: (err as Error).message })
    }
    return currentState
  })

  ipcMain.handle('updater:install', () => {
    if (!full || currentState.phase !== 'downloaded') return currentState
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return currentState
  })
}

export async function runStartupCheck(): Promise<void> {
  if (!app.isPackaged) return
  const beta = readBeta()
  if (computeIsFullUpdate()) {
    autoUpdater.allowPrerelease = beta
    try {
      await autoUpdater.checkForUpdates()
    } catch (err) {
      emit({ phase: 'error', error: (err as Error).message })
    }
  } else {
    await checkNotifyOnly(beta)
  }
}
