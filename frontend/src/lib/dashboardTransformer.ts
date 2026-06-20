/**
 * dashboardTransformer.ts
 *
 * Single source of truth for all dashboard business logic.
 * DashboardPage.tsx must only render — no logic lives there.
 *
 * Responsibilities:
 *  - KPI calculations
 *  - Time-window filtering
 *  - Status breakdown
 *  - Activity feed formatting
 *  - Cache merge / deduplication
 */

// ---------------------------------------------------------------------------
// Types — Raw (from backend)
// ---------------------------------------------------------------------------

export type ActivityType =
  | 'lead_created'
  | 'message_received'
  | 'message_sent'
  | 'ai_disabled'
  | 'note_added'

export type TimeWindow = '1d' | '7d' | '1m' | '3m' | 'all'

export interface RawActivityItem {
  id: string
  type: ActivityType
  description: string
  timestamp: string
  leadName?: string | null
}

export interface RawLeadsByStatus {
  status: string
  count: number
}

export interface RawLead {
  id: number
  status: string
  createdAt: string
  name?: string | null
  source?: string | null
  aiEnabled?: boolean
  propertyId?: number | null // Added propertyId
}

export interface RawMessage {
  id: string
  direction: 'inbound' | 'outbound'
  sentAt: string
  leadId?: number | null
  channel?: 'sms' | 'email'
}

/**
 * The full shape returned by GET /api/dashboard
 * The backend always returns all-time totals for stable KPIs,
 * plus time-windowed arrays for filterable KPIs.
 */
export interface RawDashboardData {
  // Always all-time (backend excludes pending_deletion)
  totalLeads: number
  leadsByStatus: RawLeadsByStatus[]

  // Time-windowed arrays — frontend filters these by selected window
  leads: RawLead[]                        // all visible leads (for new-leads count)
  inboundMessages: RawMessage[]           // all inbound messages
  recentActivity: RawActivityItem[]       // all activity items

  // Needs Attention — always last-24h, computed by backend
  needsAttention: number

  // AI managed leads — leads where AI is still active
  aiManagedLeads: number

  totalProperties: number

  // Metadata
  fetchedAt: string                       // ISO timestamp of when backend computed this
}

// ---------------------------------------------------------------------------
// Types — Transformed (for UI)
// ---------------------------------------------------------------------------

export interface KpiCard {
  label: string
  value: number
  description: string
}

export interface StatusBar {
  status: string
  label: string
  count: number
  percentage: number
  color: string
}

export interface ActivityFeedItem {
  id: string
  type: ActivityType
  label: string
  leadName?: string | null
  timestamp: string
}

export interface TransformedDashboard {
  kpis: KpiCard[]
  statusBars: StatusBar[]
  activityFeed: ActivityFeedItem[]
  totalProperties: number
}

// ---------------------------------------------------------------------------
// Cache types
// ---------------------------------------------------------------------------

export interface DashboardCache {
  data: RawDashboardData
  cachedAt: number // Date.now()
}

// ---------------------------------------------------------------------------
// Time window helpers
// ---------------------------------------------------------------------------

/** Returns the cutoff Date for a given TimeWindow, or null for 'all' */
export function getWindowCutoff(window: TimeWindow): Date | null {
  const now = Date.now()
  switch (window) {
    case '1d':  return new Date(now - 1  * 24 * 60 * 60 * 1000)
    case '7d':  return new Date(now - 7  * 24 * 60 * 60 * 1000)
    case '1m':  return new Date(now - 30 * 24 * 60 * 60 * 1000)
    case '3m':  return new Date(now - 90 * 24 * 60 * 60 * 1000)
    case 'all': return null
  }
}

/** Maps TimeWindow to a human-readable label */
export const WINDOW_LABELS: Record<TimeWindow, string> = {
  '1d':  'Last 24 Hours',
  '7d':  'Last 7 Days',
  '1m':  'Last Month',
  '3m':  'Last 3 Months',
  'all': 'All Time',
}

export const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '1d',  label: '1 Day' },
  { value: '7d',  label: '7 Days' },
  { value: '1m',  label: '1 Month' },
  { value: '3m',  label: '3 Months' },
  { value: 'all', label: 'All Time' },
]

export const DEFAULT_WINDOW: TimeWindow = '1m'

// ---------------------------------------------------------------------------
// Cache merge / deduplication
// ---------------------------------------------------------------------------

/**
 * Merges a fresh incremental batch into the existing cached dataset.
 * Deduplicates by id for all arrays.
 * Always takes the fresher item when there is a conflict.
 */
