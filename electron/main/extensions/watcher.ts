import { watch, type FSWatcher } from 'chokidar'
import path from 'node:path'
import { builtInExtensionsDir, userExtensionsDir } from './locations'
import { getExtensionHost } from './host'
import { getMainEventBus } from './event-bus-main'

/**
 * Hot-reload watcher.
 *
 * Watches the user extension folder (~/.mterminal/extensions/) and the
 * built-in extension folder (extensions/, only in development mode) for
 * file changes. On change inside a `<id>/` subdirectory:
 *   - debounce 200ms per id
 *   - call host.reload(id), which deactivates → re-reads manifest → reactivates
 *   - emit `extension:reloaded` so the renderer can refresh its snapshots
 *
 * Disabled by default in production builds; enabled in dev. The Plugin
 * Manager can override this via the `extensions.hotReload` core setting
 * (TODO: wire up the toggle).
 */

interface WatcherDeps {
  /** Set to true in development mode. */
  enabled: boolean
}

let watcherInstance: FSWatcher | null = null
const debounceTimers = new Map<string, NodeJS.Timeout>()

export function startWatcher({ enabled }: WatcherDeps): void {
  if (!enabled) return
  if (watcherInstance) return

  const builtIn = builtInExtensionsDir()
  const watchPaths = builtIn ? [userExtensionsDir(), builtIn] : [userExtensionsDir()]
  watcherInstance = watch(watchPaths, {
    ignored: [
      /(^|[\\/])\../, // dotfiles
      /node_modules/,
      /\.git\b/,
      /__tests__/,
    ],
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    depth: 6,
  })

  watcherInstance.on('all', (_event, fullPath) => {
    const id = extractExtensionId(fullPath)
    if (!id) return
    schedule(id)
  })

  watcherInstance.on('error', (err) => {
    console.warn('[ext watcher] error:', err)
  })
}

export async function stopWatcher(): Promise<void> {
  if (!watcherInstance) return
  for (const t of debounceTimers.values()) clearTimeout(t)
  debounceTimers.clear()
  await watcherInstance.close()
  watcherInstance = null
}

function schedule(id: string): void {
  const existing = debounceTimers.get(id)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    debounceTimers.delete(id)
    void doReload(id)
  }, 200)
  debounceTimers.set(id, timer)
}

async function doReload(id: string): Promise<void> {
  console.log(`[ext watcher] reloading "${id}"`)
  try {
    await getExtensionHost().reload(id)
    getMainEventBus().emit('extension:reloaded', { id })
  } catch (err) {
    console.error(`[ext watcher] reload("${id}") failed:`, err)
  }
}

function extractExtensionId(fullPath: string): string | null {
  // The watcher's roots are the two extension dirs. The first path component
  // immediately under either root is the extension id.
  const builtIn = builtInExtensionsDir()
  const candidates = builtIn ? [userExtensionsDir(), builtIn] : [userExtensionsDir()]
  for (const root of candidates) {
    const rel = path.relative(root, fullPath)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
    const first = rel.split(path.sep)[0]
    if (first && first !== '..' && !first.startsWith('.')) return first
  }
  return null
}
