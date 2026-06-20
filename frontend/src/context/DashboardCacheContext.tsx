/**
 * DashboardCacheContext.tsx
 *
 * Global context that:
 *  - Fetches dashboard + properties + messages data on mount
 *  - Stores everything in localStorage so it persists across page navigations
 *  - Auto-refreshes every 60 seconds regardless of which page the user is on
 *  - Exposes optimistic update helpers
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
import { mergeDashboardData } from '../lib/dashboardTransformer'
import type { RawDashboardData } from '../lib/dashboardTransformer'
import type { Property, Message } from '../services/api'

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
// Context shape
// ---------------------------------------------------------------------------

interface DashboardCacheContextValue {
  // Dashboard
  cache: RawDashboardData | null
  cachedAt: number | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>

  // Properties
  properties: Property[]
  propertiesLoading: boolean
  propertiesError: string | null

  // Messages
  messages: Message[]
  messagesLoading: boolean
  messagesError: string | null

  // Optimistic update helpers
  addProperty: (property: Property) => void
  updateProperty: (property: Property) => void
  removeProperty: (id: string | number) => void

  addLead: (lead: RawDashboardData['leads'][number]) => void
  updateLead: (lead: RawDashboardData['leads'][number]) => void
  removeLead: (id: number) => void
}

const DashboardCacheContext = createContext<DashboardCacheContextValue>({
  cache: null,
  cachedAt: null,
  loading: true,
  error: null,
  reload: async () => {},

  properties: [],
  propertiesLoading: true,
  propertiesError: null,

  messages: [],
  messagesLoading: true,
  messagesError: null,

  addProperty:    () => {},
  updateProperty: () => {},
  removeProperty: () => {},

  addLead:    () => {},
  updateLead: () => {},
  removeLead: () => {},
})

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DashboardCacheProvider({ children }: { children: React.ReactNode }) {
  const persistedDash  = loadFromStorage<RawDashboardData>(LS_KEY_DASHBOARD)
  const persistedProps = loadFromStorage<Property[]>(LS_KEY_PROPERTIES)
  const persistedMsgs  = loadFromStorage<Message[]>(LS_KEY_MESSAGES)

  // ── Dashboard state ──────────────────────────────────────────────────────
  const [cache, setCache]       = useState<RawDashboardData | null>(persistedDash?.data ?? null)
  const [cachedAt, setCachedAt] = useState<number | null>(persistedDash?.cachedAt ?? null)
  const [loading, setLoading]   = useState(!persistedDash)
  const [error, setError]       = useState<string | null>(null)

  // ── Properties state ─────────────────────────────────────────────────────
  const [properties, setProperties]               = useState<Property[]>(persistedProps?.data ?? [])
  const [propertiesLoading, setPropertiesLoading] = useState(!persistedProps)
  const [propertiesError, setPropertiesError]     = useState<string | null>(null)

  // ── Messages state ───────────────────────────────────────────────────────
  const [messages, setMessages]               = useState<Message[]>(persistedMsgs?.data ?? [])
  const [messagesLoading, setMessagesLoading] = useState(!persistedMsgs)
  const [messagesError, setMessagesError]     = useState<string | null>(null)

  const initialLoadDone = useRef(!!persistedDash)
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Apply dashboard cache ────────────────────────────────────────────────
  const applyDashCache = useCallback((data: RawDashboardData) => {
    const now = Date.now()
    setCache(data)
    setCachedAt(now)
    saveToStorage(LS_KEY_DASHBOARD, data, now)
  }, [])

  // ── Initial full load — dashboard ────────────────────────────────────────
  const doInitialLoad = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboard('1m')
      applyDashCache(data)
      initialLoadDone.current = true
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [applyDashCache])

  // ── Initial full load — properties ───────────────────────────────────────
  const doLoadProperties = useCallback(async () => {
    setPropertiesLoading(true)
    setPropertiesError(null)
    try {
      const data = await fetchProperties()
      setProperties(data)
      saveToStorage(LS_KEY_PROPERTIES, data, Date.now())
    } catch (err: unknown) {
      setPropertiesError(err instanceof Error ? err.message : 'Failed to load properties')
    } finally {
      setPropertiesLoading(false)
    }
  }, [])

  // ── Initial full load — messages ─────────────────────────────────────────
  const doLoadMessages = useCallback(async () => {
    setMessagesLoading(true)
    setMessagesError(null)
    try {
      const data = await fetchMessages()
      setMessages(data)
      saveToStorage(LS_KEY_MESSAGES, data, Date.now())
    } catch (err: unknown) {
      setMessagesError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  // ── Incremental refresh ──────────────────────────────────────────────────
  const doIncrementalRefresh = useCallback(async () => {
    if (!initialLoadDone.current) return
    try {
      const fresh = await fetchDashboard(INCREMENTAL_WINDOW)
      setCache((prev) => {
        const merged = prev ? mergeDashboardData(prev, fresh) : fresh
        const now = Date.now()
        setCachedAt(now)
        saveToStorage(LS_KEY_DASHBOARD, merged, now)
        return merged
      })
    } catch {
      // Silently ignore
    }
    try {
      const [freshProps, freshMsgs] = await Promise.all([fetchProperties(), fetchMessages()])
      setProperties(freshProps)
      saveToStorage(LS_KEY_PROPERTIES, freshProps, Date.now())
      setMessages(freshMsgs)
      saveToStorage(LS_KEY_MESSAGES, freshMsgs, Date.now())
    } catch {
      // Silently ignore
    }
  }, [])

  // ── On mount ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const now = Date.now()

    if (persistedDash && now - persistedDash.cachedAt < CACHE_STALE_MS) {
      initialLoadDone.current = true
      setLoading(false)
    } else {
      doInitialLoad()
    }

    if (persistedProps && now - persistedProps.cachedAt < CACHE_STALE_MS) {
      setPropertiesLoading(false)
    } else {
      doLoadProperties()
    }

    if (persistedMsgs && now - persistedMsgs.cachedAt < CACHE_STALE_MS) {
      setMessagesLoading(false)
    } else {
      doLoadMessages()
    }

    intervalRef.current = setInterval(doIncrementalRefresh, REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Public reload ────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    await Promise.all([doInitialLoad(), doLoadProperties(), doLoadMessages()])
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

  // ── Optimistic: remove property (pending_deletion) ───────────────────────
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
  }, [])

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

  // ── Optimistic: remove lead (pending_deletion) ───────────────────────────
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
  }, [])

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardCache() {
  return useContext(DashboardCacheContext)
}
