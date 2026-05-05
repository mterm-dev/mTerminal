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
  getHostPassword,
  setHostPassword,
  clearHostPassword,
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
      expect(status).toEqual({ exists: false, unlocked: false })
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
      expect(status).toEqual({ exists: true, unlocked: true })
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
      expect(lockedStatus).toEqual({ exists: true, unlocked: false })

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
      expect(unlocked).toEqual({ exists: true, unlocked: true })
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
      expect(status).toEqual({ exists: true, unlocked: false })
    }
  )

  it(
    'host password and ai key round-trip across lock+unlock',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setHostPassword('host-1', 'sekrit')
      setAiKey('anthropic', 'sk-ant-xxx')
      expect(getHostPassword('host-1')).toBe('sekrit')
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')

      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })

      expect(getHostPassword('host-1')).toBe('sekrit')
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')
      expect(getHostPassword('missing')).toBeNull()
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
    'getAiKey/setAiKey/getHostPassword/setHostPassword throw when locked',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      await invoke('vault:lock')
      expect(() => getAiKey('anthropic')).toThrow(/vault locked/)
      expect(() => setAiKey('anthropic', 'k')).toThrow(/vault locked/)
      expect(() => getHostPassword('h')).toThrow(/vault locked/)
      expect(() => setHostPassword('h', 'p')).toThrow(/vault locked/)
      expect(() => clearAiKey('anthropic')).toThrow(/vault locked/)
      expect(() => clearHostPassword('h')).toThrow(/vault locked/)
    }
  )

  it(
    'clearAiKey and clearHostPassword remove entries',
    { timeout: TEST_TIMEOUT },
    async () => {
      await invoke('vault:init', { masterPassword: 'pw' })
      setAiKey('anthropic', 'sk-ant-xxx')
      setHostPassword('host-1', 'sekrit')
      expect(getAiKey('anthropic')).toBe('sk-ant-xxx')
      expect(getHostPassword('host-1')).toBe('sekrit')

      clearAiKey('anthropic')
      clearHostPassword('host-1')
      expect(getAiKey('anthropic')).toBeNull()
      expect(getHostPassword('host-1')).toBeNull()


      await invoke('vault:lock')
      await invoke('vault:unlock', { masterPassword: 'pw' })
      expect(getAiKey('anthropic')).toBeNull()
      expect(getHostPassword('host-1')).toBeNull()
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
