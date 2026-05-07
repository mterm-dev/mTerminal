import { unzipSync } from 'fflate'
import path from 'node:path'

export const MAX_UNZIPPED_BYTES = 25 * 1024 * 1024
export const MAX_ENTRIES = 200

export class UnzipError extends Error {
  constructor(public reason: string) {
    super(`unzip rejected: ${reason}`)
    this.name = 'UnzipError'
  }
}

export interface UnzipResult {
  entries: Record<string, Uint8Array>
}

export function safeUnzip(buf: Uint8Array): UnzipResult {
  let raw: Record<string, Uint8Array>
  try {
    raw = unzipSync(buf)
  } catch (err) {
    throw new UnzipError(`malformed zip: ${(err as Error).message}`)
  }
  const names = Object.keys(raw)
  if (names.length > MAX_ENTRIES) {
    throw new UnzipError(`too many entries (${names.length} > ${MAX_ENTRIES})`)
  }
  let total = 0
  const out: Record<string, Uint8Array> = {}
  for (const name of names) {
    if (name.endsWith('/')) continue
    if (isUnsafePath(name)) {
      throw new UnzipError(`unsafe path: ${name}`)
    }
    const data = raw[name]
    total += data.byteLength
    if (total > MAX_UNZIPPED_BYTES) {
      throw new UnzipError(`size cap exceeded (>${MAX_UNZIPPED_BYTES} bytes)`)
    }
    out[name] = data
  }
  return { entries: out }
}

export function isUnsafePath(p: string): boolean {
  if (p.length === 0) return true
  if (p.startsWith('/') || p.startsWith('\\')) return true
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true
  const normalized = p.replace(/\\/g, '/')
  const segs = normalized.split('/')
  for (const seg of segs) {
    if (seg === '..') return true
  }
  const resolved = path.posix.normalize(normalized)
  if (resolved.startsWith('../') || resolved === '..') return true
  if (path.posix.isAbsolute(resolved)) return true
  return false
}
