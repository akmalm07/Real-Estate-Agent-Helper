import { useState, useEffect, useCallback } from 'react'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(url: string): ApiState<T> {
  const [request, setRequest] = useState({ url, revision: 0 })
  const [result, setResult] = useState<{
    request: typeof request; data: T | null; error: string | null
  } | null>(null)
  // A return to an earlier URL is still a new request, not its old result.
  if (request.url !== url) {
    setRequest({ url, revision: request.revision + 1 })
    setResult(null)
  }
  const refetch = useCallback(() => setRequest((previous) => ({
    ...previous, revision: previous.revision + 1,
  })), [])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch(request.url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: T = await res.json()
        if (!cancelled) setResult({ request, data, error: null })
      } catch (err) {
        if (!cancelled) setResult((previous) => ({
          request,
          data: previous?.request.url === request.url ? previous.data : null,
          error: err instanceof Error ? err.message : 'Unknown error',
        }))
      }
    }
    void fetchData()
    return () => { cancelled = true }
  }, [request])

  const current = request.url === url && result?.request === request
  return {
    data: result?.request.url === url ? result.data : null,
    loading: !current,
    error: current ? result.error : null,
    refetch,
  }
}
