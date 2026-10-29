/**
 * DashboardCacheContext.tsx
 *
 * Global context that:
 *  - Fetches dashboard + properties + messages data on mount
 *  - Stores everything in localStorage so it persists across page navigations
 *  - Auto-refreshes every 60 seconds regardless of which page the user is on
 *  - Always runs a background refresh on mount to ensure fresh data
 *  - Exposes optimistic update helpers
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { BACKEND_URL } from '../consts'
import type { RawDashboardData } from '../lib/dashboardTransformer'
import type { Property, Message } from '../services/api'
import { DashboardCacheContext } from './dashboard-cache-context'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REFRESH_INTERVAL_MS = 60 * 1000
const INCREMENTAL_WINDOW  = '1d'
const CACHE_STALE_MS      = 30 * 60 * 1000
const LS_KEY_DASHBOARD    = 'dashboard_cache'
const LS_KEY_PROPERTIES   = 'properties_cache'
const LS_KEY_MESSAGES     = 'messages_cache'

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadFromStorage<T>(key: string): { data: T; cachedAt: number } | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as { data: T; cachedAt: number }
  } catch {
    return null
  }
}

function saveToStorage<T>(key: string, data: T, cachedAt: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, cachedAt }))
  } catch {
    // Ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchDashboard(since: string): Promise<RawDashboardData> {
  
  const url = `${BACKEND_URL}api/dashboard?since=${since}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

async function fetchProperties(): Promise<Property[]> {
  const res = await fetch(`${BACKEND_URL}api/properties`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

async function fetchMessages(): Promise<Message[]> {
  const res = await fetch(`${BACKEND_URL}api/messages`, { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const [persisted] = useState(() => {
    const dashboard = loadFromStorage<RawDashboardData>(LS_KEY_DASHBOARD)
    const properties = loadFromStorage<Property[]>(LS_KEY_PROPERTIES)
    const messages = loadFromStorage<Message[]>(LS_KEY_MESSAGES)
    const isFresh = (entry: { cachedAt: number } | null) => !!entry && Date.now() - entry.cachedAt < CACHE_STALE_MS
    return { dashboard, properties, messages, dashFresh: isFresh(dashboard), propsFresh: isFresh(properties), msgsFresh: isFresh(messages) }
  })
  const { dashboard: persistedDash, properties: persistedProps, messages: persistedMsgs } = persisted

  // ── Dashboard state ──────────────────────────────────────────────────────
  const [cache, setCache]       = useState<RawDashboardData | null>(persistedDash?.data ?? null)
  const [cachedAt, setCachedAt] = useState<number | null>(persistedDash?.cachedAt ?? null)
  const [loading, setLoading]   = useState(!persisted.dashFresh)
  const [error, setError]       = useState<string | null>(null)

  // ── Properties state ─────────────────────────────────────────────────────
  const [properties, setProperties]               = useState<Property[]>(persistedProps?.data ?? [])
  const [propertiesLoading, setPropertiesLoading] = useState(!persisted.propsFresh)
  const [propertiesError, setPropertiesError]     = useState<string | null>(null)

  // ── Messages state ───────────────────────────────────────────────────────
  const [messages, setMessages]               = useState<Message[]>(persistedMsgs?.data ?? [])
  const [messagesLoading, setMessagesLoading] = useState(!persisted.msgsFresh)
  const [messagesError, setMessagesError]     = useState<string | null>(null)

  const initialLoadDone = useRef(!!persistedDash)
  // Event-triggered reloads share the mounted effect's cancellation lifetime.
  const requestLifetime = useRef<AbortController | null>(null)

  // ── Apply dashboard cache ────────────────────────────────────────────────
  const applyDashCache = useCallback((data: RawDashboardData) => {
    const now = Date.now()
    setCache(data)
    setCachedAt(now)
    saveToStorage(LS_KEY_DASHBOARD, data, now)
  }, [])

  // ── Full load — dashboard ────────────────────────────────────────────────
  const doInitialLoad = useCallback((signal?: AbortSignal) => {
    return fetchDashboard('1m').then((data) => {
      if (signal?.aborted) return
      applyDashCache(data)
      initialLoadDone.current = true
    }).catch((err: unknown) => {
      if (signal?.aborted) return
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    }).finally(() => {
      if (!signal?.aborted) setLoading(false)
    })
  }, [applyDashCache])

  // ── Full load — properties ───────────────────────────────────────────────
  const doLoadProperties = useCallback((signal?: AbortSignal) => {
    return fetchProperties().then((data) => {
      if (signal?.aborted) return
      setProperties(data)
      saveToStorage(LS_KEY_PROPERTIES, data, Date.now())
    }).catch((err: unknown) => {
      if (signal?.aborted) return
      setPropertiesError(err instanceof Error ? err.message : 'Failed to load properties')
    }).finally(() => {
      if (!signal?.aborted) setPropertiesLoading(false)
    })
  }, [])

  // ── Full load — messages ─────────────────────────────────────────────────
  const doLoadMessages = useCallback((signal?: AbortSignal) => {
    return fetchMessages().then((data) => {
      if (signal?.aborted) return
      setMessages(data)
      saveToStorage(LS_KEY_MESSAGES, data, Date.now())
    }).catch((err: unknown) => {
      if (signal?.aborted) return
      setMessagesError(err instanceof Error ? err.message : 'Failed to load messages')
    }).finally(() => {
      if (!signal?.aborted) setMessagesLoading(false)
    })
  }, [])

  // ── Background refresh — always runs silently, never sets loading=true ───
  // This is called both on mount (to immediately correct stale cache) and on
  // the periodic interval. Preserve the existing replacement/ID comparison
  // semantics here; cache completeness is separate contract work.
  const doBackgroundRefresh = useCallback(async (signal?: AbortSignal) => {
    if (!initialLoadDone.current) return
    await fetchDashboard(INCREMENTAL_WINDOW).then((fresh) => {
      if (signal?.aborted) return
      applyDashCache(fresh)
    }).catch(() => {
      // Silently ignore — stale cache is still shown
    })
    if (signal?.aborted) return
    await Promise.all([fetchProperties(), fetchMessages()]).then(([freshProps, freshMsgs]) => {
      if (signal?.aborted) return

      setProperties((prev) => {
        const freshIds = new Set(freshProps.map((p) => p.id))
        const updated = prev.filter((p) => freshIds.has(p.id))
        if (updated.length !== freshProps.length || updated.some((p, i) => p.id !== freshProps[i].id)) {
          saveToStorage(LS_KEY_PROPERTIES, freshProps, Date.now())
          return freshProps
        }
        return prev
      })

      setMessages((prev) => {
        const freshIds = new Set(freshMsgs.map((m) => m.id))
        const updated = prev.filter((m) => freshIds.has(m.id))
        if (updated.length !== freshMsgs.length || updated.some((m, i) => m.id !== freshMsgs[i].id)) {
          saveToStorage(LS_KEY_MESSAGES, freshMsgs, Date.now())
          return freshMsgs
        }
        return prev
      })
    }).catch(() => {
      // Silently ignore
    })
  }, [applyDashCache])

  // ── On mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController()
    requestLifetime.current = controller

    if (persisted.dashFresh) {
      // Cache is fresh enough to show immediately — but still kick off a
      // background refresh right away so unverified leads / status changes
      // are reflected without waiting for the 60s interval.
      void doBackgroundRefresh(controller.signal)
    } else {
      // Cache is missing or stale — do a full blocking load
      void doInitialLoad(controller.signal)
    }

    if (!persisted.propsFresh) {
      void doLoadProperties(controller.signal)
    }

    if (!persisted.msgsFresh) {
      void doLoadMessages(controller.signal)
    }

    // Periodic interval — runs every 60s after the initial mount refresh
    const interval = setInterval(() => { void doBackgroundRefresh(controller.signal) }, REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [persisted, doBackgroundRefresh, doInitialLoad, doLoadProperties, doLoadMessages])

  // ── Public reload (manual) ───────────────────────────────────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    setPropertiesLoading(true)
    setPropertiesError(null)
    setMessagesLoading(true)
    setMessagesError(null)
    const signal = requestLifetime.current?.signal
    await Promise.all([doInitialLoad(signal), doLoadProperties(signal), doLoadMessages(signal)])
  }, [doInitialLoad, doLoadProperties, doLoadMessages])

  // ── Optimistic: add property ─────────────────────────────────────────────
  const addProperty = useCallback((property: Property) => {
    setProperties((prev) => {
      const updated = [property, ...prev]
      saveToStorage(LS_KEY_PROPERTIES, updated, Date.now())
      return updated
    })
    setCache((prev) => {
      if (!prev) return prev
      const updated = { ...prev, totalProperties: prev.totalProperties + 1 }
      saveToStorage(LS_KEY_DASHBOARD, updated, Date.now())
      return updated
    })
  }, [])

  // ── Optimistic: update property ──────────────────────────────────────────
  const updateProperty = useCallback((property: Property) => {
    setProperties((prev) => {
      const updated = prev.map((p) => String(p.id) === String(property.id) ? property : p)
      saveToStorage(LS_KEY_PROPERTIES, updated, Date.now())
      return updated
    })
  }, [])

  // ── Optimistic: remove property ──────────────────────────────────────────
  const removeProperty = useCallback((id: string | number) => {
    setProperties((prev) => {
      const updated = prev.filter((p) => String(p.id) !== String(id))
      saveToStorage(LS_KEY_PROPERTIES, updated, Date.now())
      return updated
    })
    setCache((prev) => {
      if (!prev) return prev
      const updated = { ...prev, totalProperties: Math.max(0, prev.totalProperties - 1) }
      saveToStorage(LS_KEY_DASHBOARD, updated, Date.now())
      return updated
    })
    void reload()
  }, [reload])

  // ── Optimistic: add lead ─────────────────────────────────────────────────
  const addLead = useCallback((lead: RawDashboardData['leads'][number]) => {
    setCache((prev) => {
      if (!prev) return prev
      const updated: RawDashboardData = {
        ...prev,
        totalLeads: prev.totalLeads + 1,
        leads: [lead, ...(prev.leads ?? [])],
      }
      saveToStorage(LS_KEY_DASHBOARD, updated, Date.now())
      return updated
    })
  }, [])

  // ── Optimistic: update lead ──────────────────────────────────────────────
  const updateLead = useCallback((lead: RawDashboardData['leads'][number]) => {
    setCache((prev) => {
      if (!prev) return prev
      const updated: RawDashboardData = {
        ...prev,
        leads: (prev.leads ?? []).map((l) => l.id === lead.id ? lead : l),
      }
      saveToStorage(LS_KEY_DASHBOARD, updated, Date.now())
      return updated
    })
  }, [])

  // ── Optimistic: remove lead ──────────────────────────────────────────────
  const removeLead = useCallback((id: number) => {
    setCache((prev) => {
      if (!prev) return prev
      const updated: RawDashboardData = {
        ...prev,
        totalLeads: Math.max(0, prev.totalLeads - 1),
        leads: (prev.leads ?? []).filter((l) => l.id !== id),
      }
      saveToStorage(LS_KEY_DASHBOARD, updated, Date.now())
      return updated
    })
    void reload()
  }, [reload])

  return (
    <DashboardCacheContext.Provider
      value={{
        cache,
        cachedAt,
        loading,
        error,
        reload,
        properties,
        propertiesLoading,
        propertiesError,
        messages,
        messagesLoading,
        messagesError,
        addProperty,
        updateProperty,
        removeProperty,
        addLead,
        updateLead,
        removeLead,
      }}
    >
      {children}
    </DashboardCacheContext.Provider>
  )
}
