import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { __invoke, __reset } from '../mocks/electron'
import { registerVaultHandlers } from '../../electron/main/vault'
import { registerExtensionsBridge } from '../../electron/main/extensions/ipc-bridge'

const TEST_TIMEOUT = 30000

let tmpDir: string

function freshTmpDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-extvault-test-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const stubRegistry = { list: () => [] } as unknown as Parameters<
  typeof registerExtensionsBridge
>[0]['registry']

const stubHost = {
  setEnabled: async () => {},
  setTrusted: async () => {},
  reload: async () => {},
  uninstall: async () => {},
  scanAndSync: async () => {},
} as unknown as Parameters<typeof registerExtensionsBridge>[0]['host']

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await __invoke(channel, ...args)
}

describe('ext:vault:* IPC handlers', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()

    delete (globalThis as unknown as Record<symbol, unknown>)[
      Symbol.for('mTerminal.extensionBridge.registered')
    ]
    registerVaultHandlers()
    registerExtensionsBridge({ registry: stubRegistry, host: stubHost })
  })

  afterEach(async () => {
    try {
      await invoke('vault:lock')
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it(
    'ext:vault:get throws when vault is locked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')
      await expect(
        invoke('ext:vault:get', { extId: 'foo', key: 'k' })
      ).rejects.toThrow(/vault locked/)
    }
  )

  it(
    'set + get + has + keys round-trip',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('ext:vault:set', { extId: 'foo', key: 'k1', value: 'v1' })
      expect(await invoke('ext:vault:get', { extId: 'foo', key: 'k1' })).toBe('v1')
      expect(await invoke('ext:vault:has', { extId: 'foo', key: 'k1' })).toBe(true)
      expect(await invoke('ext:vault:has', { extId: 'foo', key: 'missing' })).toBe(false)
      expect(await invoke('ext:vault:keys', { extId: 'foo' })).toEqual(['k1'])
    }
  )

  it(
    'delete removes the entry',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('ext:vault:set', { extId: 'foo', key: 'k', value: 'v' })
      await invoke('ext:vault:delete', { extId: 'foo', key: 'k' })
      expect(await invoke('ext:vault:get', { extId: 'foo', key: 'k' })).toBeNull()
    }
  )

  it(
    'isolates secrets between extensions',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('ext:vault:set', { extId: 'a', key: 'k', value: 'a-val' })
      await invoke('ext:vault:set', { extId: 'b', key: 'k', value: 'b-val' })
      expect(await invoke('ext:vault:get', { extId: 'a', key: 'k' })).toBe('a-val')
      expect(await invoke('ext:vault:get', { extId: 'b', key: 'k' })).toBe('b-val')
    }
  )

  it(
    'rejects malformed payloads',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await expect(invoke('ext:vault:get', null)).rejects.toThrow(/requires/)
      await expect(invoke('ext:vault:set', { extId: 'a', key: 'k', value: 1 })).rejects.toThrow(
        /string value/
      )
      await expect(invoke('ext:vault:keys', null)).rejects.toThrow(/requires/)
    }
  )
})
