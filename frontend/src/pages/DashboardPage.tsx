/**
 * DashboardPage.tsx
 *
 * Responsibilities:
 *  - Consume dashboard cache from DashboardCacheContext
 *  - Pass data through dashboardTransformer
 *  - Render UI — NO business logic here
 */

import { useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users,
  Building2,
  MessageSquare,
  ArrowUpRight,
  Activity,
  UserPlus,
  Inbox,
  CheckCircle2,
  StickyNote,
  ShieldAlert,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { formatRelativeTime } from '../lib/utils'

import {
  transformDashboardData,
  TIME_WINDOW_OPTIONS,
  DEFAULT_WINDOW,
  WINDOW_LABELS,
} from '../lib/dashboardTransformer'
import type {
  TransformedDashboard,
  TimeWindow,
  ActivityType,
} from '../lib/dashboardTransformer'

import { useDashboardCache } from '../hooks/useDashboardCache'

// ---------------------------------------------------------------------------
// Activity icon
// ---------------------------------------------------------------------------

function ActivityIcon({ type }: { type: ActivityType }) {
  const icons = { lead_created: UserPlus, message_received: Inbox, message_sent: MessageSquare, ai_disabled: CheckCircle2, note_added: StickyNote }
  const Icon = icons[type] ?? Activity

  return (
    <div aria-hidden="true" className="w-6 h-6 text-primary flex items-center justify-center flex-shrink-0">
      <Icon className="w-3.5 h-3.5" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI icon mapping (order matches transformer output)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Time window dropdown
// ---------------------------------------------------------------------------

function TimeWindowDropdown({
  value,
  onChange,
}: {
  value: TimeWindow
  onChange: (w: TimeWindow) => void
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Period
      <select value={value} onChange={(e) => onChange(e.target.value as TimeWindow)}
        className="min-h-11 rounded-md border border-input bg-card px-3 text-sm text-foreground">
        {TIME_WINDOW_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{WINDOW_LABELS[opt.value]}</option>)}
      </select>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const { cache, loading, error, reload } = useDashboardCache()

  const windowParam = searchParams.get('since') as TimeWindow | null
  const validWindows = new Set<TimeWindow>(['1d', '7d', '1m', '3m', 'all'])
  const selectedWindow: TimeWindow =
    windowParam && validWindows.has(windowParam) ? windowParam : DEFAULT_WINDOW

  const setWindow = useCallback(
    (w: TimeWindow) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('since', w)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const dashboard: TransformedDashboard | null = useMemo(() => {
    if (!cache) return null
    return transformDashboardData(cache, selectedWindow)
  }, [cache, selectedWindow])

  // Count unverified leads from cache for the attention banner
  const unverifiedCount = useMemo(() => {
    if (!cache?.leads) return 0
    return cache.leads.filter((l) => l.status === 'unverified').length
  }, [cache])

  if (error && !cache) {
    return <ErrorState message={error} onRetry={reload} />
  }

  return (
    <div className="crm-workspace space-y-5">
      {/* Page header */}
      <div className="crm-page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="crm-page-title">Overview</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date())}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TimeWindowDropdown value={selectedWindow} onChange={setWindow} />
          <button
            onClick={() => navigate('/leads')}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline transition-colors"
          >
            View all leads
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unverified leads attention banner */}
      {unverifiedCount > 0 && (
        <section aria-label="Verification attention" className="crm-attention">
          <ShieldAlert aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm flex-1 min-w-0">
            <span className="font-semibold">
              {unverifiedCount} unverified lead{unverifiedCount !== 1 ? 's' : ''}
            </span>
            {' '}require your review before they can be contacted.
          </p>
          <button
            onClick={() => navigate('/leads?filter=unverified')}
            className="text-sm font-semibold underline underline-offset-4 flex-shrink-0"
          >
            Review now
          </button>
        </section>
      )}

      {/* KPI Cards */}
      <dl aria-label="Lead metrics" className="crm-kpi-strip">
        {loading || !dashboard
          ? Array.from({ length: 4 }).map((_, i) => <div key={i}><dt className="sr-only">Loading metric</dt><dd><Skeleton className="h-16 w-full" /></dd></div>)
          : dashboard.kpis.map(({ label, value, description }) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="crm-numeric text-3xl font-semibold mt-1">{value}</dd>
                <dd className="text-xs text-muted-foreground mt-1">{description}</dd>
              </div>
            ))}
      </dl>

      <div className="crm-inspect-grid">
        {/* Activity Feed */}
        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>

            {loading || !dashboard ? (
              <div className="p-5 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-7 h-7 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : dashboard.activityFeed.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground">
                No activity in the selected time window.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {dashboard.activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-3 hover:bg-background transition-colors"
                  >
                    <ActivityIcon type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                        {item.leadName && (
                          <span className="text-primary">{item.leadName} — </span>
                        )}
                        {item.label}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="min-w-0 space-y-4">
          {/* Lead Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Leads by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {loading || !dashboard ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-8" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.statusBars.map(({ status, label, count, percentage }) => (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {status === 'unverified' && (
                            <ShieldAlert aria-hidden="true" className="w-3 h-3 text-caution" />
                          )}
                          <span className={`text-sm font-medium ${status === 'unverified' ? 'text-caution' : 'text-muted-foreground'}`}>
                            {label}
                          </span>
                        </div>
                        <span className={`text-sm font-medium ${status === 'unverified' && count > 0 ? 'text-caution' : 'text-foreground'}`}>
                          {count}
                        </span>
                      </div>
                      <div aria-hidden="true" className="h-1.5 bg-muted rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${status === 'unverified' ? 'bg-caution' : 'bg-primary'} rounded-sm transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: 'View all leads',    icon: Users,         to: '/leads'      },
                { label: 'Check messages',    icon: MessageSquare, to: '/messages'   },
                { label: 'Browse properties', icon: Building2,     to: '/properties' },
              ].map(({ label, icon: Icon, to }) => (
                <button
                  key={to}
                  onClick={() => navigate(to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-primary hover:bg-accent transition-colors text-left"
                >
                  <Icon aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  {label}
                  <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
