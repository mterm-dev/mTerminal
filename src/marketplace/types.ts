import type {
  ExtSummary,
  ExtensionDetail,
  Category,
  RatingDto,
  SearchRequest,
  SearchResult,
  PolicyError,
} from '@mterminal/marketplace-types'

export type {
  ExtSummary,
  ExtensionDetail,
  Category,
  RatingDto,
  SearchRequest,
  SearchResult,
  PolicyError,
}

export interface ApiError {
  code: string
  message: string
}

export interface IpcResult<T> {
  ok: boolean
  value?: T
  error?: ApiError
}

export interface UpdateInfo {
  id: string
  installedVersion: string
  latestVersion: string
  displayName: string
  description: string
}

export interface InstalledWithMeta {
  id: string
  installedVersion: string
  displayName: string
  description: string
  meta: ExtSummary | null
  enabled: boolean
  trusted: boolean
  state: string
}

export interface InstallResult {
  id: string
  version: string
}

export interface InstallRecommendedResultItem {
  id: string
  ok: boolean
  error?: ApiError
}
