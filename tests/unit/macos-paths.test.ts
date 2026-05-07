import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

const ORIGINAL_PLATFORM = process.platform

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

function restorePlatform(): void {
  Object.defineProperty(process, 'platform', {
    value: ORIGINAL_PLATFORM,
    configurable: true,
  })
}

describe('vault.configDir cross-platform', () => {
  let tmpHome: string
  let savedXdg: string | undefined
  let savedAppData: string | undefined

  beforeEach(() => {
    tmpHome = path.join(
      os.tmpdir(),
      `mt-paths-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    )
    fs.mkdirSync(tmpHome, { recursive: true })
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    savedXdg = process.env.XDG_CONFIG_HOME
    savedAppData = process.env.APPDATA
    delete process.env.XDG_CONFIG_HOME
    delete process.env.APPDATA
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (savedXdg !== undefined) process.env.XDG_CONFIG_HOME = savedXdg
    if (savedAppData !== undefined) process.env.APPDATA = savedAppData
    restorePlatform()
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    } catch {}
  })

  it('darwin: ~/Library/Application Support/mterminal', async () => {
    setPlatform('darwin')
    vi.resetModules()
    const { configDir } = await import('../../electron/main/vault')
    const dir = configDir()
    expect(dir).toBe(
      path.join(tmpHome, 'Library', 'Application Support', 'mterminal')
    )
    expect(fs.existsSync(dir)).toBe(true)
  })

  it('linux: ~/.config/mterminal when XDG_CONFIG_HOME unset', async () => {
    setPlatform('linux')
    vi.resetModules()
    const { configDir } = await import('../../electron/main/vault')
    const dir = configDir()
    expect(dir).toBe(path.join(tmpHome, '.config', 'mterminal'))
  })

  it('linux: respects XDG_CONFIG_HOME when set', async () => {
    setPlatform('linux')
    process.env.XDG_CONFIG_HOME = path.join(tmpHome, 'xdg')
    vi.resetModules()
    const { configDir } = await import('../../electron/main/vault')
    const dir = configDir()
    expect(dir).toBe(path.join(tmpHome, 'xdg', 'mterminal'))
  })

  it('win32: %APPDATA%/mterminal', async () => {
    setPlatform('win32')
    process.env.APPDATA = path.join(tmpHome, 'AppData', 'Roaming')
    vi.resetModules()
    const { configDir } = await import('../../electron/main/vault')
    const dir = configDir()
    expect(dir).toBe(
      path.join(tmpHome, 'AppData', 'Roaming', 'mterminal')
    )
  })
})

describe('mcp.computeSocketPath cross-platform', () => {
  let tmpHome: string

  beforeEach(() => {
    tmpHome = path.join(
      os.tmpdir(),
      `mt-mcp-paths-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    )
    fs.mkdirSync(tmpHome, { recursive: true })
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    restorePlatform()
    try {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    } catch {}
  })

  it('darwin: ~/Library/Caches/mterminal/mcp-<user>.sock', async () => {
    setPlatform('darwin')
    vi.resetModules()
    const { computeSocketPath } = await import('../../electron/main/mcp')
    const sock = computeSocketPath()
    expect(sock).toMatch(/Library\/Caches\/mterminal\/mcp-.+\.sock$/)
    expect(sock.startsWith(tmpHome)).toBe(true)
    expect(fs.existsSync(path.dirname(sock))).toBe(true)
  })

  it('linux: uses XDG_RUNTIME_DIR when set', async () => {
    setPlatform('linux')
    const xdg = path.join(tmpHome, 'run')
    fs.mkdirSync(xdg, { recursive: true })
    process.env.XDG_RUNTIME_DIR = xdg
    vi.resetModules()
    const { computeSocketPath } = await import('../../electron/main/mcp')
    const sock = computeSocketPath()
    expect(sock.startsWith(xdg)).toBe(true)
    expect(sock).toMatch(/mterminal-mcp-.+\.sock$/)
    delete process.env.XDG_RUNTIME_DIR
  })
})
