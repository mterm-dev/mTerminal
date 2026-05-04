// Transport: Unix domain socket, JSON-RPC 2.0, line-delimited.
// Connect e.g.:
//   claude mcp add mterminal --transport stdio \
//     "socat - UNIX-CONNECT:$XDG_RUNTIME_DIR/mterminal-mcp-$USER.sock"

import { ipcMain } from 'electron'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promises as fsp } from 'node:fs'
import {
  listSessionIds,
  sessionOutput,
  sessionPid,
  sessionWrite,
} from './sessions'
import { readProcInfo } from './pty'

interface McpStatus {
  running: boolean
  socketPath: string | null
}

let server: net.Server | null = null
let socketPath: string | null = null

function computeSocketPath(): string {
  const base =
    process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? '/tmp'
  const user = os.userInfo().username || 'user'
  return path.join(base, `mterminal-mcp-${user}.sock`)
}

interface JsonRpcRequest {
  jsonrpc?: string
  id?: number | string | null
  method?: string
  params?: unknown
}

function successResponse(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result })
}

function errorResponse(id: unknown, code: number, message: string): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  })
}

function toolDefinitions(): unknown {
  return [
    {
      name: 'list_tabs',
      description:
        'List all open terminal sessions in mTerminal with their cwd and current command.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_output',
      description:
        "Read recent stdout/stderr output from a given tab's PTY (up to 64KB ring buffer).",
      inputSchema: {
        type: 'object',
        required: ['tab_id'],
        properties: {
          tab_id: { type: 'integer', description: 'Session id from list_tabs' },
          max_bytes: {
            type: 'integer',
            description: 'Max bytes to return, default 4096',
          },
        },
      },
    },
    {
      name: 'send_keys',
      description:
        "Write text to a tab's PTY. Set run=true to append a newline (execute the line).",
      inputSchema: {
        type: 'object',
        required: ['tab_id', 'text'],
        properties: {
          tab_id: { type: 'integer' },
          text: { type: 'string' },
          run: { type: 'boolean', default: false },
        },
      },
    },
  ]
}

function callTool(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'list_tabs': {
      const tabs = listSessionIds().map((sid) => {
        const pid = sessionPid(sid)
        const info = pid != null ? readProcInfo(pid) : { cwd: null, cmd: null }
        return {
          tab_id: sid,
          pid,
          cwd: info.cwd,
          cmd: info.cmd,
        }
      })
      return JSON.stringify({ tabs }, null, 2)
    }
    case 'get_output': {
      const tabId = Number(args['tab_id'])
      if (!Number.isFinite(tabId)) throw new Error('tab_id required')
      const maxBytes =
        args['max_bytes'] != null ? Number(args['max_bytes']) : 4096
      const out = sessionOutput(tabId, maxBytes)
      if (out == null) throw new Error(`no such tab: ${tabId}`)
      return out
    }
    case 'send_keys': {
      const tabId = Number(args['tab_id'])
      if (!Number.isFinite(tabId)) throw new Error('tab_id required')
      const text = args['text']
      if (typeof text !== 'string') throw new Error('text required')
      const run = args['run'] === true
      const payload = run ? `${text}\n` : text
      const ok = sessionWrite(tabId, payload)
      if (!ok) throw new Error(`write failed: ${tabId}`)
      return `ok (${Buffer.byteLength(payload)} bytes)`
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

function dispatch(
  method: string,
  params: unknown
): { result?: unknown; error?: { code: number; message: string } } {
  switch (method) {
    case 'initialize':
      return {
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'mterminal', version: '0.1.0' },
        },
      }
    case 'notifications/initialized':
      return { result: null }
    case 'tools/list':
      return { result: { tools: toolDefinitions() } }
    case 'tools/call': {
      const p = (params ?? {}) as Record<string, unknown>
      const name = typeof p['name'] === 'string' ? (p['name'] as string) : ''
      const argsObj =
        p['arguments'] && typeof p['arguments'] === 'object'
          ? (p['arguments'] as Record<string, unknown>)
          : {}
      try {
        const text = callTool(name, argsObj)
        return {
          result: {
            content: [{ type: 'text', text }],
            isError: false,
          },
        }
      } catch (e) {
        return {
          error: { code: -32000, message: (e as Error).message },
        }
      }
    }
    case 'ping':
      return { result: {} }
    default:
      return {
        error: { code: -32601, message: `method not found: ${method}` },
      }
  }
}

function handleMessage(raw: string): string | null {
  let req: JsonRpcRequest
  try {
    req = JSON.parse(raw) as JsonRpcRequest
  } catch (e) {
    return errorResponse(null, -32700, `parse error: ${(e as Error).message}`)
  }
  const isNotification = !('id' in req) || req.id === undefined
  const id = req.id ?? null
  const method = typeof req.method === 'string' ? req.method : ''
  const result = dispatch(method, req.params)
  if (isNotification) return null
  if (result.error) return errorResponse(id, result.error.code, result.error.message)
  return successResponse(id, result.result)
}

function attachClient(socket: net.Socket): void {
  let buf = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const resp = handleMessage(line)
      if (resp != null) {
        try {
          socket.write(resp + '\n')
        } catch {}
      }
    }
  })
  socket.on('error', () => {})
}

export async function startServer(): Promise<McpStatus> {
  if (process.platform === 'win32') {
    throw new Error('MCP server not yet supported on Windows')
  }
  if (server) {
    return { running: true, socketPath }
  }
  const sp = computeSocketPath()
  try {
    await fsp.unlink(sp)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
    }
  }
  await new Promise<void>((resolve, reject) => {
    const s = net.createServer(attachClient)
    s.once('error', reject)
    s.listen(sp, () => {
      s.removeListener('error', reject)
      server = s
      socketPath = sp
      resolve()
    })
  })
  // eslint-disable-next-line no-console
  console.error(`[mcp] listening on ${sp}`)
  return { running: true, socketPath }
}

export async function stopServer(): Promise<McpStatus> {
  const s = server
  const sp = socketPath
  server = null
  socketPath = null
  if (s) {
    await new Promise<void>((resolve) => s.close(() => resolve()))
  }
  if (sp) {
    try {
      await fsp.unlink(sp)
    } catch {}
  }
  return { running: false, socketPath: null }
}

export function statusServer(): McpStatus {
  return { running: server != null, socketPath }
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp:status', (): McpStatus => statusServer())
  ipcMain.handle('mcp:start', async (): Promise<McpStatus> => startServer())
  ipcMain.handle('mcp:stop', async (): Promise<McpStatus> => stopServer())
}
