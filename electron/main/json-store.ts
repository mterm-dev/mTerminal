import fs from 'node:fs'
import path from 'node:path'

export function loadJsonFile(file: string): string | null {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (typeof raw === 'string' && raw.length > 0) return raw
    return null
  } catch {
    return null
  }
}

export function saveJsonFileAtomic(file: string, json: string): void {
  if (typeof json !== 'string') return
  const dir = path.dirname(file)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {}
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, json, { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(tmp, file)
  try {
    fs.chmodSync(file, 0o600)
  } catch {}
}
