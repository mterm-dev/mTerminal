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
  topP?: number
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

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

export interface AiProvider {
  streamComplete(
    req: CompleteRequest,
    sink: EventSink,
    signal: AbortSignal
  ): Promise<void>
  listModels(): Promise<ModelInfo[]>
}

const COST_TABLE: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'anthropic:opus-4': { inputPer1M: 15.0, outputPer1M: 75.0 },
  'anthropic:sonnet': { inputPer1M: 3.0, outputPer1M: 15.0 },
  'anthropic:haiku': { inputPer1M: 0.8, outputPer1M: 4.0 },
  'openai:gpt-5': { inputPer1M: 15.0, outputPer1M: 60.0 },
  'openai:o1': { inputPer1M: 15.0, outputPer1M: 60.0 },
  'openai:gpt-4': { inputPer1M: 5.0, outputPer1M: 15.0 },
  'openai:mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
}

export function estimateCost(
  provider: string,
  model: string,
  inTokens: number,
  outTokens: number
): number {
  let entry: { inputPer1M: number; outputPer1M: number } | undefined

  if (provider === 'anthropic') {
    if (model.includes('opus-4')) entry = COST_TABLE['anthropic:opus-4']
    else if (model.includes('sonnet')) entry = COST_TABLE['anthropic:sonnet']
    else if (model.includes('haiku')) entry = COST_TABLE['anthropic:haiku']
    else entry = COST_TABLE['anthropic:sonnet']
  } else if (provider === 'openai') {
    if (model.includes('gpt-5') || model.includes('o1')) {
      entry = model.includes('o1') ? COST_TABLE['openai:o1'] : COST_TABLE['openai:gpt-5']
    } else if (model.includes('mini')) entry = COST_TABLE['openai:mini']
    else if (model.includes('gpt-4')) entry = COST_TABLE['openai:gpt-4']
    else entry = COST_TABLE['openai:gpt-4']
  }

  if (!entry) return 0.0
  return (inTokens / 1_000_000) * entry.inputPer1M + (outTokens / 1_000_000) * entry.outputPer1M
}
