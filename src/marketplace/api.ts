import type {
  ApiError,
  ExtensionDetail,
  IpcResult,
  InstallResult,
  InstallRecommendedResultItem,
  InstalledWithMeta,
  RatingDto,
  SearchRequest,
  SearchResult,
  UpdateInfo,
} from './types'

interface MarketplaceBridge {
  search: (req?: SearchRequest) => Promise<IpcResult<SearchResult>>
  details: (id: string) => Promise<IpcResult<ExtensionDetail>>
  install: (id: string, version?: string) => Promise<IpcResult<InstallResult>>
  uninstall: (id: string) => Promise<IpcResult<{ id: string }>>
  update: (id: string) => Promise<IpcResult<InstallResult>>
  checkUpdates: () => Promise<IpcResult<UpdateInfo[]>>
  getUpdates: () => Promise<IpcResult<UpdateInfo[]>>
  listInstalledWithMeta: () => Promise<IpcResult<InstalledWithMeta[]>>
  submitRating: (req: {
    extensionId: string
    stars: number
    comment?: string
  }) => Promise<IpcResult<RatingDto>>
  isFirstRun: () => Promise<IpcResult<boolean>>
  markOnboardingDone: () => Promise<IpcResult<boolean>>
  installRecommended: (ids: string[]) => Promise<IpcResult<InstallRecommendedResultItem[]>>
}

function bridge(): MarketplaceBridge {
  const w = window as unknown as { mt?: { marketplace?: MarketplaceBridge } }
  if (!w.mt || !w.mt.marketplace) {
    throw new Error('window.mt.marketplace bridge unavailable')
  }
  return w.mt.marketplace
}

export class MarketplaceClientError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'MarketplaceClientError'
  }
}

function unwrap<T>(res: IpcResult<T>): T {
  if (!res.ok) {
    const err = res.error ?? ({ code: 'UNKNOWN', message: 'unknown error' } satisfies ApiError)
    throw new MarketplaceClientError(err.code, err.message)
  }
  return res.value as T
}

export const marketplaceApi = {
  async search(req?: SearchRequest): Promise<SearchResult> {
    return unwrap(await bridge().search(req))
  },
  async details(id: string): Promise<ExtensionDetail> {
    return unwrap(await bridge().details(id))
  },
  async install(id: string, version?: string): Promise<InstallResult> {
    return unwrap(await bridge().install(id, version))
  },
  async uninstall(id: string): Promise<void> {
    unwrap(await bridge().uninstall(id))
  },
  async update(id: string): Promise<InstallResult> {
    return unwrap(await bridge().update(id))
  },
  async checkUpdates(): Promise<UpdateInfo[]> {
    return unwrap(await bridge().checkUpdates())
  },
  async getUpdates(): Promise<UpdateInfo[]> {
    return unwrap(await bridge().getUpdates())
  },
  async listInstalled(): Promise<InstalledWithMeta[]> {
    return unwrap(await bridge().listInstalledWithMeta())
  },
  async submitRating(req: {
    extensionId: string
    stars: number
    comment?: string
  }): Promise<RatingDto> {
    return unwrap(await bridge().submitRating(req))
  },
  async isFirstRun(): Promise<boolean> {
    return unwrap(await bridge().isFirstRun())
  },
  async markOnboardingDone(): Promise<boolean> {
    return unwrap(await bridge().markOnboardingDone())
  },
  async installRecommended(ids: string[]): Promise<InstallRecommendedResultItem[]> {
    return unwrap(await bridge().installRecommended(ids))
  },
}

export type MarketplaceApi = typeof marketplaceApi
