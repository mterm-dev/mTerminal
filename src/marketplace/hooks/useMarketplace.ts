import { useCallback, useEffect, useRef, useState } from 'react'
import { marketplaceApi, MarketplaceClientError } from '../api'
import type { ExtSummary, ExtensionDetail, SearchRequest } from '../types'

interface SearchState {
  loading: boolean
  items: ExtSummary[]
  total: number
  error: string | null
  offline: boolean
}

const INITIAL_SEARCH_STATE: SearchState = {
  loading: false,
  items: [],
  total: 0,
  error: null,
  offline: false,
}

export function useMarketplaceSearch() {
  const [state, setState] = useState<SearchState>(INITIAL_SEARCH_STATE)
  const reqRef = useRef(0)

  const run = useCallback(async (req: SearchRequest) => {
    const seq = ++reqRef.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const result = await marketplaceApi.search(req)
      if (seq !== reqRef.current) return
      setState({
        loading: false,
        items: result.items,
        total: result.total,
        error: null,
        offline: false,
      })
    } catch (err) {
      if (seq !== reqRef.current) return
      const e = err as MarketplaceClientError
      setState({
        loading: false,
        items: [],
        total: 0,
        error: e.message,
        offline: e.code === 'NETWORK',
      })
    }
  }, [])

  return { ...state, search: run }
}

interface DetailsState {
  loading: boolean
  detail: ExtensionDetail | null
  error: string | null
}

export function useExtensionDetails(id: string | null) {
  const [state, setState] = useState<DetailsState>({ loading: false, detail: null, error: null })

  useEffect(() => {
    if (!id) {
      setState({ loading: false, detail: null, error: null })
      return
    }
    let cancelled = false
    setState({ loading: true, detail: null, error: null })
    marketplaceApi
      .details(id)
      .then((d) => {
        if (cancelled) return
        setState({ loading: false, detail: d, error: null })
      })
      .catch((err: MarketplaceClientError) => {
        if (cancelled) return
        setState({ loading: false, detail: null, error: err.message })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  return state
}

interface InstallStatus {
  busy: boolean
  lastError: string | null
}

export function useInstallActions() {
  const [status, setStatus] = useState<InstallStatus>({ busy: false, lastError: null })

  const install = useCallback(async (id: string, version?: string) => {
    setStatus({ busy: true, lastError: null })
    try {
      await marketplaceApi.install(id, version)
      setStatus({ busy: false, lastError: null })
      return true
    } catch (err) {
      const e = err as MarketplaceClientError
      setStatus({ busy: false, lastError: e.message })
      return false
    }
  }, [])

  const uninstall = useCallback(async (id: string) => {
    setStatus({ busy: true, lastError: null })
    try {
      await marketplaceApi.uninstall(id)
      setStatus({ busy: false, lastError: null })
      return true
    } catch (err) {
      const e = err as MarketplaceClientError
      setStatus({ busy: false, lastError: e.message })
      return false
    }
  }, [])

  const update = useCallback(async (id: string) => {
    setStatus({ busy: true, lastError: null })
    try {
      await marketplaceApi.update(id)
      setStatus({ busy: false, lastError: null })
      return true
    } catch (err) {
      const e = err as MarketplaceClientError
      setStatus({ busy: false, lastError: e.message })
      return false
    }
  }, [])

  return { ...status, install, uninstall, update }
}
