import { describe, it, expect } from 'vitest'
import {
  buildWslSpawnArgs,
  decodeWslListOutput,
  linuxPathToUnc,
  parseWslDistros,
  parseWslProcOutput,
} from '../../electron/main/wsl'

describe('parseWslDistros', () => {
  it('parses standard wsl -l -v output', () => {
    const text =
      '  NAME            STATE           VERSION\n' +
      '* Ubuntu          Running         2\n' +
      '  Debian          Stopped         2\n'
    const list = parseWslDistros(text)
    expect(list).toEqual([
      { name: 'Ubuntu', default: true, version: 2, state: 'Running' },
      { name: 'Debian', default: false, version: 2, state: 'Stopped' },
    ])
  })

  it('skips docker-desktop entries', () => {
    const text =
      '  NAME              STATE           VERSION\n' +
      '* Ubuntu            Running         2\n' +
      '  docker-desktop    Stopped         2\n' +
      '  docker-desktop-data Stopped       2\n'
    const list = parseWslDistros(text)
    expect(list.map((d) => d.name)).toEqual(['Ubuntu'])
  })

  it('handles trailing CRs and BOM-stripped UTF-16 leftovers', () => {
    const text =
      '  NAME      STATE     VERSION\r\n' +
      '* Ubuntu    Running   2\r\n'
    const list = parseWslDistros(text)
    expect(list).toEqual([
      { name: 'Ubuntu', default: true, version: 2, state: 'Running' },
    ])
  })

  it('returns empty list when only header is present', () => {
    expect(parseWslDistros('  NAME  STATE  VERSION\n')).toEqual([])
  })

  it('treats version string different from "2" as 1', () => {
    const text =
      '  NAME      STATE     VERSION\n' +
      '* Legacy    Running   1\n'
    expect(parseWslDistros(text)[0]?.version).toBe(1)
  })
})

describe('decodeWslListOutput', () => {
  it('decodes UTF-16LE buffer with BOM', () => {
    const text = '* Ubuntu Running 2\n'
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(text, 'utf16le'),
    ])
    expect(decodeWslListOutput(buf)).toBe(text)
  })

  it('decodes UTF-16LE buffer without BOM (high zero byte heuristic)', () => {
    const text = '* Ubuntu Running 2\n'
    const buf = Buffer.from(text, 'utf16le')
    expect(decodeWslListOutput(buf)).toBe(text)
  })

  it('decodes UTF-8 when WSL_UTF8=1 is honored', () => {
    const text = '* Ubuntu Running 2\n'
    const buf = Buffer.from(text, 'utf8')
    expect(decodeWslListOutput(buf)).toBe(text)
  })
})

describe('buildWslSpawnArgs', () => {
  it('returns null off Windows', () => {
    if (process.platform === 'win32') return
    expect(buildWslSpawnArgs('Ubuntu', null)).toBeNull()
  })
})

describe('parseWslProcOutput', () => {
  it('parses CWD and CMD lines', () => {
    const out = 'CWD=/home/u/proj\nCMD=fish\n'
    expect(parseWslProcOutput(out)).toEqual({ cwd: '/home/u/proj', cmd: 'fish' })
  })

  it('returns nulls for empty values', () => {
    const out = 'CWD=\nCMD=\n'
    expect(parseWslProcOutput(out)).toEqual({ cwd: null, cmd: null })
  })

  it('ignores unrelated lines', () => {
    const out = 'noise\nCWD=/x\nCMD=bash\nmore noise\n'
    expect(parseWslProcOutput(out)).toEqual({ cwd: '/x', cmd: 'bash' })
  })
})

describe('linuxPathToUnc', () => {
  it('maps a Linux path to the WSL UNC form', () => {
    expect(linuxPathToUnc('Ubuntu', '/home/alice')).toBe(
      '\\\\wsl$\\Ubuntu\\home\\alice',
    )
  })

  it('collapses redundant slashes', () => {
    expect(linuxPathToUnc('Ubuntu', '//home///alice/')).toBe(
      '\\\\wsl$\\Ubuntu\\home\\alice\\',
    )
  })

  it('returns empty string for empty input', () => {
    expect(linuxPathToUnc('Ubuntu', '')).toBe('')
  })
})
