import { getAiKey } from '../vault'

export {
  getAiKey as get,
  setAiKey as set,
  clearAiKey as clear,
} from '../vault'

export function has(provider: string): boolean {
  if (provider === 'ollama') return true
  try {
    return getAiKey(provider) !== null
  } catch {
    return false
  }
}