export function mergeDashboardData(
  cached: RawDashboardData,
  fresh: RawDashboardData
): RawDashboardData {
  // Merge leads — deduplicate by id, prefer fresh
  const leadMap = new Map<number, RawLead>()
  for (const l of cached.leads ?? []) leadMap.set(l.id, l)
  for (const l of fresh.leads ?? [])  leadMap.set(l.id, l) // fresh overwrites

  // Merge inbound messages — deduplicate by id, prefer fresh
  const msgMap = new Map<string, RawMessage>()
  for (const m of cached.inboundMessages ?? []) msgMap.set(m.id, m)
  for (const m of fresh.inboundMessages  ?? []) msgMap.set(m.id, m)

  // Merge activity — deduplicate by id, prefer fresh
  const actMap = new Map<string, RawActivityItem>()
  for (const a of cached.recentActivity ?? []) actMap.set(a.id, a)
  for (const a of fresh.recentActivity  ?? []) actMap.set(a.id, a)

  // Sort activity newest-first after merge
  const mergedActivity = Array.from(actMap.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return {
    // Stable all-time values — always take the freshest
    totalLeads:      fresh.totalLeads,
    leadsByStatus:   fresh.leadsByStatus,
    needsAttention:  fresh.needsAttention,
    aiManagedLeads:  fresh.aiManagedLeads,
    totalProperties: fresh.totalProperties,
    fetchedAt:       fresh.fetchedAt,

    // Merged arrays
    leads:            Array.from(leadMap.values()),
    inboundMessages:  Array.from(msgMap.values()),
    recentActivity:   mergedActivity,
  }
}

// ---------------------------------------------------------------------------
// KPI builders
// ---------------------------------------------------------------------------

function buildKpiCards(
  data: RawDashboardData,
  window: TimeWindow
): KpiCard[] {
  const cutoff = getWindowCutoff(window)

  // New Leads — filtered by window
  const newLeads = cutoff
    ? (data.leads ?? []).filter((l) => new Date(l.createdAt) >= cutoff).length
    : (data.leads ?? []).length

  // Messages Received — filtered by window
  const messagesReceived = cutoff
    ? (data.inboundMessages ?? []).filter((m) => new Date(m.sentAt) >= cutoff).length
    : (data.inboundMessages ?? []).length

  const windowLabel = WINDOW_LABELS[window].toLowerCase()

  return [
    {
      label: 'Total Leads',
      value: data.totalLeads,
      description: 'All active leads in your CRM',
    },
    {
      label: 'New Leads',
      value: newLeads,
      description: `Created in the ${windowLabel}`,
    },
    {
      label: 'Messages Received',
      value: messagesReceived,
      description: `Inbound SMS & email, ${windowLabel}`,
    },
    {
      label: 'Needs Attention',
      value: data.needsAttention,
      description: 'Inbound with no reply in last 24h',
    },
  ]
}

// ---------------------------------------------------------------------------
// Status bars
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: 'New',         color: 'bg-blue-500'    },
  active:    { label: 'Active',      color: 'bg-emerald-500' },
  cold:      { label: 'Cold',        color: 'bg-slate-400'   },
  converted: { label: 'AI Disabled', color: 'bg-orange-400'  },
}

const STATUS_ORDER = ['new', 'active', 'cold', 'converted']

function buildStatusBars(leadsByStatus: RawLeadsByStatus[]): StatusBar[] {
  const total = leadsByStatus?.reduce((sum, s) => sum + s.count, 0) || 0

  return STATUS_ORDER.map((status) => {
    const found  = leadsByStatus?.find((s) => s.status === status)
    const count  = found?.count ?? 0
    const config = STATUS_CONFIG[status] ?? { label: status, color: 'bg-slate-400' }

    return {
      status,
      label:      config.label,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color:      config.color,
    }
  })
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  lead_created:     'New lead created',
  message_received: 'Message received',
  message_sent:     'AI replied',
  ai_disabled:      'Lead handed off to agent',
  note_added:       'Note added',
}

function buildActivityFeed(
  activity: RawActivityItem[],
  window: TimeWindow
): ActivityFeedItem[] {
  const cutoff = getWindowCutoff(window)

  const filtered = cutoff
    ? (activity ?? []).filter((a) => new Date(a.timestamp) >= cutoff)
    : (activity ?? [])

  return filtered
    .slice(0, 30)
    .map((item) => ({
      id:        item.id,
      type:      item.type,
      label:     item.description || ACTIVITY_LABEL[item.type] || item.type,
      leadName:  item.leadName ?? null,
      timestamp: item.timestamp,
    }))
}

// ---------------------------------------------------------------------------
// Master transformer
// ---------------------------------------------------------------------------

/**
 * Transforms raw backend data into UI-ready structures.
 * All filtering by time window happens here.
 *
 * @param raw    - merged cached backend data
 * @param window - currently selected time window
 */
export function transformDashboardData(
  raw: RawDashboardData,
  window: TimeWindow = DEFAULT_WINDOW
): TransformedDashboard {
  return {
    kpis:            buildKpiCards(raw, window),
    statusBars:      buildStatusBars(raw.leadsByStatus),
    activityFeed:    buildActivityFeed(raw.recentActivity, window),
    totalProperties: raw.totalProperties,
  }
}
