import type { Disposable } from './ctx-types'
import { onCoreChange as busOnCoreChange, onExtChange as busOnExtChange } from '../settings/event-bus'

export interface SettingsBackend {
  readAll(extId: string): Record<string, unknown>
  read(extId: string, key: string): unknown
  write(extId: string, key: string, value: unknown): Promise<void>
  onChange(extId: string, cb: (key: string, value: unknown) => void): Disposable
  readCore<T = unknown>(key: string): T | undefined
  onCoreChange(cb: (key: string, value: unknown) => void): Disposable
}

let backend: SettingsBackend = createDefaultBackend()

export function setSettingsBackend(b: SettingsBackend): void {
  backend = b
}

export function getSettingsBackend(): SettingsBackend {
  return backend
}

function createDefaultBackend(): SettingsBackend {
  return {
    readAll: () => ({}),
    read: () => undefined,
    write: async () => {},
    onChange: (extId, cb) => ({ dispose: busOnExtChange(extId, cb) }),
    readCore: () => undefined,
    onCoreChange: (cb) => ({ dispose: busOnCoreChange(cb) }),
  }
}
