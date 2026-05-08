/**
 * Local shapes for `ctx.ui` and `ctx.notify`.
 *
 * Mirrors `packages/extension-api/src/index.d.ts` types — kept here as a
 * runtime-friendly file so the renderer code can import them without
 * depending on `.d.ts` cross-package paths.
 */

export interface ModalController {
  close(result?: unknown): void
  setTitle(title: string): void
}

export interface ModalSpec {
  title: string
  width?: number
  height?: number
  render(host: HTMLElement, ctrl: ModalController): void | (() => void)
}

export type ToastKind = 'info' | 'success' | 'warn' | 'error'

export interface ToastInputObject {
  kind?: ToastKind
  title?: string
  message: string
  details?: string
  durationMs?: number
  dismissible?: boolean
}

export interface UiApi {
  openModal<T = unknown>(spec: ModalSpec): Promise<T | undefined>
  confirm(opts: {
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
  }): Promise<boolean>
  prompt(opts: { title: string; message?: string; placeholder?: string; defaultValue?: string }): Promise<string | undefined>
  toast(opts: ToastInputObject): void
}

export interface NotifyApi {
  show(opts: { title: string; body?: string; silent?: boolean }): void
  requestPermission(): Promise<'granted' | 'denied' | 'default'>
}
