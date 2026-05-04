import {
  clearAiKey as vaultClearAiKey,
  getAiKey as vaultGetAiKey,
  isUnlocked,
  setAiKey as vaultSetAiKey,
} from '../vault'

export function get(provider: string): string | null {
  return vaultGetAiKey(provider)
}

export function set(provider: string, key: string): void {
  vaultSetAiKey(provider, key)
}

export function clear(provider: string): void {
  vaultClearAiKey(provider)
}

export function has(provider: string): boolean {
  if (provider === 'ollama') return true
  if (!isUnlocked()) return false
  try {
    return vaultGetAiKey(provider) !== null
  } catch {
    return false
  }
}
