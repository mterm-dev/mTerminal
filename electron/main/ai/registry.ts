import { anthropicProvider } from './providers/anthropic'
import { codexProvider } from './providers/openai-codex'
import { ollamaProvider } from './providers/ollama'
import type { Provider } from './types'

const builtins = new Map<string, Provider>([
  [anthropicProvider.id, anthropicProvider],
  [codexProvider.id, codexProvider],
  [ollamaProvider.id, ollamaProvider],
])

export function getProvider(id: string): Provider | null {
  return builtins.get(id) ?? null
}

export function listProviders(): Provider[] {
  return Array.from(builtins.values())
}
