import fs from 'node:fs/promises'
import { disabledFilePath } from './locations'

interface DisabledFile {
  version: 1
  disabled: Record<string, boolean>
}

export class DisabledStore {
  private cache: DisabledFile | null = null
  private writePending: Promise<void> | null = null

  private async load(): Promise<DisabledFile> {
    if (this.cache) return this.cache
    try {
      const raw = await fs.readFile(disabledFilePath(), 'utf-8')
      const parsed = JSON.parse(raw) as DisabledFile
      if (parsed.version === 1 && parsed.disabled && typeof parsed.disabled === 'object') {
        this.cache = parsed
        return parsed
      }
    } catch {
      // missing or invalid → start fresh
    }
    this.cache = { version: 1, disabled: {} }
    return this.cache
  }

  async isDisabled(id: string): Promise<boolean> {
    const data = await this.load()
    return !!data.disabled[id]
  }

  async setDisabled(id: string, disabled: boolean): Promise<void> {
    const data = await this.load()
    if (disabled) data.disabled[id] = true
    else delete data.disabled[id]
    await this.persist()
  }

  async list(): Promise<Record<string, boolean>> {
    const data = await this.load()
    return { ...data.disabled }
  }

  private async persist(): Promise<void> {
    if (this.writePending) {
      await this.writePending
    }
    this.writePending = this.write()
    await this.writePending
    this.writePending = null
  }

  private async write(): Promise<void> {
    if (!this.cache) return
    const file = disabledFilePath()
    const json = JSON.stringify(this.cache, null, 2) + '\n'
    await fs.writeFile(file, json, 'utf-8')
  }
}

let disabledInstance: DisabledStore | null = null
export function getDisabledStore(): DisabledStore {
  if (!disabledInstance) disabledInstance = new DisabledStore()
  return disabledInstance
}
