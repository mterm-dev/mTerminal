/**
 * Wire-level types for the consolidated AI system in main.
 *
 * After cofnięcie SDK-as-extension every provider lives in
 * `electron/main/ai/providers/`, registered in `registry.ts`, and exposed to
 * the renderer through the IPC handlers in `index.ts`. The renderer-side
 * extension registry seeds three synthetic entries (one per built-in) whose
 * `stream`/`complete` impls just forward through `window.mt.ai`.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Usage {
  inTokens: number
  outTokens: number
  costUsd: number
}

export interface ModelInfo {
  id: string
  name: string
}

export type AiEvent =
  | { id: string; kind: 'delta'; value: string }
  | { id: string; kind: 'done'; value: Usage }
  | { id: string; kind: 'error'; value: string }

export interface ResolveOptions {
  /** Per-call API key override (custom-key bindings). */
  apiKey?: string
  /** Per-call base URL override (proxies, on-prem). */
  baseUrl?: string
}

export interface StreamReq extends ResolveOptions {
  id: string
  provider: string
  model?: string
  system?: string | null
  messages: Message[]
  signal: AbortSignal
}

export interface CompleteReq extends Omit<StreamReq, 'signal'> {
  signal?: AbortSignal
}

export interface ListModelsReq extends ResolveOptions {
  provider: string
}

export interface Provider {
  id: string
  label: string
  requiresVault: boolean
  vaultKeyPath?: string
  defaultModel: string
  listModels(opts: ResolveOptions): Promise<ModelInfo[]>
  complete(req: CompleteReq): Promise<{ text: string; usage: Usage }>
  stream(req: StreamReq, emit: (e: AiEvent) => void): Promise<Usage>
}
