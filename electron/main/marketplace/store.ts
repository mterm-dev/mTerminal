import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export interface InstallRecord {
  installedAt: number
  version: string
}

export interface MarketplaceStoreShape {
  lastUpdateCheck: number | null
  onboardingDone: boolean
  installRecords: Record<string, InstallRecord>
  knownAuthorKeys: Record<string, string>
  appVersionAtLastBoot: string
  recommendedCache?: string[]
  softOnboardingPending?: boolean
}

const FILE_NAME = 'marketplace.json'

export function defaultStoreState(appVersion = '0.0.0'): MarketplaceStoreShape {
  return {
    lastUpdateCheck: null,
    onboardingDone: false,
    installRecords: {},
    knownAuthorKeys: {},
    appVersionAtLastBoot: appVersion,
  }
}

export function configRoot(home: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    return path.join(appData, 'mterminal')
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'mterminal')
  }
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.length > 0 ? env.XDG_CONFIG_HOME : path.join(home, '.config')
  return path.join(xdg, 'mterminal')
}

export function storeFilePath(home: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string {
  return path.join(configRoot(home, platform, env), FILE_NAME)
}

export class MarketplaceStore {
  private state: MarketplaceStoreShape | null = null
  private filePath: string

  constructor(opts: { home?: string; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; appVersion?: string } = {}) {
    const home = opts.home ?? os.homedir()
    const platform = opts.platform ?? process.platform
    const env = opts.env ?? process.env
    this.filePath = storeFilePath(home, platform, env)
    this.appVersion = opts.appVersion ?? '0.0.0'
  }

  private appVersion: string

  filePathForTests(): string {
    return this.filePath
  }

  async load(): Promise<MarketplaceStoreShape> {
    if (this.state) return this.state
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<MarketplaceStoreShape>
      this.state = {
        ...defaultStoreState(this.appVersion),
        ...parsed,
        installRecords: { ...(parsed.installRecords ?? {}) },
        knownAuthorKeys: { ...(parsed.knownAuthorKeys ?? {}) },
      }
    } catch {
      this.state = defaultStoreState(this.appVersion)
    }
    return this.state
  }

  async save(): Promise<void> {
    if (!this.state) return
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.state, null, 2), 'utf-8')
    await fs.rename(tmp, this.filePath)
  }

  async update(patch: Partial<MarketplaceStoreShape>): Promise<MarketplaceStoreShape> {
    const cur = await this.load()
    this.state = { ...cur, ...patch }
    await this.save()
    return this.state
  }

  async setInstallRecord(id: string, rec: InstallRecord): Promise<void> {
    const cur = await this.load()
    cur.installRecords[id] = rec
    await this.save()
  }

  async removeInstallRecord(id: string): Promise<void> {
    const cur = await this.load()
    delete cur.installRecords[id]
    await this.save()
  }

  async setAuthorKey(keyId: string, pubkeyB64: string): Promise<void> {
    const cur = await this.load()
    cur.knownAuthorKeys[keyId] = pubkeyB64
    await this.save()
  }

  async getAuthorKey(keyId: string): Promise<string | null> {
    const cur = await this.load()
    return cur.knownAuthorKeys[keyId] ?? null
  }
}

let singleton: MarketplaceStore | null = null
export function getMarketplaceStore(): MarketplaceStore {
  if (!singleton) singleton = new MarketplaceStore()
  return singleton
}

export function resetMarketplaceStoreForTests(): void {
  singleton = null
}
