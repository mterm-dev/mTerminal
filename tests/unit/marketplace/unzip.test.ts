import { describe, it, expect } from 'vitest'
import { zipSync } from 'fflate'
import { safeUnzip, isUnsafePath, MAX_ENTRIES, MAX_UNZIPPED_BYTES, UnzipError } from '../../../electron/main/marketplace/unzip'

describe('isUnsafePath', () => {
  it('rejects path traversal', () => {
    expect(isUnsafePath('../../etc/passwd')).toBe(true)
    expect(isUnsafePath('../foo')).toBe(true)
    expect(isUnsafePath('foo/../../bar')).toBe(true)
  })

  it('rejects absolute paths', () => {
    expect(isUnsafePath('/etc/passwd')).toBe(true)
    expect(isUnsafePath('\\windows\\system32')).toBe(true)
    expect(isUnsafePath('C:\\Users\\foo')).toBe(true)
    expect(isUnsafePath('c:/foo')).toBe(true)
  })

  it('accepts normal relative paths', () => {
    expect(isUnsafePath('package.json')).toBe(false)
    expect(isUnsafePath('dist/main.cjs')).toBe(false)
    expect(isUnsafePath('foo/bar/baz.txt')).toBe(false)
  })
})

describe('safeUnzip', () => {
  it('unzips a valid archive', () => {
    const buf = zipSync({
      'package.json': new TextEncoder().encode('{}'),
      'dist/main.cjs': new TextEncoder().encode('m'),
    })
    const result = safeUnzip(buf)
    expect(Object.keys(result.entries).sort()).toEqual(['dist/main.cjs', 'package.json'])
  })

  it('rejects path traversal entries', () => {
    const buf = zipSync({
      'package.json': new TextEncoder().encode('{}'),
      '../../etc/passwd': new TextEncoder().encode('x'),
    })
    expect(() => safeUnzip(buf)).toThrow(UnzipError)
  })

  it('rejects absolute paths', () => {
    const buf = zipSync({
      '/etc/passwd': new TextEncoder().encode('x'),
    })
    expect(() => safeUnzip(buf)).toThrow(UnzipError)
  })

  it('rejects too many entries', () => {
    const big: Record<string, Uint8Array> = {}
    for (let i = 0; i <= MAX_ENTRIES + 1; i++) big[`f${i}.txt`] = new Uint8Array([1])
    const buf = zipSync(big)
    expect(() => safeUnzip(buf)).toThrow(/too many entries/)
  })

  it('rejects oversized payload', () => {
    const huge = new Uint8Array(MAX_UNZIPPED_BYTES + 1)
    huge.fill(0x41)
    const buf = zipSync({ 'big.bin': huge })
    expect(() => safeUnzip(buf)).toThrow(/size cap/)
  })

  it('rejects malformed zip', () => {
    expect(() => safeUnzip(new Uint8Array([1, 2, 3]))).toThrow(UnzipError)
  })
})
