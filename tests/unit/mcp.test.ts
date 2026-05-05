import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  toolDefinitions,
  callTool,
  dispatch,
  handleMessage,
} from '../../electron/main/mcp'
import {
  SESSIONS,
  RingBuffer,
  type PtySession,
} from '../../electron/main/sessions'

function makeSession(overrides: Partial<PtySession> = {}): PtySession {
  return {
    id: 1,
    pid: 0,
    pty: { write: vi.fn() } as any,
    ringBuffer: new RingBuffer(),
    lastActivityMs: Date.now(),
    shell: 'sh',
    ...overrides,
  }
}

describe('toolDefinitions', () => {
  it('returns three tools with name/description/inputSchema and proper required fields', () => {
    const tools = toolDefinitions() as Array<{
      name: string
      description: string
      inputSchema: { type: string; required?: string[] }
    }>
    expect(Array.isArray(tools)).toBe(true)
    expect(tools).toHaveLength(3)
    const byName = new Map(tools.map((t) => [t.name, t]))
    for (const n of ['list_tabs', 'get_output', 'send_keys']) {
      const t = byName.get(n)
      expect(t).toBeTruthy()
      expect(typeof t!.name).toBe('string')
      expect(typeof t!.description).toBe('string')
      expect(t!.inputSchema).toBeTruthy()
    }
    expect(byName.get('get_output')!.inputSchema.required).toContain('tab_id')
    const sendReq = byName.get('send_keys')!.inputSchema.required!
    expect(sendReq).toContain('tab_id')
    expect(sendReq).toContain('text')
  })
})

describe('callTool', () => {
  afterEach(() => {
    SESSIONS.clear()
  })

  it("list_tabs with empty SESSIONS returns JSON {tabs: []}", async () => {
    const out = await callTool('list_tabs', {})
    expect(JSON.parse(out)).toEqual({ tabs: [] })
  })

  it('list_tabs with one stub session returns expected shape (cwd/cmd null for fake pid)', async () => {
    SESSIONS.set(42, makeSession({ id: 42, pid: 999999 }))
    const out = await callTool('list_tabs', {})
    const parsed = JSON.parse(out)
    expect(parsed.tabs).toHaveLength(1)
    expect(parsed.tabs[0]).toEqual({
      tab_id: 42,
      pid: 999999,
      cwd: null,
      cmd: null,
    })
  })

  it("get_output without tab_id throws 'tab_id required'", async () => {
    await expect(callTool('get_output', {})).rejects.toThrow(/tab_id required/)
  })

  it('get_output for non-existent tab throws no such tab', async () => {
    await expect(callTool('get_output', { tab_id: 9999 })).rejects.toThrow(
      /no such tab: 9999/
    )
  })

  it('get_output for existing tab returns ring buffer tail', async () => {
    const s = makeSession({ id: 7 })
    s.ringBuffer.push(Buffer.from('hello world'))
    SESSIONS.set(7, s)
    expect(await callTool('get_output', { tab_id: 7 })).toBe('hello world')
  })

  it('get_output honors max_bytes', async () => {
    const s = makeSession({ id: 7 })
    s.ringBuffer.push(Buffer.from('hello world'))
    SESSIONS.set(7, s)
    expect(await callTool('get_output', { tab_id: 7, max_bytes: 5 })).toBe('world')
  })

  it("send_keys without tab_id throws 'tab_id required'", async () => {
    await expect(callTool('send_keys', { text: 'hi' })).rejects.toThrow(
      /tab_id required/
    )
  })

  it("send_keys without text throws 'text required'", async () => {
    await expect(callTool('send_keys', { tab_id: 1 })).rejects.toThrow(/text required/)
  })

  it("send_keys returns 'ok (N bytes)' and calls pty.write with text (no newline when run!=true)", async () => {
    const write = vi.fn()
    SESSIONS.set(3, makeSession({ id: 3, pty: { write } as any }))
    const res = await callTool('send_keys', { tab_id: 3, text: 'ls' })
    expect(res).toBe('ok (2 bytes)')
    expect(write).toHaveBeenCalledWith('ls')
  })

  it("send_keys with run=true appends newline and reports correct byte count", async () => {
    const write = vi.fn()
    SESSIONS.set(4, makeSession({ id: 4, pty: { write } as any }))
    const res = await callTool('send_keys', { tab_id: 4, text: 'ls', run: true })
    expect(res).toBe('ok (3 bytes)')
    expect(write).toHaveBeenCalledWith('ls\n')
  })

  it('send_keys when pty.write throws -> throws write failed: <id>', async () => {
    const write = vi.fn().mockImplementation(() => {
      throw new Error('broken pipe')
    })
    SESSIONS.set(9, makeSession({ id: 9, pty: { write } as any }))
    await expect(callTool('send_keys', { tab_id: 9, text: 'ls' })).rejects.toThrow(
      /write failed: 9/
    )
  })

  it('unknown tool name throws unknown tool: <name>', async () => {
    await expect(callTool('bogus', {})).rejects.toThrow(/unknown tool: bogus/)
  })
})

