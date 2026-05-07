import type { Installer } from '../marketplace/installer'
import type { MarketplaceStore } from '../marketplace/store'
import { compare, parse } from './semver-mini'

const FORMER_BUILTINS: readonly string[] = [
  'remote-ssh',
  'file-browser',
  'git-panel',
  'error-linkifier',
  'git-status-mini',
  'theme-pack-extra',
] as const

export interface MarketplaceMigrationDeps {
  installer: Installer
  store: MarketplaceStore
  currentAppVersion: string
}

export interface MarketplaceMigrationResult {
  performed: boolean
  attempted: string[]
  failed: Array<{ id: string; reason: string }>
}

export async function runOneShotMarketplaceMigrations(
  deps: MarketplaceMigrationDeps,
): Promise<MarketplaceMigrationResult> {
  const state = await deps.store.load()
  const prev = state.appVersionAtLastBoot
  const cur = deps.currentAppVersion

  const prevParsed = parse(prev)
  const curParsed = parse(cur)
  const isUpgrade =
    !!prevParsed && !!curParsed && compare(curParsed, prevParsed) > 0

  await deps.store.update({ appVersionAtLastBoot: cur })

  if (!isUpgrade) {
    return { performed: false, attempted: [], failed: [] }
  }

  const attempted: string[] = []
  const failed: Array<{ id: string; reason: string }> = []

  for (const id of FORMER_BUILTINS) {
    if (state.installRecords[id]) continue
    attempted.push(id)
    try {
      await deps.installer.install(id)
    } catch (err) {
      failed.push({ id, reason: (err as Error).message })
    }
  }

  return { performed: attempted.length > 0, attempted, failed }
}

export const FORMER_BUILTIN_IDS = FORMER_BUILTINS
