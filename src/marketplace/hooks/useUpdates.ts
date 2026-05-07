import { useCallback, useEffect, useState } from 'react'
import { marketplaceApi, MarketplaceClientError } from '../api'
import type { UpdateInfo } from '../types'

const POLL_INTERVAL_MS = 60_000

export function useUpdates() {
  const [updates, setUpdates] = useState<UpdateInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await marketplaceApi.checkUpdates()
      setUpdates(list)
    } catch (err) {
      const e = err as MarketplaceClientError
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    marketplaceApi
      .getUpdates()
      .then((list) => {
        if (!cancelled) setUpdates(list)
      })
      .catch(() => {})
    void refresh()
    const t = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [refresh])

  return { updates, count: updates.length, loading, error, refresh }
}
