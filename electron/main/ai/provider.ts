/**
 * Wire-level AI types shared between main and renderer.
 *
 * After the SDK-as-extension refactor the main process no longer hosts AI
 * providers — every provider lives inside an installed extension on the
 * renderer side. The only main-side responsibility left is gating vault key
 * reads/writes for those providers, so the types here are intentionally
 * minimal.
 */

export interface Message {
  role: string
  content: string
}

export interface Usage {
  inTokens: number
  outTokens: number
  costUsd: number
}

export type AiEvent =
  | { kind: 'delta'; value: string }
  | { kind: 'done'; value: Usage }
  | { kind: 'error'; value: string }

export interface ModelInfo {
  id: string
  name: string
}
