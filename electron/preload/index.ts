import { contextBridge, ipcRenderer } from 'electron'

const api = {
  pty: {
    spawn: (args: {
      rows: number
      cols: number
      shell?: string
      args?: string[]
      env?: Record<string, string>
      cwd?: string
    }): Promise<number> => ipcRenderer.invoke('pty:spawn', args),
    write: (id: number, data: string): Promise<void> =>
      ipcRenderer.invoke('pty:write', { id, data }),
    resize: (id: number, rows: number, cols: number): Promise<void> =>
      ipcRenderer.invoke('pty:resize', { id, rows, cols }),
    kill: (id: number): Promise<void> => ipcRenderer.invoke('pty:kill', { id }),
    info: (
      id: number
    ): Promise<{ cwd: string | null; cmd: string | null; pid: number }> =>
      ipcRenderer.invoke('pty:info', { id }),
    recentOutput: (id: number, maxBytes?: number): Promise<string> =>
      ipcRenderer.invoke('pty:recent-output', { id, maxBytes }),
    onEvent: (
      id: number,
      cb: (ev: { kind: 'data'; value: string } | { kind: 'exit' }) => void
    ): (() => void) => {
      const channel = 'pty:event:' + id
      const listener = (_: unknown, ev: unknown): void =>
        cb(ev as { kind: 'data'; value: string } | { kind: 'exit' })
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.off(channel, listener)
      }
    },
  },
  vault: {
    status: (): Promise<{ exists: boolean; unlocked: boolean }> =>
      ipcRenderer.invoke('vault:status'),
    init: (masterPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:init', { masterPassword }),
    unlock: (masterPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:unlock', { masterPassword }),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    changePassword: (oldPassword: string, newPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:change-password', { oldPassword, newPassword }),
  },
  hosts: {
    list: (): Promise<{
      hosts: Array<{
        id: string
        name: string
        host: string
        port: number
        user: string
        auth: string
        identityPath?: string
        savePassword: boolean
        lastUsed?: number
        groupId?: string
      }>
      groups: Array<{
        id: string
        name: string
        collapsed: boolean
        accent: string
      }>
    }> => ipcRenderer.invoke('hosts:list'),
    save: (host: unknown, password?: string): Promise<string> =>
      ipcRenderer.invoke('hosts:save', { host, password }),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('hosts:delete', { id }),
    getPassword: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('hosts:get-password', { id }),
    groupSave: (group: unknown): Promise<string> =>
      ipcRenderer.invoke('hosts:group-save', { group }),
    groupDelete: (id: string): Promise<void> =>
      ipcRenderer.invoke('hosts:group-delete', { id }),
    setGroup: (hostId: string, groupId?: string): Promise<void> =>
      ipcRenderer.invoke('hosts:set-group', { hostId, groupId }),
    listKeys: (): Promise<Array<{ path: string; name: string; keyType: string }>> =>
      ipcRenderer.invoke('hosts:list-keys'),
    toolAvailability: (): Promise<{ sshpass: boolean }> =>
      ipcRenderer.invoke('hosts:tool-availability'),
  },
  ai: {
    streamComplete: (args: {
      provider: string
      model: string
      messages: Array<{ role: string; content: string }>
      system?: string
      maxTokens?: number
      temperature?: number
      baseUrl?: string
    }): Promise<number> => ipcRenderer.invoke('ai:stream-complete', args),
    cancel: (taskId: number): Promise<void> =>
      ipcRenderer.invoke('ai:cancel', { taskId }),
    listModels: (
      provider: string,
      baseUrl?: string
    ): Promise<Array<{ id: string; name: string }>> =>
      ipcRenderer.invoke('ai:list-models', { provider, baseUrl }),
    setKey: (provider: string, key: string): Promise<void> =>
      ipcRenderer.invoke('ai:set-key', { provider, key }),
    clearKey: (provider: string): Promise<void> =>
      ipcRenderer.invoke('ai:clear-key', { provider }),
    hasKey: (provider: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:has-key', { provider }),
    onEvent: (
      taskId: number,
      cb: (
        ev:
          | { kind: 'delta'; value: string }
          | {
              kind: 'done'
              value: { inTokens: number; outTokens: number; costUsd: number }
            }
          | { kind: 'error'; value: string }
      ) => void
    ): (() => void) => {
      const channel = 'ai:event:' + taskId
      const listener = (_: unknown, ev: unknown): void =>
        cb(
          ev as
            | { kind: 'delta'; value: string }
            | {
                kind: 'done'
                value: {
                  inTokens: number
                  outTokens: number
                  costUsd: number
                }
              }
            | { kind: 'error'; value: string }
        )
      ipcRenderer.on(channel, listener)
      return () => {
        ipcRenderer.off(channel, listener)
      }
    },
  },
  claudeCode: {
    status: (
      tabId: number
    ): Promise<{
      state: 'none' | 'idle' | 'thinking' | 'awaitingInput'
      running: boolean
      binary: string | null
      lastActivityMs: number | null
    }> => ipcRenderer.invoke('claude-code:status', { tabId }),
  },
  mcp: {
    status: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:status'),
    start: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:start'),
    stop: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:stop'),
  },
  ssh: {
    spawn: (args: {
      rows: number
      cols: number
      hostId: string
    }): Promise<number> => ipcRenderer.invoke('ssh:spawn', args),
  },
  system: {
    info: (): Promise<{ user: string; host: string }> =>
      ipcRenderer.invoke('system:info'),
  } as { info: () => Promise<{ user: string; host: string }> },
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<boolean> =>
      ipcRenderer.invoke('window:maximize-toggle'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (cb: (isMax: boolean) => void): (() => void) => {
      const listener = (_: unknown, v: boolean): void => cb(v)
      ipcRenderer.on('window:maximized-changed', listener)
      return () => {
        ipcRenderer.off('window:maximized-changed', listener)
      }
    },
  },
  clipboard: {
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:read'),
    writeText: (text: string): Promise<void> =>
      ipcRenderer.invoke('clipboard:write', text),
  },
  dialog: {
    open: (opts?: unknown): Promise<string[] | null> =>
      ipcRenderer.invoke('dialog:open', opts),
  },
  notification: {
    send: (opts: { title: string; body?: string }): Promise<boolean> =>
      ipcRenderer.invoke('notification:send', opts),
    requestPermission: (): Promise<'granted' | 'denied' | 'default'> =>
      ipcRenderer.invoke('notification:permission'),
  },
  workspace: {
    loadSync: (): string | null => {
      const v = ipcRenderer.sendSync('workspace:load:sync')
      return typeof v === 'string' ? v : null
    },
    save: (json: string): Promise<void> =>
      ipcRenderer.invoke('workspace:save', json),
  },
  settings: {
    loadSync: (): string | null => {
      const v = ipcRenderer.sendSync('settings:load:sync')
      return typeof v === 'string' ? v : null
    },
    save: (json: string): Promise<void> =>
      ipcRenderer.invoke('settings:save', json),
  },
}

contextBridge.exposeInMainWorld('mt', api)

export type MtApi = typeof api
