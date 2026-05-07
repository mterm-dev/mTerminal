import fs from 'node:fs/promises'
import { trustFilePath } from './locations'

interface TrustFile {
  version: 1
  trusted: Record<string, boolean>
}

export class TrustStore {
  private cache: TrustFile | null = null
  private writePending: Promise<void> | null = null

  private async load(): Promise<TrustFile> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(trustFilePath(), 'utf-8')
      const parsed = JSON.parse(raw) as TrustFile
      if (parsed.version === 1 && parsed.trusted && typeof parsed.trusted === 'object') {
        this.cache = parsed
        return parsed
      }
    } catch {
      // missing or invalid → start fresh
    }
    this.cache = { version: 1, trusted: {} }
    return this.cache
  }

  async isTrusted(id: string): Promise<boolean> {
    const data = await this.load()
    return !!data.trusted[id]
  }

  async setTrusted(id: string, trusted: boolean): Promise<void> {
    const data = await this.load()
    if (trusted) data.trusted[id] = true
    else delete data.trusted[id]
    await this.persist()
  }

  async list(): Promise<Record<string, boolean>> {
    const data = await this.load()
    return { ...data.trusted }
  }

  private async persist(): Promise<void> {
    // Coalesce writes; if one is in flight, the next call queues a follow-up.
    if (this.writePending) {
      await this.writePending
    }
    this.writePending = this.write()
    await this.writePending
    this.writePending = null
  }

  private async write(): Promise<void> {
    if (!this.cache) return
    const file = trustFilePath()
    const json = JSON.stringify(this.cache, null, 2) + '\n'
    await fs.writeFile(file, json, 'utf-8')
  }
}

let trustInstance: TrustStore | null = null
export function getTrustStore(): TrustStore {
  if (!trustInstance) trustInstance = new TrustStore()
  return trustInstance
}
