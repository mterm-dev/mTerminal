/**
 * Per-extension settings namespace.
 *
 * Settings live under `settings.extensions[<id>]` in the same JSON store as
 * core settings. Read/write goes through the existing `useSettings()` hook
 * via two callbacks the host wires up at boot. Until the renderer host has
 * been initialized those callbacks are no-ops, so plugins should never call
 * `ctx.settings.set` synchronously inside `activate()` — kicking off async
 * work is fine.
 */

import type { Disposable } from './ctx-types'

export interface SettingsBackend {
  /** Read everything under settings.extensions[id]. */
  readAll(extId: string): Record<string, unknown>
  /** Read one key. */
  read(extId: string, key: string): unknown
  /** Write one key (persisted). */
  write(extId: string, key: string, value: unknown): Promise<void>
  /** Subscribe to changes for one extension. */
  onChange(extId: string, cb: (key: string, value: unknown) => void): Disposable
  /** Read a core (non-extension) setting. */
  readCore<T = unknown>(key: string): T | undefined
  /** Subscribe to core setting changes. */
  onCoreChange(cb: (key: string, value: unknown) => void): Disposable
}

let backend: SettingsBackend = createNoopBackend()

export function setSettingsBackend(b: SettingsBackend): void {
  backend = b
}

export function getSettingsBackend(): SettingsBackend {
  return backend
}

function createNoopBackend(): SettingsBackend {
  console.warn(
    '[ext settings] setSettingsBackend() not called yet; reads return undefined and writes are dropped',
  )
  return {
    readAll: () => ({}),
    read: () => undefined,
    write: async () => {
      /* dropped */
    },
    onChange: () => ({ dispose: () => {} }),
    readCore: () => undefined,
    onCoreChange: () => ({ dispose: () => {} }),
  }
}
