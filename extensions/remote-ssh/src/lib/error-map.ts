import type { FileOpError, FileOpErrorCode } from '../shared/types'

export function makeError(code: FileOpErrorCode, message: string): Error & FileOpError {
  const e = new Error(message) as Error & FileOpError
  e.code = code
  e.message = message
  return e
}

export function mapNodeErr(err: unknown): Error & FileOpError {
  const code =
    err && typeof err === 'object'
      ? ((err as { code?: string }).code ?? 'EGENERIC')
      : 'EGENERIC'
  const message = err instanceof Error ? err.message : String(err)
  const known: FileOpErrorCode[] = [
    'ENOENT',
    'EACCES',
    'EEXIST',
    'EISDIR',
    'ENOTDIR',
    'EPERM',
    'ETIMEDOUT',
    'ENOTEMPTY',
  ]
  return makeError((known as string[]).includes(code) ? (code as FileOpErrorCode) : 'EGENERIC', message)
}

const SFTP_STATUS_FX_NO_SUCH_FILE = 2
const SFTP_STATUS_FX_PERMISSION_DENIED = 3
const SFTP_STATUS_FX_FAILURE = 4
const SFTP_STATUS_FX_OP_UNSUPPORTED = 8
const SFTP_STATUS_FX_FILE_ALREADY_EXISTS = 11

export function mapSftpErr(err: unknown): Error & FileOpError {
  const code = (err as { code?: number | string }).code
  const message = err instanceof Error ? err.message : String(err)
  if (code === SFTP_STATUS_FX_NO_SUCH_FILE) return makeError('ENOENT', message)
  if (code === SFTP_STATUS_FX_PERMISSION_DENIED) return makeError('EACCES', message)
  if (code === SFTP_STATUS_FX_FAILURE) return makeError('EEXIST', message)
  if (code === SFTP_STATUS_FX_FILE_ALREADY_EXISTS) return makeError('EEXIST', message)
  if (code === SFTP_STATUS_FX_OP_UNSUPPORTED) return makeError('ENOTSUP', message)
  if (typeof code === 'string') {
    const known: FileOpErrorCode[] = [
      'ENOENT',
      'EACCES',
      'EEXIST',
      'EISDIR',
      'ENOTDIR',
      'EPERM',
      'ETIMEDOUT',
      'ENOTEMPTY',
    ]
    if ((known as string[]).includes(code)) return makeError(code as FileOpErrorCode, message)
  }
  return makeError('EGENERIC', message)
}

export function isFileOpError(err: unknown): err is FileOpError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  )
}
