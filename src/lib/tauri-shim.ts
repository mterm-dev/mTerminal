import type { MtApi } from '../../electron/preload'

const mt = (): MtApi => {
  const api = (window as unknown as { mt?: MtApi }).mt
  if (!api) {
    throw new Error(
      'mTerminal preload API (window.mt) is not available — running outside Electron?',
    )
  }
  return api
}

export class Channel<T> {
  public onmessage: ((msg: T) => void) | null = null
  public unsubscribe: (() => void) | null = null
}

type Args = Record<string, unknown> | undefined

export async function invoke<T = unknown>(
  cmd: string,
  args?: Args,
): Promise<T> {
  const a = args ?? {}
  const api = mt()

  switch (cmd) {
    case 'system_info':
      return (await api.system.info()) as T
    case 'pty_spawn': {
      const events = a.events as Channel<unknown> | undefined
      const id = await api.pty.spawn({
        rows: a.rows as number,
        cols: a.cols as number,
        shell: (a.shell as string | null | undefined) ?? undefined,
        args: (a.args as string[] | null | undefined) ?? undefined,
        env: (a.env as Record<string, string> | null | undefined) ?? undefined,
        cwd: (a.cwd as string | null | undefined) ?? undefined,
      })
      if (events) {
        const off = api.pty.onEvent(id, (ev) => events.onmessage?.(ev as unknown))
        events.unsubscribe = off
      }
      return id as T
    }
    case 'ssh_spawn': {
      const events = a.events as Channel<unknown> | undefined
      const id = await api.ssh.spawn({
        rows: a.rows as number,
        cols: a.cols as number,
        hostId: a.hostId as string,
      })
      if (events) {
        const off = api.pty.onEvent(id, (ev) => events.onmessage?.(ev as unknown))
        events.unsubscribe = off
      }
      return id as T
    }
    case 'pty_write':
      return (await api.pty.write(a.id as number, a.data as string)) as T
    case 'pty_resize':
      return (await api.pty.resize(
        a.id as number,
        a.rows as number,
        a.cols as number,
      )) as T
    case 'pty_kill':
      return (await api.pty.kill(a.id as number)) as T
    case 'pty_info':
      return (await api.pty.info(a.id as number)) as T
    case 'pty_recent_output':
      return (await api.pty.recentOutput(
        a.id as number,
        (a.maxBytes as number | undefined) ?? undefined,
      )) as T

    case 'vault_status':
      return (await api.vault.status()) as T
    case 'vault_init':
      return (await api.vault.init(a.masterPassword as string)) as T
    case 'vault_unlock':
      return (await api.vault.unlock(a.masterPassword as string)) as T
    case 'vault_lock':
      return (await api.vault.lock()) as T
    case 'vault_change_password':
      return (await api.vault.changePassword(
        a.oldPassword as string,
        a.newPassword as string,
      )) as T

    case 'host_list':
      return (await api.hosts.list()) as T
    case 'host_save':
      return (await api.hosts.save(
        a.host,
        (a.password as string | null | undefined) ?? undefined,
      )) as T
    case 'host_delete':
      return (await api.hosts.delete(a.id as string)) as T
    case 'host_get_password':
      return (await api.hosts.getPassword(a.id as string)) as T
    case 'host_group_save':
      return (await api.hosts.groupSave(a.group)) as T
    case 'host_group_delete':
      return (await api.hosts.groupDelete(a.id as string)) as T
    case 'host_set_group':
      return (await api.hosts.setGroup(
        a.hostId as string,
        (a.groupId as string | null | undefined) ?? undefined,
      )) as T
    case 'list_ssh_keys':
      return (await api.hosts.listKeys()) as T
    case 'tool_availability':
      return (await api.hosts.toolAvailability()) as T

    case 'ai_stream_complete': {
      const events = a.events as Channel<unknown> | undefined
      const taskId = await api.ai.streamComplete({
        provider: a.provider as string,
        model: a.model as string,
        messages: a.messages as Array<{ role: string; content: string }>,
        system: (a.system as string | null | undefined) ?? undefined,
        maxTokens: (a.maxTokens as number | null | undefined) ?? undefined,
        temperature: (a.temperature as number | null | undefined) ?? undefined,
        baseUrl: (a.baseUrl as string | null | undefined) ?? undefined,
      })
      if (events) {
        const off = api.ai.onEvent(taskId, (ev) => events.onmessage?.(ev as unknown))
        events.unsubscribe = off
      }
      return taskId as T
    }
    case 'ai_cancel':
      return (await api.ai.cancel(a.taskId as number)) as T
    case 'ai_list_models':
      return (await api.ai.listModels(
        a.provider as string,
        (a.baseUrl as string | null | undefined) ?? undefined,
      )) as T
    case 'ai_set_key':
      return (await api.ai.setKey(a.provider as string, a.key as string)) as T
    case 'ai_clear_key':
      return (await api.ai.clearKey(a.provider as string)) as T
    case 'ai_has_key':
      return (await api.ai.hasKey(a.provider as string)) as T

    case 'claude_code_status':
      return (await api.claudeCode.status(a.tabId as number)) as T

    case 'mcp_server_status':
      return (await api.mcp.status()) as T
    case 'mcp_server_start':
      return (await api.mcp.start()) as T
    case 'mcp_server_stop':
      return (await api.mcp.stop()) as T

    default:
      throw new Error(`tauri-shim: unknown command "${cmd}"`)
  }
}

export type UnlistenFn = () => void

export async function listen<T = unknown>(
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _cb: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  throw new Error(`tauri-shim: listen('${eventName}') has no Electron handler`)
}

export interface ShimWindow {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  destroy(): Promise<void>
  isMaximized(): Promise<boolean>
  onResized(cb: () => void): Promise<UnlistenFn>
  onCloseRequested(
    cb: (event: { preventDefault: () => void }) => void,
  ): Promise<UnlistenFn>
}

export function getCurrentWindow(): ShimWindow {
  const api = mt()
  return {
    minimize: () => api.window.minimize(),
    toggleMaximize: async () => {
      await api.window.toggleMaximize()
    },
    close: () => api.window.close(),
    destroy: () => api.window.close(),
    isMaximized: () => api.window.isMaximized(),
    onResized: async (cb) => {
      const off = api.window.onMaximizedChange(() => cb())
      return off
    },
    onCloseRequested: async (_cb) => {
      return () => {}
    },
  }
}

export async function isPermissionGranted(): Promise<boolean> {
  const r = await mt().notification.requestPermission()
  return r === 'granted'
}

export async function requestPermission(): Promise<'granted' | 'denied' | 'default'> {
  return await mt().notification.requestPermission()
}

export function sendNotification(opts: {
  title: string
  body?: string
}): void {
  void mt().notification.send(opts)
}

export async function readText(): Promise<string> {
  return await mt().clipboard.readText()
}

export async function writeText(text: string): Promise<void> {
  await mt().clipboard.writeText(text)
}

interface OpenDialogOpts {
  multiple?: boolean
  directory?: boolean
  defaultPath?: string
  title?: string
  filters?: Array<{ name: string; extensions: string[] }>
}

export async function open(
  opts?: OpenDialogOpts,
): Promise<string | string[] | null> {
  const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = []
  if (opts?.directory) properties.push('openDirectory')
  else properties.push('openFile')
  if (opts?.multiple) properties.push('multiSelections')
  const result = await mt().dialog.open({
    properties,
    defaultPath: opts?.defaultPath,
    title: opts?.title,
    filters: opts?.filters,
  })
  if (!result || result.length === 0) return null
  if (opts?.multiple) return result
  return result[0]
}
