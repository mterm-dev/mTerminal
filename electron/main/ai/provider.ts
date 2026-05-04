export interface Message {
  role: string
  content: string
}

export interface CompleteRequest {
  messages: Message[]
  system?: string
  model: string
  maxTokens?: number
  temperature?: number
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

export type EventSink = (ev: AiEvent) => void

export interface AbortFlag {
  cancelled: boolean
}

export interface AiProvider {
  streamComplete(
    req: CompleteRequest,
    sink: EventSink,
    cancel: AbortFlag
  ): Promise<void>
  listModels(): Promise<ModelInfo[]>
}

export function estimateCost(
  provider: string,
  model: string,
  inTokens: number,
  outTokens: number
): number {
  let inPerM: number
  let outPerM: number
  if (provider === 'anthropic') {
    if (model.includes('opus-4')) {
      inPerM = 15.0
      outPerM = 75.0
    } else if (model.includes('sonnet')) {
      inPerM = 3.0
      outPerM = 15.0
    } else if (model.includes('haiku')) {
      inPerM = 0.8
      outPerM = 4.0
    } else {
      inPerM = 3.0
      outPerM = 15.0
    }
  } else if (provider === 'openai') {
    if (model.includes('gpt-5') || model.includes('o1')) {
      inPerM = 15.0
      outPerM = 60.0
    } else if (model.includes('gpt-4')) {
      inPerM = 5.0
      outPerM = 15.0
    } else if (model.includes('mini')) {
      inPerM = 0.15
      outPerM = 0.6
    } else {
      inPerM = 5.0
      outPerM = 15.0
    }
  } else {
    return 0.0
  }
  return (
    (inTokens / 1_000_000) * inPerM + (outTokens / 1_000_000) * outPerM
  )
}
