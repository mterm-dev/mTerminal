import type { ModalSpec, NotifyApi, ToastInputObject, UiApi } from './ui-types'
import { notify } from '../../lib/notify'

export interface ToastSpec {
  id: number
  kind: 'info' | 'success' | 'warn' | 'error'
  title?: string
  message: string
  details?: string
  durationMs: number
  dismissible: boolean
}

interface PendingModal<T> {
  id: number
  spec: ModalSpec
  resolve: (value: T | undefined) => void
}

interface DismissTimer {
  timeout: ReturnType<typeof setTimeout> | null
  durationMs: number
  startedAt: number
  remainingMs: number
  paused: boolean
}

type Listener = () => void

class UiStore {
  private modals: Array<PendingModal<unknown>> = []
  private toasts: ToastSpec[] = []
  private timers = new Map<number, DismissTimer>()
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

  pushToast(toast: Omit<ToastSpec, 'id' | 'dismissible'> & { dismissible?: boolean }): number {
    const id = this.nextId++
    const entry: ToastSpec = {
      id,
      kind: toast.kind,
      title: toast.title,
      message: toast.message,
      details: toast.details,
      durationMs: toast.durationMs,
      dismissible: toast.dismissible !== false,
    }
    this.toasts.push(entry)
    if (entry.durationMs > 0) {
      const timer: DismissTimer = {
        timeout: setTimeout(() => this.dismissToast(id), entry.durationMs),
        durationMs: entry.durationMs,
        startedAt: Date.now(),
        remainingMs: entry.durationMs,
        paused: false,
      }
      this.timers.set(id, timer)
    }
    this.fire()
    return id
  }

  dismissToast(id: number): void {
    const timer = this.timers.get(id)
    if (timer?.timeout) clearTimeout(timer.timeout)
    this.timers.delete(id)
    const i = this.toasts.findIndex((t) => t.id === id)
    if (i < 0) return
    this.toasts.splice(i, 1)
    this.fire()
  }

  pauseDismiss(id: number): void {
    const timer = this.timers.get(id)
    if (!timer || timer.paused || !timer.timeout) return
    clearTimeout(timer.timeout)
    timer.timeout = null
    timer.paused = true
    const elapsed = Date.now() - timer.startedAt
    timer.remainingMs = Math.max(0, timer.remainingMs - elapsed)
  }

  resumeDismiss(id: number): void {
    const timer = this.timers.get(id)
    if (!timer || !timer.paused) return
    timer.paused = false
    timer.startedAt = Date.now()
    if (timer.remainingMs <= 0) {
      this.dismissToast(id)
      return
    }
    timer.timeout = setTimeout(() => this.dismissToast(id), timer.remainingMs)
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

export interface ConfirmOpts {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export async function openConfirm(opts: ConfirmOpts): Promise<boolean> {
  const store = getUiStore()
  if (!store.isHostMounted()) {
    return typeof window !== 'undefined'
      ? window.confirm(`${opts.title}\n\n${opts.message}`)
      : false
  }
  const result = await store.openModal<boolean>({
    title: opts.title,
    render: (host, ctrl) => {
      const wrap = document.createElement('div')
      wrap.className = 'mt-modal-body'
      const msg = document.createElement('p')
      msg.className = 'mt-modal-message'
      msg.textContent = opts.message
      wrap.appendChild(msg)
      const btnRow = document.createElement('div')
      btnRow.className = 'mt-modal-actions'
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.className = 'mt-modal-btn'
      cancel.textContent = opts.cancelLabel ?? 'cancel'
      cancel.onclick = () => ctrl.close(false)
      const ok = document.createElement('button')
      ok.type = 'button'
      ok.className = opts.danger ? 'mt-modal-btn is-danger' : 'mt-modal-btn is-primary'
      ok.textContent = opts.confirmLabel ?? (opts.danger ? 'delete' : 'confirm')
      ok.onclick = () => ctrl.close(true)
      btnRow.appendChild(cancel)
      btnRow.appendChild(ok)
      wrap.appendChild(btnRow)
      host.appendChild(wrap)
      ok.focus()
    },
  })
  return result === true
}

export interface PromptOpts {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
}

export async function openPrompt(opts: PromptOpts): Promise<string | undefined> {
  const store = getUiStore()
  if (!store.isHostMounted()) {
    return typeof window !== 'undefined'
      ? window.prompt(`${opts.title}${opts.message ? '\n' + opts.message : ''}`, opts.defaultValue ?? '') ?? undefined
      : undefined
  }
  return await store.openModal<string>({
    title: opts.title,
    render: (host, ctrl) => {
      const wrap = document.createElement('div')
      wrap.className = 'mt-modal-body'
      if (opts.message) {
        const msg = document.createElement('p')
        msg.className = 'mt-modal-message'
        msg.textContent = opts.message
        wrap.appendChild(msg)
      }
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'mt-modal-input'
      input.placeholder = opts.placeholder ?? ''
      input.value = opts.defaultValue ?? ''
      wrap.appendChild(input)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') ctrl.close(input.value)
        if (e.key === 'Escape') ctrl.close(undefined)
      })
      host.appendChild(wrap)
      input.focus()
    },
  })
}

function normalizeToastInput(input: ToastInputObject): {
  title?: string
  message: string
  details?: string
  durationMs: number
  dismissible: boolean
} {
  const durationMs = input.durationMs ?? 4500
  return {
    title: input.title,
    message: input.message,
    details: input.details,
    durationMs,
    dismissible: input.dismissible !== false,
  }
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
    confirm: openConfirm,
    prompt: openPrompt,
    toast: ({ kind = 'info', message, title, details, durationMs, dismissible }) => {
      if (!store.isHostMounted()) {
        const head = title ? `${title}: ${message}` : message
        console.log(`[ext toast:${kind}]`, head, details ?? '')
        return
      }
      const norm = normalizeToastInput({ title, message, details, durationMs, dismissible })
      store.pushToast({ kind, ...norm })
    },
  }
}

export function createNotifyBridge(): NotifyApi {
  return {
    show: ({ title, body, silent }) => {
      notify.notifyOrToast({ title, body, silent })
    },
    requestPermission: async () => 'granted' as const,
  }
}
