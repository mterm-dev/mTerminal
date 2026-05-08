/**
 * Consolidated AI subsystem.
 *
 * After cofnięcie SDK-as-extension all three first-party providers
 * (Anthropic, Codex, Ollama) live again in `electron/main/ai/providers/` and
 * are wired into the renderer through the IPC handlers below. The renderer's
 * extension registry seeds three synthetic entries (one per built-in) whose
 * `complete`/`stream` impls just forward through `window.mt.ai`.
 *
 * Per-call `apiKey` and `baseUrl` overrides are honoured so that
 * extension-side AI bindings (e.g. git-panel commit message generation) can
 * use a different key than the one stored in the global vault.
 */

import { ipcMain, type BrowserWindow } from 'electron'
import { isUnlocked } from '../vault'
import { getProvider, listProviders } from './registry'
import { clearAiKey, getAiKey, setAiKey } from './vault-keys'
import type { AiEvent, CompleteReq, ListModelsReq, ResolveOptions } from './types'

const VAULT_LOCKED_ERROR = 'vault locked'

const tasks = new Map<string, AbortController>()

function ensureVaultUnlocked(provider: string): void {
  const p = getProvider(provider)
  if (p?.requiresVault === false) return
  if (!isUnlocked()) throw new Error(VAULT_LOCKED_ERROR)
}

interface StreamRpcReq {
  id: string
  provider: string
  model?: string
  system?: string | null
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  apiKey?: string
  baseUrl?: string
}

export function cancelAllAiTasks(): void {
  for (const c of tasks.values()) {
    try {
      c.abort()
    } catch {
      /* ignore */
    }
  }
  tasks.clear()
}

export function registerAiHandlers(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('ai:stream', async (_e, req: StreamRpcReq) => {
    ensureVaultUnlocked(req.provider)
    const provider = getProvider(req.provider)
    if (!provider) {
      throw new Error('Unknown provider: ' + req.provider)
    }
    const ctrl = new AbortController()
    tasks.set(req.id, ctrl)
    const emit = (e: AiEvent): void => {
      getWin()?.webContents.send('ai:event', e)
    }
    try {
      const usage = await provider.stream(
        {
          id: req.id,
          provider: req.provider,
          model: req.model,
          system: req.system,
          messages: req.messages,
          apiKey: req.apiKey,
          baseUrl: req.baseUrl,
          signal: ctrl.signal,
        },
        emit,
      )
      emit({ id: req.id, kind: 'done', value: usage })
    } catch (err) {
      if (ctrl.signal.aborted) {
        emit({ id: req.id, kind: 'done', value: { inTokens: 0, outTokens: 0, costUsd: 0 } })
      } else {
        const msg = err instanceof Error ? err.message : String(err)
        emit({ id: req.id, kind: 'error', value: msg })
      }
    } finally {
      tasks.delete(req.id)
    }
  })

  ipcMain.handle('ai:complete', async (_e, req: StreamRpcReq) => {
    ensureVaultUnlocked(req.provider)
    const provider = getProvider(req.provider)
    if (!provider) throw new Error('Unknown provider: ' + req.provider)
    const ctrl = new AbortController()
    tasks.set(req.id, ctrl)
    try {
      const r: CompleteReq = {
        id: req.id,
        provider: req.provider,
        model: req.model,
        system: req.system,
        messages: req.messages,
        apiKey: req.apiKey,
        baseUrl: req.baseUrl,
        signal: ctrl.signal,
      }
      return await provider.complete(r)
    } finally {
      tasks.delete(req.id)
    }
  })

  ipcMain.handle('ai:cancel', (_e, args: { id: string }) => {
    const c = tasks.get(args.id)
    if (c) {
      try {
        c.abort()
      } catch {
        /* ignore */
      }
      tasks.delete(args.id)
    }
  })

  ipcMain.handle('ai:list-models', async (_e, args: ListModelsReq) => {
    const provider = getProvider(args.provider)
    if (!provider) throw new Error('Unknown provider: ' + args.provider)
    const opts: ResolveOptions = { apiKey: args.apiKey, baseUrl: args.baseUrl }
    return provider.listModels(opts)
  })

  ipcMain.handle('ai:list-providers', () => {
    return listProviders().map((p) => ({
      id: p.id,
      label: p.label,
      requiresVault: p.requiresVault,
      vaultKeyPath: p.vaultKeyPath,
      defaultModel: p.defaultModel,
    }))
  })

  ipcMain.handle('ai:vault-key:has', (_e, args: { provider: string }): boolean => {
    if (!isUnlocked()) throw new Error(VAULT_LOCKED_ERROR)
    return getAiKey(args.provider) !== null
  })

  ipcMain.handle('ai:vault-key:set', (_e, args: { provider: string; key: string }) => {
    if (!isUnlocked()) throw new Error(VAULT_LOCKED_ERROR)
    setAiKey(args.provider, args.key)
  })

  ipcMain.handle('ai:vault-key:clear', (_e, args: { provider: string }) => {
    if (!isUnlocked()) throw new Error(VAULT_LOCKED_ERROR)
    clearAiKey(args.provider)
  })
}
