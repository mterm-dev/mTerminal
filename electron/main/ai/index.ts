import { ipcMain } from 'electron'
import { AnthropicProvider } from './anthropic'
import { OpenAiProvider } from './openai'
import {
  AiEvent,
  AiProvider,
  CompleteRequest,
  Message,
  ModelInfo,
} from './provider'
import * as keys from './keys'
import { getMainWindow } from '../sessions'
import { isUnlocked } from '../vault'

interface TaskEntry {
  controller: AbortController
}

const tasks = new Map<number, TaskEntry>()
let nextTaskId = 1

export function cancelAllAiTasks(): void {
  for (const entry of tasks.values()) {
    entry.controller.abort()
  }
}

function requireVaultKey(provider: string): string {
  if (!isUnlocked()) throw new Error(`vault locked — unlock to use ${provider}`)
  const key = keys.get(provider)
  if (!key) throw new Error(`${provider} api key not set — open settings → ai`)
  return key
}

function buildProvider(name: string, baseUrl?: string): AiProvider {
  if (name === 'anthropic') {
    return new AnthropicProvider(requireVaultKey('anthropic'))
  }
  if (name === 'openai') {
    const url = baseUrl ?? 'https://api.openai.com/v1'
    return new OpenAiProvider(requireVaultKey('openai'), url, 'openai')
  }
  if (name === 'ollama') {
    const url = baseUrl ?? 'http://localhost:11434/v1'
    return new OpenAiProvider(null, url, 'ollama')
  }
  throw new Error(`unknown provider: ${name}`)
}

function sendEvent(taskId: number, ev: AiEvent): void {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) return
  win.webContents.send('ai:event:' + taskId, ev)
}

interface StreamArgs {
  provider: string
  model: string
  messages: Message[]
  system?: string
  maxTokens?: number
  temperature?: number
  baseUrl?: string
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:stream-complete', (_e, args: StreamArgs) => {
    const taskId = nextTaskId++
    const controller = new AbortController()

    let prov: AiProvider
    try {
      prov = buildProvider(args.provider, args.baseUrl)
    } catch (e) {
      setImmediate(() => {
        sendEvent(taskId, {
          kind: 'error',
          value: e instanceof Error ? e.message : String(e),
        })
      })
      return taskId
    }

    const req: CompleteRequest = {
      messages: args.messages,
      system: args.system,
      model: args.model,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    }

    tasks.set(taskId, { controller })
    ;(async () => {
      try {
        await prov.streamComplete(req, (ev) => { sendEvent(taskId, ev) }, controller.signal)
      } catch (e) {
        if (!controller.signal.aborted) {
          sendEvent(taskId, {
            kind: 'error',
            value: e instanceof Error ? e.message : String(e),
          })
        }
      } finally {
        tasks.delete(taskId)
      }
    })()

    return taskId
  })

  ipcMain.handle('ai:cancel', (_e, args: { taskId: number }) => {
    const t = tasks.get(args.taskId)
    if (t) t.controller.abort()
  })

  ipcMain.handle(
    'ai:list-models',
    async (
      _e,
      args: { provider: string; baseUrl?: string }
    ): Promise<ModelInfo[]> => {
      const prov = buildProvider(args.provider, args.baseUrl)
      return prov.listModels()
    }
  )

  ipcMain.handle(
    'ai:set-key',
    (_e, args: { provider: string; key: string }) => {
      keys.set(args.provider, args.key)
    }
  )

  ipcMain.handle('ai:clear-key', (_e, args: { provider: string }) => {
    keys.clear(args.provider)
  })

  ipcMain.handle(
    'ai:has-key',
    (_e, args: { provider: string }): boolean => {
      return keys.has(args.provider)
    }
  )
}
