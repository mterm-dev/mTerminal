import { describe, it, expect } from 'vitest'
import { makeError, mapNodeErr, mapSftpErr, isFileOpError } from '../../src/lib/error-map'

describe('error-map', () => {
  it('makeError attaches code', () => {
    const e = makeError('ENOENT', 'no such file')
    expect(e.code).toBe('ENOENT')
    expect(e.message).toBe('no such file')
    expect(e).toBeInstanceOf(Error)
  })

  it('mapNodeErr passes through known posix codes', () => {
    const err = Object.assign(new Error('boom'), { code: 'ENOENT' })
    expect(mapNodeErr(err).code).toBe('ENOENT')

    const err2 = Object.assign(new Error('boom'), { code: 'EACCES' })
    expect(mapNodeErr(err2).code).toBe('EACCES')
  })

  it('mapNodeErr collapses unknown codes to EGENERIC', () => {
    const err = Object.assign(new Error('weird'), { code: 'EWEIRD' })
    expect(mapNodeErr(err).code).toBe('EGENERIC')
  })

  it('mapNodeErr handles non-Error input', () => {
    expect(mapNodeErr('string error').code).toBe('EGENERIC')
    expect(mapNodeErr(null).code).toBe('EGENERIC')
  })

  it('mapSftpErr maps numeric SFTP status codes', () => {
    const e = (code: number): Error & { code?: number } =>
      Object.assign(new Error('x'), { code })
    expect(mapSftpErr(e(2)).code).toBe('ENOENT')
    expect(mapSftpErr(e(3)).code).toBe('EACCES')
    expect(mapSftpErr(e(4)).code).toBe('EEXIST')
    expect(mapSftpErr(e(8)).code).toBe('ENOTSUP')
    expect(mapSftpErr(e(11)).code).toBe('EEXIST')
    expect(mapSftpErr(e(99)).code).toBe('EGENERIC')
  })

  it('mapSftpErr handles string error codes', () => {
    const err = Object.assign(new Error('x'), { code: 'ENOENT' })
    expect(mapSftpErr(err).code).toBe('ENOENT')
  })

  it('isFileOpError identifies typed errors', () => {
    expect(isFileOpError(makeError('EACCES', 'denied'))).toBe(true)
    expect(isFileOpError(new Error('plain'))).toBe(false)
    expect(isFileOpError(null)).toBe(false)
    expect(isFileOpError({ code: 'ENOENT', message: 'x' })).toBe(true)
  })
})
