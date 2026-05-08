/**
 * AI vault-key handlers.
 *
 * After the SDK-as-extension refactor there are no built-in providers in the
 * main process. The only remaining main-side surface is encrypted storage of
 * per-provider API keys via the vault — extensions read those keys through
 * `ctx.vault.get('ai_keys.<provider>')`, but the Settings UI still goes
 * through these channels because it predates the extension API and runs
 * outside of any extension's namespace.
 *
 * The `cancelAllAiTasks()` shim is kept for legacy callers (App.tsx, vault
 * lock flow). Cancellation now lives inside each extension's `stream()`
 * implementation via the AbortSignal passed on `req.signal`.
 */

import { ipcMain } from 'electron'
import { clearAiKey, getAiKey, isUnlocked, setAiKey } from '../vault'

const VAULT_LOCKED_ERROR = 'vault locked'

function ensureVaultUnlocked(): void {
  if (!isUnlocked()) throw new Error(VAULT_LOCKED_ERROR)
}

export function cancelAllAiTasks(): void {
  // No-op shim — cancellation moved to per-extension AbortSignals.
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:vault-key:has', (_e, args: { provider: string }): boolean => {
    ensureVaultUnlocked()
    return getAiKey(args.provider) !== null
  })

  ipcMain.handle('ai:vault-key:set', (_e, args: { provider: string; key: string }) => {
    ensureVaultUnlocked()
    setAiKey(args.provider, args.key)
  })

  ipcMain.handle('ai:vault-key:clear', (_e, args: { provider: string }) => {
    ensureVaultUnlocked()
    clearAiKey(args.provider)
  })
}
