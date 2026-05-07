/**
 * App-level event catalog. Plugins may listen on any of these via `ctx.events.on(...)`.
 * Plugins MAY NOT emit events under the `app:` namespace — those are owned by the host.
 *
 * Plugin-emitted events are auto-prefixed with `<extId>:`. To listen to another
 * plugin's events, use the full namespaced name: `ctx.events.on('git-panel:refresh', ...)`.
 */

export interface AppEventMap {
  /** Fired once after the renderer host has finished bootstrapping. */
  'app:ready': { version: string }

  /** Fired when a new terminal (PTY-backed or otherwise) is created. */
  'app:terminal:created': {
    tabId: number
    ptyId: number
    kind: 'local' | 'remote'
  }

  /**
   * Fired for each output chunk. Throttled to ~30Hz, batched on `\n` boundaries.
   * Subscribing to this event triggers `onEvent:app:terminal:output` activation.
   */
  'app:terminal:output': {
    tabId: number
    ptyId: number
    chunk: string
  }

  'app:terminal:exit': {
    tabId: number
    ptyId: number
    code?: number
  }

  'app:tab:created': { tab: TabSummary }
  'app:tab:closed': { tabId: number }
  'app:tab:focused': { tabId: number; prevTabId: number | null }

  'app:settings:changed': { key: string; value: unknown }
  'app:theme:changed': { themeId: string }
  'app:cwd:changed': { tabId: number; cwd: string }

  'app:ai:provider:registered': { id: string }
  'app:git:commit:created': { cwd: string; sha: string }
}

export interface TabSummary {
  id: number
  type: string
  title: string
  groupId: string | null
  active: boolean
}

/**
 * Module augmentation hook: plugins or core code can extend this map to
 * type-check custom events.
 *
 * @example
 * declare module '@mterminal/extension-api/events' {
 *   interface PluginEventMap {
 *     'git-panel:status-changed': { cwd: string; dirty: boolean }
 *   }
 * }
 */
export interface PluginEventMap {}

export type AnyEventMap = AppEventMap & PluginEventMap
export type EventName = keyof AnyEventMap | (string & {})
