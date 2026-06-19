/**
 * DashboardCacheContext.tsx
 *
 * Global context that:
 *  - Fetches dashboard data on mount
 *  - Stores it in localStorage so it persists across page navigations
 *  - Auto-refreshes every 60 seconds regardless of which page the user is on
 *  - Exposes the raw data + helpers to any component that needs it
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { BACKEND_URL } from '../consts'
import {
  mergeDashboardData,
} from '../lib/dashboardTransformer'
import type { RawDashboardData } from '../lib/dashboardTransformer'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60 * 1000       // 60 seconds
const INCREMENTAL_WINDOW  = '1d'            // incremental fetches cover last 1 day
const CACHE_STALE_MS      = 30 * 60 * 1000 // 30 minutes — if older, do a full reload
const LS_KEY              = 'dashboard_cache'

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

interface PersistedCache {
  data: RawDashboardData
  cachedAt: number
}

function loadFromStorage(): PersistedCache | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedCache
  } catch {
    return null
  }
}

function saveToStorage(data: RawDashboardData, cachedAt: number) {
  try {
    const payload: PersistedCache = { data, cachedAt }
    localStorage.setItem(LS_KEY, JSON.stringify(payload))
  } catch {
    // Ignore storage errors (e.g. private browsing quota)
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchDashboard(since: string): Promise<RawDashboardData> {
  const url = `${BACKEND_URL}api/dashboard?since=${since}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface DashboardCacheContextValue {
  cache: RawDashboardData | null
  cachedAt: number | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const DashboardCacheContext = createContext<DashboardCacheContextValue>({
  cache: null,
  cachedAt: null,
  loading: true,
  error: null,
  reload: async () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  // Seed state from localStorage so data is available immediately on mount
  const persisted = loadFromStorage()

  const [cache, setCache]       = useState<RawDashboardData | null>(persisted?.data ?? null)
  const [cachedAt, setCachedAt] = useState<number | null>(persisted?.cachedAt ?? null)
  const [loading, setLoading]   = useState(!persisted) // skip loading spinner if we have cached data
  const [error, setError]       = useState<string | null>(null)

  const initialLoadDone = useRef(!!persisted) // treat persisted data as already loaded
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Helpers to update state + localStorage together ─────────────────────
  const applyCache = useCallback((data: RawDashboardData) => {
    const now = Date.now()
    setCache(data)
    setCachedAt(now)
    saveToStorage(data, now)
  }, [])

  // ── Initial full load ────────────────────────────────────────────────────
  const doInitialLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboard('1m')
      applyCache(data)
      initialLoadDone.current = true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [applyCache])

  // ── Incremental refresh ──────────────────────────────────────────────────
  const doIncrementalRefresh = useCallback(async () => {
    if (!initialLoadDone.current) return
    try {
      const fresh = await fetchDashboard(INCREMENTAL_WINDOW)
      setCache((prev) => {
        const merged = prev ? mergeDashboardData(prev, fresh) : fresh
        const now = Date.now()
        setCachedAt(now)
        saveToStorage(merged, now)
        return merged
      })
    } catch {
      // Silently ignore incremental refresh failures — stale cache is fine
    }
  }, [])

  // ── On mount: load (or use persisted) + start refresh interval ───────────
  useEffect(() => {
    // If we have fresh-enough persisted data, skip the initial fetch
    if (persisted && Date.now() - persisted.cachedAt < CACHE_STALE_MS) {
      initialLoadDone.current = true
      setLoading(false)
    } else {
      doInitialLoad()
    }

    intervalRef.current = setInterval(doIncrementalRefresh, REFRESH_INTERVAL_MS)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount

  // ── Public reload (e.g. after error or manual refresh) ──────────────────
  const reload = useCallback(async () => {
    await doInitialLoad()
  }, [doInitialLoad])

  return (
    <DashboardCacheContext.Provider value={{ cache, cachedAt, loading, error, reload }}>
      {children}
    </DashboardCacheContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardCache() {
  return useContext(DashboardCacheContext)
}
