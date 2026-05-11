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
    status: (): Promise<{ exists: boolean; unlocked: boolean; dev?: boolean }> =>
      ipcRenderer.invoke('vault:status'),
    init: (masterPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:init', { masterPassword }),
    unlock: (masterPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:unlock', { masterPassword }),
    lock: (): Promise<void> => ipcRenderer.invoke('vault:lock'),
    changePassword: (oldPassword: string, newPassword: string): Promise<void> =>
      ipcRenderer.invoke('vault:change-password', { oldPassword, newPassword }),
    devReset: (): Promise<void> => ipcRenderer.invoke('vault:dev-reset'),
  },
  ai: {
    /**
     * Encrypted per-provider API key storage. Reads/writes go through the
     * vault (Argon2id + XChaCha20-Poly1305) and require it to be unlocked.
     * Provider id is one of the built-ins ("anthropic" | "openai-codex" |
     * "ollama") or a custom registered by an extension.
     */
    vaultKey: {
      has: (provider: string): Promise<boolean> =>
        ipcRenderer.invoke('ai:vault-key:has', { provider }),
      set: (provider: string, key: string): Promise<void> =>
        ipcRenderer.invoke('ai:vault-key:set', { provider, key }),
      clear: (provider: string): Promise<void> =>
        ipcRenderer.invoke('ai:vault-key:clear', { provider }),
    },
    /** Built-in provider streaming. Routes Anthropic/Codex/Ollama through main. */
    stream: (req: {
      id: string
      provider: string
      model?: string
      system?: string | null
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      apiKey?: string
      baseUrl?: string
    }): Promise<void> => ipcRenderer.invoke('ai:stream', req),
    complete: (req: {
      id: string
      provider: string
      model?: string
      system?: string | null
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      apiKey?: string
      baseUrl?: string
    }): Promise<{ text: string; usage: { inTokens: number; outTokens: number; costUsd: number } }> =>
      ipcRenderer.invoke('ai:complete', req),
    cancel: (id: string): Promise<void> =>
      ipcRenderer.invoke('ai:cancel', { id }),
    listModels: (
      provider: string,
      opts?: { apiKey?: string; baseUrl?: string },
    ): Promise<Array<{ id: string; name: string }>> =>
      ipcRenderer.invoke('ai:list-models', { provider, ...(opts ?? {}) }),
    listProviders: (): Promise<
      Array<{
        id: string
        label: string
        requiresVault: boolean
        vaultKeyPath?: string
        defaultModel: string
      }>
    > => ipcRenderer.invoke('ai:list-providers'),
    onEvent: (
      cb: (
        ev:
          | { id: string; kind: 'delta'; value: string }
          | {
              id: string
              kind: 'done'
              value: { inTokens: number; outTokens: number; costUsd: number }
            }
          | { id: string; kind: 'error'; value: string },
      ) => void,
    ): (() => void) => {
      const listener = (_: unknown, ev: unknown): void =>
        cb(ev as Parameters<typeof cb>[0])
      ipcRenderer.on('ai:event', listener)
      return () => {
        ipcRenderer.off('ai:event', listener)
      }
    },
  },
  agent: {
    snapshot: (): Promise<
      Array<[number, { state: 'idle' | 'thinking' | 'awaitingInput' | 'done'; agent: 'claude' | 'codex' | null; lastChangeMs: number; detail?: { tool?: string; message?: string } }]>
    > => ipcRenderer.invoke('agent:status:snapshot'),
    onStatus: (
      cb: (ev: {
        tabId: number
        state: 'idle' | 'thinking' | 'awaitingInput' | 'done'
        agent: 'claude' | 'codex' | null
        lastChangeMs: number
        detail?: { tool?: string; message?: string }
      }) => void,
    ): (() => void) => {
      const listener = (_: unknown, ev: unknown): void =>
        cb(ev as Parameters<typeof cb>[0])
      ipcRenderer.on('agent:status', listener)
      return () => {
        ipcRenderer.off('agent:status', listener)
      }
    },
    hooks: {
      status: (): Promise<{
        claude: 'installed' | 'missing' | 'mismatch'
        codex: 'installed' | 'missing' | 'mismatch'
        bridgeSocket: string | null
        version: string
      }> => ipcRenderer.invoke('agent:hooks:status'),
      install: (target: 'claude' | 'codex'): Promise<void> =>
        ipcRenderer.invoke('agent:hooks:install', { target }),
      uninstall: (target: 'claude' | 'codex'): Promise<void> =>
        ipcRenderer.invoke('agent:hooks:uninstall', { target }),
    },
  },
  mcp: {
    status: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:status'),
    start: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:start'),
    stop: (): Promise<{ running: boolean; socketPath: string | null }> =>
      ipcRenderer.invoke('mcp:stop'),
  },
  wsl: {
    listDistros: (): Promise<
      Array<{ name: string; default: boolean; version: 1 | 2; state: string }>
    > => ipcRenderer.invoke('wsl:list-distros'),
  },
  system: {
    info: (): Promise<{
      user: string
      host: string
      home: string
      platform: NodeJS.Platform
    }> => ipcRenderer.invoke('system:info'),
    platform: (): Promise<NodeJS.Platform> =>
      ipcRenderer.invoke('system:platform'),
  },
  platform: process.platform as NodeJS.Platform,
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
  shell: {
    openExternal: (url: string): Promise<boolean> =>
      ipcRenderer.invoke('shell:open-external', url),
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
  voice: {
    transcribe: (args: {
      engine: 'whisper-cpp' | 'openai'
      wav: Uint8Array
      language?: string
      openaiModel?: string
      openaiBaseUrl?: string
      whisperBinPath?: string
      whisperModelPath?: string
    }): Promise<{ text: string }> =>
      ipcRenderer.invoke('voice:transcribe', args),
  },
  /**
   * Extension system bridge. Used by `src/extensions/host-renderer.ts` and the
   * Plugin Manager UI; not intended to be called by extensions directly
   * (extensions use `ctx.ipc` and `ctx.events`, which delegate here).
   */
  ext: {
    /** Snapshot of the registry: manifests + state for every installed extension. */
    listManifests: (): Promise<
      Array<{
        manifest: unknown
        state: string
        enabled: boolean
        trusted: boolean
        lastError: { message: string; stack?: string } | null
        activatedAt: number | null
      }>
    > => ipcRenderer.invoke('ext:list-manifests'),

    /** Call an extension's main-side IPC handler. */
    invoke: (extId: string, channel: string, args?: unknown): Promise<unknown> =>
      ipcRenderer.invoke('ext:invoke', { extId, channel, args }),

    /** Subscribe to events from `ctx.ipc.emit(...)` on the main side. */
    on: (
      extId: string,
      channel: string,
      cb: (payload: unknown) => void,
    ): (() => void) => {
      const event = `ext:${extId}:${channel}`
      const listener = (_: unknown, payload: unknown): void => cb(payload)
      // Renderer subscribes via the bus (event-bus channel `ext:bus`).
      const busListener = (_: unknown, env: unknown): void => {
        const e = env as { event: string; payload: unknown }
        if (e?.event === event) listener(_, e.payload)
      }
      ipcRenderer.on('ext:bus', busListener)
      return () => ipcRenderer.off('ext:bus', busListener)
    },

    /** Subscribe to ALL bus events. Used by the renderer-side host. */
    onBus: (cb: (env: { event: string; payload: unknown; origin: string }) => void): (() => void) => {
      const listener = (_: unknown, env: unknown): void =>
        cb(env as { event: string; payload: unknown; origin: string })
      ipcRenderer.on('ext:bus', listener)
      return () => ipcRenderer.off('ext:bus', listener)
    },

    /** Emit an event onto the cross-process bus. */
    emit: (event: string, payload?: unknown): Promise<void> =>
      ipcRenderer.invoke('ext:bus:emit', { event, payload, origin: 'r' }),

    enable: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ext:enable', id),
    disable: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ext:disable', id),
    setTrusted: (id: string, trusted: boolean): Promise<boolean> =>
      ipcRenderer.invoke('ext:trust:set', { id, trusted }),
    reload: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ext:reload', id),
    reloadAll: (): Promise<boolean> => ipcRenderer.invoke('ext:reload-all'),
    reportLoadError: (
      id: string,
      message: string,
      stack?: string,
    ): Promise<{ ok: true }> =>
      ipcRenderer.invoke('ext:report-load-error', { id, message, stack }),
    install: (source: 'npm' | 'url' | 'folder', ref: string): Promise<unknown> =>
      ipcRenderer.invoke('ext:install', { source, ref }),
    uninstall: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('ext:uninstall', id),

    secrets: {
      get: (extId: string, key: string): Promise<string | null> =>
        ipcRenderer.invoke('ext:secrets:get', { extId, key }),
      set: (extId: string, key: string, value: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:secrets:set', { extId, key, value }),
      delete: (extId: string, key: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:secrets:delete', { extId, key }),
      has: (extId: string, key: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:secrets:has', { extId, key }),
      keys: (extId: string): Promise<string[]> =>
        ipcRenderer.invoke('ext:secrets:keys', { extId }),
      onChange: (
        extId: string,
        cb: (key: string, present: boolean) => void,
      ): (() => void) => {
        const target = `ext:secrets:changed:${extId}`
        const listener = (_: unknown, env: unknown): void => {
          const e = env as { event: string; payload: { key: string; present: boolean } }
          if (e?.event === target) cb(e.payload.key, e.payload.present)
        }
        ipcRenderer.on('ext:bus', listener)
        return () => ipcRenderer.off('ext:bus', listener)
      },
    },

    vault: {
      get: (extId: string, key: string): Promise<string | null> =>
        ipcRenderer.invoke('ext:vault:get', { extId, key }),
      set: (extId: string, key: string, value: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:vault:set', { extId, key, value }),
      delete: (extId: string, key: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:vault:delete', { extId, key }),
      has: (extId: string, key: string): Promise<boolean> =>
        ipcRenderer.invoke('ext:vault:has', { extId, key }),
      keys: (extId: string): Promise<string[]> =>
        ipcRenderer.invoke('ext:vault:keys', { extId }),
      onChange: (
        extId: string,
        cb: (key: string, present: boolean) => void,
      ): (() => void) => {
        const target = `ext:vault:changed:${extId}`
        const listener = (_: unknown, env: unknown): void => {
          const e = env as { event: string; payload: { key: string; present: boolean } }
          if (e?.event === target) cb(e.payload.key, e.payload.present)
        }
        ipcRenderer.on('ext:bus', listener)
        return () => ipcRenderer.off('ext:bus', listener)
      },
    },
  },
  updater: {
    check: (): Promise<unknown> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<unknown> => ipcRenderer.invoke('updater:download'),
    install: (): Promise<unknown> => ipcRenderer.invoke('updater:install'),
    getState: (): Promise<unknown> => ipcRenderer.invoke('updater:get-state'),
    setBetaChannel: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke('updater:set-beta-channel', enabled),
    onState: (cb: (state: unknown) => void): (() => void) => {
      const listener = (_: unknown, s: unknown): void => cb(s)
      ipcRenderer.on('updater:state', listener)
      return () => {
        ipcRenderer.off('updater:state', listener)
      }
    },
  },
  marketplace: {
    search: (req?: unknown): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:search', req ?? {}),
    details: (id: string): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:details', { id }),
    install: (id: string, version?: string): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:install', { id, version }),
    uninstall: (id: string): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:uninstall', { id }),
    update: (id: string): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:update', { id }),
    checkUpdates: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:check-updates'),
    getUpdates: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:get-updates'),
    listInstalledWithMeta: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:list-installed-with-marketplace-meta'),
    submitRating: (req: {
      extensionId: string
      stars: number
      comment?: string
    }): Promise<unknown> => ipcRenderer.invoke('marketplace:rating:submit', req),
    isFirstRun: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:is-first-run'),
    markOnboardingDone: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:mark-onboarding-done'),
    installRecommended: (ids: string[]): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:install-recommended', { ids }),
    setEndpoint: (url: string | null): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:set-endpoint', { url }),
    getEndpoint: (): Promise<unknown> =>
      ipcRenderer.invoke('marketplace:get-endpoint'),
  },
}

contextBridge.exposeInMainWorld('mt', api)

export type MtApi = typeof api
