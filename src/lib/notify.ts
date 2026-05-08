import {
  getUiStore,
  openConfirm,
  openPrompt,
  type ConfirmOpts,
  type PromptOpts,
} from '../extensions/api-bridge/ui'
import type { ToastKind } from '../extensions/api-bridge/ui-types'
import { isWindowFocused } from './window-focus'
import { sendNotification } from './ipc'

export type ToastInput =
  | string
  | {
      title?: string
      message: string
      details?: string
      durationMs?: number
      dismissible?: boolean
    }

export interface NotifyOrToastOpts {
  title: string
  body?: string
  details?: string
  kind?: ToastKind
  silent?: boolean
}

function resolveInput(input: ToastInput): {
  title?: string
  message: string
  details?: string
  durationMs?: number
  dismissible?: boolean
} {
  if (typeof input === 'string') return { message: input }
  return input
}

function pushKind(kind: ToastKind, input: ToastInput): number | null {
  const store = getUiStore()
  const opts = resolveInput(input)
  if (!store.isHostMounted()) {
    const head = opts.title ? `${opts.title}: ${opts.message}` : opts.message
    if (kind === 'error' || kind === 'warn') console.warn(`[notify:${kind}]`, head, opts.details ?? '')
    else console.log(`[notify:${kind}]`, head)
    return null
  }
  return store.pushToast({
    kind,
    title: opts.title,
    message: opts.message,
    details: opts.details,
    durationMs: opts.durationMs ?? 4500,
    dismissible: opts.dismissible !== false,
  })
}

function fromError(err: Error): { title?: string; message: string; details?: string } {
  const message = err.message || String(err)
  const details = err.stack && err.stack.length > 0 ? err.stack : undefined
  return { message, details }
}

export const notify = {
  info(input: ToastInput): void {
    pushKind('info', input)
  },
  success(input: ToastInput): void {
    pushKind('success', input)
  },
  warn(input: ToastInput): void {
    pushKind('warn', input)
  },
  error(input: ToastInput | Error): void {
    if (input instanceof Error) {
      pushKind('error', fromError(input))
      return
    }
    pushKind('error', input)
  },
  confirm(opts: ConfirmOpts): Promise<boolean> {
    return openConfirm(opts)
  },
  prompt(opts: PromptOpts): Promise<string | undefined> {
    return openPrompt(opts)
  },
  notifyOrToast(opts: NotifyOrToastOpts): void {
    if (isWindowFocused()) {
      pushKind(opts.kind ?? 'info', {
        title: opts.title,
        message: opts.body ?? '',
        details: opts.details,
      })
      return
    }
    sendNotification({ title: opts.title, body: opts.body })
  },
}
