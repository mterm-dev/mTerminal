/**
 * `ctx.ui` — Modal / confirm / prompt / toast helpers.
 *
 * For v1 we expose a thin observable model; the actual rendering happens via
 * `<PluginUiHost>` which is mounted once at the App.tsx root and subscribes
 * to these stores. Until the host mounts, modal calls use a hand-built
 * fallback (browser confirm/prompt + console toast) so plugin code activated
 * before the React tree is ready doesn't crash.
 */

import type { ModalSpec, NotifyApi, UiApi } from './ui-types'

export interface ToastSpec {
  id: number
  kind: 'info' | 'success' | 'warn' | 'error'
  message: string
  durationMs: number
}

interface PendingModal<T> {
  id: number
  spec: ModalSpec
  resolve: (value: T | undefined) => void
}

type Listener = () => void

class UiStore {
  private modals: Array<PendingModal<unknown>> = []
  private toasts: ToastSpec[] = []
  private nextId = 1
  private listeners = new Set<Listener>()
  private hostMounted = false

  setHostMounted(mounted: boolean): void {
    this.hostMounted = mounted
  }

  isHostMounted(): boolean {
    return this.hostMounted
  }

  openModal<T>(spec: ModalSpec): Promise<T | undefined> {
    return new Promise<T | undefined>((resolve) => {
      const entry: PendingModal<T> = { id: this.nextId++, spec, resolve }
      this.modals.push(entry as PendingModal<unknown>)
      this.fire()
    })
  }

  closeModal(id: number, value: unknown): void {
    const i = this.modals.findIndex((m) => m.id === id)
    if (i < 0) return
    const m = this.modals[i]
    this.modals.splice(i, 1)
    m.resolve(value)
    this.fire()
  }

  listModals(): Array<PendingModal<unknown>> {
    return [...this.modals]
  }

  pushToast(toast: Omit<ToastSpec, 'id'>): void {
    const id = this.nextId++
    const entry: ToastSpec = { id, ...toast }
    this.toasts.push(entry)
    this.fire()
    if (toast.durationMs > 0) {
      setTimeout(() => this.dismissToast(id), toast.durationMs)
    }
  }

  dismissToast(id: number): void {
    const i = this.toasts.findIndex((t) => t.id === id)
    if (i < 0) return
    this.toasts.splice(i, 1)
    this.fire()
  }

  listToasts(): ToastSpec[] {
    return [...this.toasts]
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private fire(): void {
    for (const cb of this.listeners) {
      try {
        cb()
      } catch {
        /* ignore */
      }
    }
  }
}

let storeInstance: UiStore | null = null
export function getUiStore(): UiStore {
  if (!storeInstance) storeInstance = new UiStore()
  return storeInstance
}

export function createUiBridge(): UiApi {
  const store = getUiStore()
  return {
    openModal<T = unknown>(spec: ModalSpec): Promise<T | undefined> {
      if (!store.isHostMounted()) {
        console.warn('[ext ui] openModal called before UI host mounted; resolving undefined')
        return Promise.resolve(undefined)
      }
      return store.openModal<T>(spec)
    },
    confirm: async ({ title, message }) => {
      if (!store.isHostMounted()) {
        return typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : false
      }
      const result = await store.openModal<boolean>({
        title,
        render: (host, ctrl) => {
          const wrap = document.createElement('div')
          wrap.style.padding = '16px'
          const msg = document.createElement('p')
          msg.textContent = message
          wrap.appendChild(msg)
          const btnRow = document.createElement('div')
          btnRow.style.display = 'flex'
          btnRow.style.justifyContent = 'flex-end'
          btnRow.style.gap = '8px'
          btnRow.style.marginTop = '12px'
          const cancel = document.createElement('button')
          cancel.textContent = 'Cancel'
          cancel.onclick = () => ctrl.close(false)
          const ok = document.createElement('button')
          ok.textContent = 'Confirm'
          ok.onclick = () => ctrl.close(true)
          btnRow.appendChild(cancel)
          btnRow.appendChild(ok)
          wrap.appendChild(btnRow)
          host.appendChild(wrap)
        },
      })
      return result === true
    },
    prompt: async ({ title, message, placeholder, defaultValue }) => {
      if (!store.isHostMounted()) {
        return typeof window !== 'undefined'
          ? window.prompt(`${title}${message ? '\n' + message : ''}`, defaultValue ?? '') ?? undefined
          : undefined
      }
      const result = await store.openModal<string>({
        title,
        render: (host, ctrl) => {
          const wrap = document.createElement('div')
          wrap.style.padding = '16px'
          if (message) {
            const msg = document.createElement('p')
            msg.textContent = message
            wrap.appendChild(msg)
          }
          const input = document.createElement('input')
          input.type = 'text'
          input.placeholder = placeholder ?? ''
          input.value = defaultValue ?? ''
          input.style.width = '100%'
          wrap.appendChild(input)
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') ctrl.close(input.value)
            if (e.key === 'Escape') ctrl.close(undefined)
          })
          host.appendChild(wrap)
          input.focus()
        },
      })
      return result
    },
    toast: ({ kind = 'info', message, durationMs = 3500 }) => {
      if (!store.isHostMounted()) {
        console.log(`[ext toast:${kind}]`, message)
        return
      }
      store.pushToast({ kind, message, durationMs })
    },
  }
}

export function createNotifyBridge(): NotifyApi {
  return {
    show: ({ title, body, silent }) => {
      const mt = window.mt as unknown as { notification?: { send: (a: unknown) => Promise<boolean> } }
      void mt.notification?.send({ title, body, silent }).catch(() => {})
    },
    requestPermission: async () => 'granted' as const,
  }
}
