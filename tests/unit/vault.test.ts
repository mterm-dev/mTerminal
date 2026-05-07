import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { __invoke, __reset } from '../mocks/electron'



async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  return await __invoke(channel, ...args)
}
import {
  registerVaultHandlers,
  getAiKey,
  setAiKey,
  clearAiKey,
  getSecret,
  setSecret,
  clearSecret,
  listSecretKeys,
  getExtSecret,
  setExtSecret,
  clearExtSecret,
  listExtSecretKeys,
  purgeExtSecrets,
  isUnlocked,
  zero,
} from '../../electron/main/vault'

const TEST_TIMEOUT = 30000

let tmpDir: string

function freshTmpDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `mterminal-vault-test-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
  )
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

describe('vault', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()
    registerVaultHandlers()
  })

  afterEach(async () => {
    
    try {
      await invoke('vault:lock')
    } catch {
      
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      
    }
  })

  it(
    'status on fresh tmp dir returns exists:false unlocked:false',
    { timeout: TEST_TIMEOUT },
    async () => {
      const status = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(status).toEqual({ exists: false, unlocked: false, dev: false })
    }
  )

  it(
    'init with empty password throws',
    { timeout: TEST_TIMEOUT },
    async () => {
      await expect(
        invoke('vault:init', { masterPassword: '' })
      ).rejects.toThrow(/master password cannot be empty/)
    }
  )

  it(
    'init with pw creates file and unlocks state',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      const status = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(status).toEqual({ exists: true, unlocked: true, dev: false })
      expect(
        fs.existsSync(path.join(tmpDir, 'mterminal', 'vault.bin'))
      ).toBe(true)
    }
  )

  it(
    'init twice — second throws vault already exists',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await expect(
        invoke('vault:init', { masterPassword: 'pw' })
      ).rejects.toThrow(/vault already exists/)
    }
  )

  it(
    'unlock with wrong password throws; right password succeeds; status updates',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')

      let lockedStatus = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(lockedStatus).toEqual({ exists: true, unlocked: false, dev: false })

      await expect(
        invoke('vault:unlock', { masterPassword: 'wrong' })
      ).rejects.toThrow(/decrypt failed/)

      
      const status = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(status.unlocked).toBe(false)

      await invoke('vault:unlock', { masterPassword: 'pw' })
      const unlocked = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(unlocked).toEqual({ exists: true, unlocked: true, dev: false })
    }
  )

  it(
    'lock clears unlocked state',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      expect(isUnlocked()).toBe(true)
      await invoke('vault:lock')
      expect(isUnlocked()).toBe(false)
      const status = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
      }
      expect(status).toEqual({ exists: true, unlocked: false, dev: false })
    }
  )

  it(
    'ai key round-trips across lock+unlock',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk-ant-xxx')
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')

      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })

      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')
      expect(getAiKey('missing')).toBeNull()
    }
  )

  it(
    'change-password: wrong old throws; right old succeeds; old no longer unlocks; payload preserved',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk-ant-xxx')

      await expect(
        invoke('vault:change-password', {
          oldPassword: 'wrong',
          newPassword: 'new-pw',
        })
      ).rejects.toThrow(/decrypt failed/)

      await invoke('vault:change-password', {
        oldPassword: 'pw',
        newPassword: 'new-pw',
      })

      
      expect(isUnlocked()).toBe(true)
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')

      
      await invoke('vault:lock')
      await expect(
        invoke('vault:unlock', { masterPassword: 'pw' })
      ).rejects.toThrow(/decrypt failed/)
      await invoke('vault:unlock', { masterPassword: 'new-pw' })
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')
    }
  )

  it(
    'change-password with empty new password throws',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await expect(
        invoke('vault:change-password', {
          oldPassword: 'pw',
          newPassword: '',
        })
      ).rejects.toThrow(/new master password cannot be empty/)
    }
  )

  it(
    'getAiKey/setAiKey throw when locked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')
      expect(() => getAiKey('anthropic')).toThrow(/vault locked/)
      expect(() => setAiKey('anthropic', 'k')).toThrow(/vault locked/)
      expect(() => clearAiKey('anthropic')).toThrow(/vault locked/)
    }
  )

  it(
    'clearAiKey removes entries',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk-ant-xxx')
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')

      clearAiKey('anthropic')
      expect(getAiKey('anthropic')).toBeNull()


      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })
      expect(getAiKey('anthropic')).toBeNull()
    }
  )
})

describe('vault generic API', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()
    registerVaultHandlers()
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
    'getSecret returns null for missing key',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      expect(getSecret('ai_keys', 'nope')).toBeNull()
      expect(getSecret('passwords', 'nope')).toBeNull()
      expect(getSecret('ext:foo', 'nope')).toBeNull()
    }
  )

  it(
    'setSecret/getSecret round-trip survives lock/unlock',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setSecret('ai_keys', 'anthropic', 'sk-x')
      setSecret('passwords', 'host-a', 'pwd')
      setSecret('ext:plug', 'token', 'gh_y')
      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })
      expect(getSecret('ai_keys', 'anthropic')).toBe('sk-x')
      expect(getSecret('passwords', 'host-a')).toBe('pwd')
      expect(getSecret('ext:plug', 'token')).toBe('gh_y')
    }
  )

  it(
    'clearSecret removes the entry',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setSecret('ai_keys', 'openai', 'sk-1')
      clearSecret('ai_keys', 'openai')
      expect(getSecret('ai_keys', 'openai')).toBeNull()
    }
  )

  it(
    'listSecretKeys returns only keys for the requested namespace',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setSecret('ai_keys', 'a', '1')
      setSecret('ai_keys', 'b', '2')
      setSecret('passwords', 'h', 'p')
      setSecret('ext:foo', 'k1', 'v')
      expect(listSecretKeys('ai_keys').sort()).toEqual(['a', 'b'])
      expect(listSecretKeys('passwords')).toEqual(['h'])
      expect(listSecretKeys('ext:foo')).toEqual(['k1'])
      expect(listSecretKeys('ext:bar')).toEqual([])
    }
  )

  it(
    'invalid namespace throws',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      expect(() => getSecret('bogus', 'k')).toThrow(/invalid vault namespace/)
      expect(() => setSecret('bogus', 'k', 'v')).toThrow(/invalid vault namespace/)
      expect(() => getSecret('ext:', 'k')).toThrow(/empty extension id/)
    }
  )

  it(
    'all generic ops throw when locked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')
      expect(() => getSecret('ai_keys', 'a')).toThrow(/vault locked/)
      expect(() => setSecret('ai_keys', 'a', 'v')).toThrow(/vault locked/)
      expect(() => clearSecret('ai_keys', 'a')).toThrow(/vault locked/)
      expect(() => listSecretKeys('ai_keys')).toThrow(/vault locked/)
    }
  )
})

describe('vault extension namespace', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()
    registerVaultHandlers()
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
    'isolates secrets across extensions',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setExtSecret('ext-a', 'k', 'v-a')
      setExtSecret('ext-b', 'k', 'v-b')
      expect(getExtSecret('ext-a', 'k')).toBe('v-a')
      expect(getExtSecret('ext-b', 'k')).toBe('v-b')
      expect(listExtSecretKeys('ext-a')).toEqual(['k'])
      expect(listExtSecretKeys('ext-c')).toEqual([])
    }
  )

  it(
    'clearExtSecret only affects target extension',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setExtSecret('ext-a', 'k', 'v')
      setExtSecret('ext-b', 'k', 'v')
      clearExtSecret('ext-a', 'k')
      expect(getExtSecret('ext-a', 'k')).toBeNull()
      expect(getExtSecret('ext-b', 'k')).toBe('v')
    }
  )

  it(
    'purgeExtSecrets removes only target extension and leaves core untouched',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk')
      setExtSecret('ext-a', 'k', 'v')
      setExtSecret('ext-b', 'k', 'v')
      purgeExtSecrets('ext-a')
      expect(listExtSecretKeys('ext-a')).toEqual([])
      expect(listExtSecretKeys('ext-b')).toEqual(['k'])
      expect(getAiKey('anthropic')).toBe('sk')
    }
  )

  it(
    'ext secrets persist across lock/unlock cycle',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setExtSecret('ext-a', 'k', 'persistent')
      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })
      expect(getExtSecret('ext-a', 'k')).toBe('persistent')
    }
  )

  it(
    'ext ops throw when locked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')
      expect(() => getExtSecret('ext-a', 'k')).toThrow(/vault locked/)
      expect(() => setExtSecret('ext-a', 'k', 'v')).toThrow(/vault locked/)
      expect(() => listExtSecretKeys('ext-a')).toThrow(/vault locked/)
      expect(() => purgeExtSecrets('ext-a')).toThrow(/vault locked/)
    }
  )
})

describe('vault:dev-reset', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()
    registerVaultHandlers()
  })

  afterEach(async () => {
    delete process.env.NODE_ENV
    delete process.env.ELECTRON_RENDERER_URL
    try {
      await invoke('vault:lock')
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  })

  it(
    'in dev mode uses vault.dev.bin and lets dev-reset delete it',
    { timeout: TEST_TIMEOUT },
    async () => {
      process.env.NODE_ENV = 'development'
      __reset()
      registerVaultHandlers()
      await invoke('vault:init', { masterPassword: 'pw' })
      const devPath = path.join(tmpDir, 'mterminal', 'vault.dev.bin')
      const prodPath = path.join(tmpDir, 'mterminal', 'vault.bin')
      expect(fs.existsSync(devPath)).toBe(true)
      expect(fs.existsSync(prodPath)).toBe(false)

      await invoke('vault:dev-reset')
      expect(fs.existsSync(devPath)).toBe(false)
      const status = (await invoke('vault:status')) as {
        exists: boolean
        unlocked: boolean
        dev: boolean
      }
      expect(status).toEqual({ exists: false, unlocked: false, dev: true })
    }
  )

  it(
    'rejects dev-reset outside development mode',
    { timeout: TEST_TIMEOUT },
    async () => {
      delete process.env.NODE_ENV
      delete process.env.ELECTRON_RENDERER_URL
      __reset()
      registerVaultHandlers()
      await invoke('vault:init', { masterPassword: 'pw' })
      await expect(invoke('vault:dev-reset')).rejects.toThrow(
        /only available in development/
      )
    }
  )
})

describe('vault backwards compat with old format', () => {
  beforeEach(() => {
    tmpDir = freshTmpDir()
    process.env.XDG_CONFIG_HOME = tmpDir
    __reset()
    registerVaultHandlers()
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
    'unlocks pre-1.1 vault file (no ext field) without throwing; ext namespace seeds empty',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk-old')
      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })
      expect(getAiKey('anthropic')).toBe('sk-old')
      expect(getExtSecret('ext-fresh', 'anything')).toBeNull()
      expect(listExtSecretKeys('ext-fresh')).toEqual([])
      setExtSecret('ext-fresh', 'k', 'v')
      expect(getExtSecret('ext-fresh', 'k')).toBe('v')
    }
  )
})

describe('zero', () => {
  it('fills every byte of the buffer with 0', () => {
    const buf = new Uint8Array(32)
    for (let i = 0; i < buf.length; i++) buf[i] = (i + 1) & 0xff
    zero(buf)
    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBe(0)
    }
  })

  it('works on an already-zeroed buffer without throwing', () => {
    const buf = new Uint8Array(16)
    expect(() => zero(buf)).not.toThrow()
    for (let i = 0; i < buf.length; i++) {
      expect(buf[i]).toBe(0)
    }
  })
})
