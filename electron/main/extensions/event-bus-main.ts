import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { EventEmitter } from 'node:events'

/**
 * Cross-process event bus for the extension system.
 *
 * Architecture:
 *   - main side (this file) holds the canonical EventEmitter
 *   - emitting in main: local listeners run + fan-out to all renderers via
 *     `ext:bus` IPC
 *   - renderer side (`src/extensions/event-bus.ts`) emits via
 *     `ipcRenderer.invoke('ext:bus:emit', { event, payload, origin })` which
 *     reaches `handleRendererEmit()` here, which re-broadcasts to the other
 *     renderers AND fires the local main-side emitter — both sides see all events.
 *
 * `origin` carries the originating process tag to prevent loops:
 *   - main      → emitted by main; renderers should accept
 *   - r:<id>    → emitted by renderer #<id>; that renderer should NOT receive its own echo
 *
 * Throttling: throttle is applied per event-name in `emit(throttle:)`. Useful
 * for `app:terminal:output` where high-frequency calls would saturate IPC.
 */

export type EventOrigin = 'main' | `r:${number}`

export interface BusEnvelope {
  event: string
  payload: unknown
  origin: EventOrigin
}

const REGISTERED_FLAG = Symbol.for('mTerminal.extensionBus.registered')

interface ChannelHandle {
  sender: WebContents
  webContentsId: number
}

export class MainEventBus {
  private emitter = new EventEmitter()
  // Rate-limit per (event-name, origin). Used to coalesce bursts.
  private throttles = new Map<string, { last: number; pending: NodeJS.Timeout | null }>()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  emit(event: string, payload: unknown, origin: EventOrigin = 'main'): void {
    this.emitter.emit(event, payload, origin)
    this.fanOutToRenderers({ event, payload, origin })
  }

  /** Throttled emit — for high-frequency producers like terminal output. */
  emitThrottled(event: string, payload: unknown, intervalMs: number): void {
    const slot = this.throttles.get(event) ?? { last: 0, pending: null }
    this.throttles.set(event, slot)
    const now = Date.now()
    if (now - slot.last >= intervalMs) {
      slot.last = now
      this.emit(event, payload)
      return
    }
    if (slot.pending) clearTimeout(slot.pending)
    const wait = intervalMs - (now - slot.last)
    slot.pending = setTimeout(() => {
      slot.last = Date.now()
      slot.pending = null
      this.emit(event, payload)
    }, wait)
  }

  on(event: string, cb: (payload: unknown, origin: EventOrigin) => void): () => void {
    this.emitter.on(event, cb)
    return () => this.emitter.off(event, cb)
  }

  once(event: string, cb: (payload: unknown, origin: EventOrigin) => void): () => void {
    this.emitter.once(event, cb)
    return () => this.emitter.off(event, cb)
  }

  private fanOutToRenderers(envelope: BusEnvelope): void {
    for (const win of BrowserWindow.getAllWindows()) {
      const wc = win.webContents
      // Don't echo to the originating renderer.
      if (envelope.origin === `r:${wc.id}`) continue
      try {
        wc.send('ext:bus', envelope)
      } catch {
        // window may be in the middle of closing; ignore.
      }
    }
  }
}

let busInstance: MainEventBus | null = null
export function getMainEventBus(): MainEventBus {
  if (!busInstance) busInstance = new MainEventBus()
  return busInstance
}

/**
 * Bind the cross-process IPC channels for the bus. Call once at startup.
 */
export function registerEventBusIpc(): void {
  // Use a global flag so we don't double-register if hot-reload happens.
  const g = globalThis as unknown as Record<symbol, boolean>
  if (g[REGISTERED_FLAG]) return
  g[REGISTERED_FLAG] = true

  const bus = getMainEventBus()

  ipcMain.handle('ext:bus:emit', (e, envelope: BusEnvelope) => {
    if (!envelope || typeof envelope.event !== 'string') return
    const handle: ChannelHandle = { sender: e.sender, webContentsId: e.sender.id }
    const origin: EventOrigin = `r:${handle.webContentsId}`
    // Run local main-side listeners
    bus['emitter'].emit(envelope.event, envelope.payload, origin)
    // Fan out to OTHER renderers (skip origin)
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id === handle.webContentsId) continue
      try {
        win.webContents.send('ext:bus', { ...envelope, origin })
      } catch {
        // ignore
      }
    }
  })
}