describe('dispatch', () => {
  afterEach(() => {
    SESSIONS.clear()
  })

  it("'initialize' returns protocol info", async () => {
    const r = (await dispatch('initialize', null)) as {
      result: {
        protocolVersion: string
        capabilities: { tools: unknown }
        serverInfo: { name: string; version: string }
      }
    }
    expect(r.result.protocolVersion).toBe('2024-11-05')
    expect(r.result.capabilities.tools).toEqual({})
    expect(r.result.serverInfo.name).toBe('mterminal')
    expect(typeof r.result.serverInfo.version).toBe('string')
  })

  it("'tools/list' returns wrapper with tools matching toolDefinitions()", async () => {
    const r = (await dispatch('tools/list', null)) as {
      result: { tools: unknown }
    }
    expect(r.result.tools).toEqual(toolDefinitions())
  })

  it("'tools/call' with valid args returns success result content", async () => {
    const r = (await dispatch('tools/call', {
      name: 'list_tabs',
      arguments: {},
    })) as {
      result: { content: Array<{ type: string; text: string }>; isError: boolean }
    }
    expect(r.result.isError).toBe(false)
    expect(r.result.content).toHaveLength(1)
    expect(r.result.content[0]!.type).toBe('text')
    expect(JSON.parse(r.result.content[0]!.text)).toEqual({ tabs: [] })
  })

  it("'tools/call' with bad args returns {error: {code: -32000, message}}", async () => {
    const r = (await dispatch('tools/call', {
      name: 'get_output',
      arguments: {},
    })) as { error: { code: number; message: string } }
    expect(r.error).toBeTruthy()
    expect(r.error.code).toBe(-32000)
    expect(r.error.message).toMatch(/tab_id required/)
    expect((r as any).result).toBeUndefined()
  })

  it("'ping' returns {result: {}}", async () => {
    expect(await dispatch('ping', null)).toEqual({ result: {} })
  })

  it("'notifications/initialized' returns {result: null}", async () => {
    expect(await dispatch('notifications/initialized', null)).toEqual({
      result: null,
    })
  })

  it('unknown method returns {error: {code: -32601, message: method not found: ...}}', async () => {
    const r = (await dispatch('frobnicate', null)) as {
      error: { code: number; message: string }
    }
    expect(r.error.code).toBe(-32601)
    expect(r.error.message).toBe('method not found: frobnicate')
  })
})

describe('handleMessage', () => {
  afterEach(() => {
    SESSIONS.clear()
  })

  it('valid JSON-RPC request returns success envelope as a string', async () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    const out = await handleMessage(raw)
    expect(typeof out).toBe('string')
    const parsed = JSON.parse(out!)
    expect(parsed).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
  })

  it('notification (no id) returns null', async () => {
    const raw = JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
    expect(await handleMessage(raw)).toBeNull()
  })

  it('notification (id: undefined explicitly absent) returns null', async () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', method: 'ping' })
    expect(await handleMessage(raw)).toBeNull()
  })

  it('malformed JSON returns parse-error envelope with code -32700', async () => {
    const out = await handleMessage('not json{{{')
    expect(typeof out).toBe('string')
    const parsed = JSON.parse(out!)
    expect(parsed.jsonrpc).toBe('2.0')
    expect(parsed.id).toBeNull()
    expect(parsed.error.code).toBe(-32700)
    expect(parsed.error.message).toMatch(/parse error/)
  })

  it('unknown method with id=1 returns error envelope code -32601, id 1', async () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'frobnicate' })
    const out = await handleMessage(raw)
    const parsed = JSON.parse(out!)
    expect(parsed.id).toBe(1)
    expect(parsed.error.code).toBe(-32601)
    expect(parsed.error.message).toMatch(/method not found: frobnicate/)
  })

  it('id: null is treated as a request (returns a response)', async () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: null, method: 'ping' })
    const out = await handleMessage(raw)
    expect(typeof out).toBe('string')
    const parsed = JSON.parse(out!)
    expect(parsed.id).toBeNull()
    expect(parsed.result).toEqual({})
  })
})
