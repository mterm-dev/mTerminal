import type {
  ExtSummary,
  ExtensionDetail,
  DownloadInfo,
  SearchRequest,
  SearchResult,
  RatingSubmitRequest,
  RatingDto,
} from '@mterminal/marketplace-types'
import { resolveEndpoint } from './config'

export class MarketplaceNetworkError extends Error {
  code = 'NETWORK' as const
  constructor(message: string, public cause?: unknown) {
    super(message)
    this.name = 'MarketplaceNetworkError'
  }
}

export class MarketplaceHttpError extends Error {
  code = 'HTTP' as const
  constructor(public status: number, public body: string) {
    super(`marketplace http ${status}`)
    this.name = 'MarketplaceHttpError'
  }
}

export interface ApiClientOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
  apiKey?: string
}

export class MarketplaceApiClient {
  private _endpoint: string
  private fetchImpl: typeof fetch
  private apiKey: string | undefined

  constructor(opts: ApiClientOptions = {}) {
    this._endpoint = (opts.endpoint ?? resolveEndpoint()).replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? fetch
    this.apiKey = opts.apiKey
  }

  get endpoint(): string {
    return this._endpoint
  }

  setEndpoint(url: string | undefined): void {
    if (!url || url.length === 0) {
      this._endpoint = resolveEndpoint()
      return
    }
    this._endpoint = url.replace(/\/+$/, '')
  }

  setApiKey(key: string | undefined): void {
    this.apiKey = key
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this._endpoint}${path}`
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    }
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`
    let res: Response
    try {
      res = await this.fetchImpl(url, { ...init, headers })
    } catch (err) {
      throw new MarketplaceNetworkError((err as Error).message ?? 'fetch failed', err)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new MarketplaceHttpError(res.status, text)
    }
    return (await res.json()) as T
  }

  async search(req: SearchRequest = {}): Promise<SearchResult> {
    const params = new URLSearchParams()
    if (req.q) params.set('q', req.q)
    if (req.category) params.set('category', req.category)
    if (req.recommended) params.set('recommended', '1')
    if (req.sort) params.set('sort', req.sort)
    if (req.page != null) params.set('page', String(req.page))
    if (req.pageSize != null) params.set('pageSize', String(req.pageSize))
    if (req.ids && req.ids.length > 0) params.set('ids', req.ids.join(','))
    const qs = params.toString()
    return this.request<SearchResult>(`/v1/extensions${qs ? `?${qs}` : ''}`)
  }

  async details(id: string): Promise<ExtensionDetail> {
    return this.request<ExtensionDetail>(`/v1/extensions/${encodeURIComponent(id)}`)
  }

  async downloadVersionInfo(id: string, version: string): Promise<DownloadInfo> {
    return this.request<DownloadInfo>(
      `/v1/extensions/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}/download`,
    )
  }

  async fetchPackage(url: string): Promise<Uint8Array> {
    let res: Response
    try {
      res = await this.fetchImpl(url, { redirect: 'follow' })
    } catch (err) {
      throw new MarketplaceNetworkError((err as Error).message ?? 'fetch failed', err)
    }
    if (!res.ok) {
      throw new MarketplaceHttpError(res.status, await res.text().catch(() => ''))
    }
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  async getPublicKey(keyId: string): Promise<{ keyId: string; pubkeyB64: string; revokedAt: number | null }> {
    return this.request(`/v1/keys/${encodeURIComponent(keyId)}`)
  }

  async submitRating(req: RatingSubmitRequest): Promise<RatingDto> {
    return this.request<RatingDto>(`/v1/ratings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    })
  }

  async listRatings(id: string): Promise<RatingDto[]> {
    return this.request<RatingDto[]>(`/v1/extensions/${encodeURIComponent(id)}/ratings`)
  }

  async listInstalledMeta(ids: string[]): Promise<ExtSummary[]> {
    if (ids.length === 0) return []
    const result = await this.search({ ids })
    return result.items
  }
}

let singleton: MarketplaceApiClient | null = null
export function getApiClient(): MarketplaceApiClient {
  if (!singleton) singleton = new MarketplaceApiClient()
  return singleton
}

export function resetApiClientForTests(client?: MarketplaceApiClient): void {
  singleton = client ?? null
}
