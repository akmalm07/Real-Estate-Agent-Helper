/**
 * DashboardPage.tsx
 *
 * Responsibilities:
 *  - Consume dashboard cache from DashboardCacheContext
 *  - Pass data through dashboardTransformer
 *  - Render UI — NO business logic here
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users,
  Building2,
  MessageSquare,
  ArrowUpRight,
  Activity,
  UserPlus,
  BellRing,
  Inbox,
  CheckCircle2,
  StickyNote,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { SkeletonCard, Skeleton } from '../components/ui/Skeleton'
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

import { useDashboardCache } from '../context/DashboardCacheContext'

// ---------------------------------------------------------------------------
// Activity icon
// ---------------------------------------------------------------------------

function ActivityIcon({ type }: { type: ActivityType }) {
  const config: Record<ActivityType, { icon: React.ReactNode; bg: string }> = {
    lead_created: {
      icon: <UserPlus className="w-3.5 h-3.5 text-blue-600" />,
      bg: 'bg-blue-50',
    },
    message_received: {
      icon: <Inbox className="w-3.5 h-3.5 text-emerald-600" />,
      bg: 'bg-emerald-50',
    },
    message_sent: {
      icon: <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />,
      bg: 'bg-indigo-50',
    },
    ai_disabled: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-orange-500" />,
      bg: 'bg-orange-50',
    },
    note_added: {
      icon: <StickyNote className="w-3.5 h-3.5 text-amber-600" />,
      bg: 'bg-amber-50',
    },
  }

  const { icon, bg } = config[type] ?? {
    icon: <Activity className="w-3.5 h-3.5 text-slate-400" />,
    bg: 'bg-slate-50',
  }

  return (
    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KPI icon mapping (order matches transformer output)
// ---------------------------------------------------------------------------

const KPI_ICONS = [Users, UserPlus, Inbox, BellRing]

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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white text-sm font-medium text-[#475569] hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-colors"
      >
        {WINDOW_LABELS[value]}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-40 bg-white border border-[#e2e8f0] rounded-lg shadow-lg z-20 py-1 overflow-hidden">
          {TIME_WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value
                  ? 'bg-[#eef2ff] text-[#4f46e5] font-medium'
                  : 'text-[#475569] hover:bg-[#f8fafc]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#0f172a]">Overview</h2>
          </div>
          <p className="text-sm text-[#94a3b8] mt-0.5">
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date())}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <TimeWindowDropdown value={selectedWindow} onChange={setWindow} />
          <button
            onClick={() => navigate('/leads')}
            className="flex items-center gap-1.5 text-sm font-medium text-[#4f46e5] hover:text-[#4338ca] transition-colors"
          >
            View all leads
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Unverified leads attention banner */}
      {unverifiedCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <span className="font-semibold">
              {unverifiedCount} unverified lead{unverifiedCount !== 1 ? 's' : ''}
            </span>
            {' '}require your review before they can be contacted.
          </p>
          <button
            onClick={() => navigate('/leads?filter=unverified')}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors flex-shrink-0"
          >
            Review now
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !dashboard
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : dashboard.kpis.map(({ label, value, description }, i) => {
              const Icon = KPI_ICONS[i] ?? Activity
              return (
                <Card key={label}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                        <Icon className="w-4 h-4 text-[#4f46e5]" />
                      </div>
                    </div>
                    <p className="text-2xl font-semibold text-[#0f172a]">{value}</p>
                    <p className="text-xs font-medium text-[#0f172a] mt-0.5">{label}</p>
                    <p className="text-xs text-[#94a3b8] mt-0.5">{description}</p>
                  </CardContent>
                </Card>
              )
            })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2">
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
              <div className="p-8 text-center text-sm text-[#94a3b8]">
                No activity in the selected time window.
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {dashboard.activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f9fafb] transition-colors"
                  >
                    <ActivityIcon type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0f172a] truncate">
                        {item.leadName && (
                          <span className="text-[#4f46e5]">{item.leadName} — </span>
                        )}
                        {item.label}
                      </p>
                    </div>
                    <span className="text-xs text-[#94a3b8] flex-shrink-0">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
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
                  {dashboard.statusBars.map(({ status, label, count, percentage, color }) => (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          {status === 'unverified' && (
                            <ShieldAlert className="w-3 h-3 text-amber-500" />
                          )}
                          <span className={`text-sm font-medium ${status === 'unverified' ? 'text-amber-700' : 'text-[#475569]'}`}>
                            {label}
                          </span>
                        </div>
                        <span className={`text-sm font-medium ${status === 'unverified' && count > 0 ? 'text-amber-700' : 'text-[#0f172a]'}`}>
                          {count}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${color} rounded-full transition-all duration-500`}
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#475569] hover:bg-[#f9fafb] hover:text-[#0f172a] transition-colors text-left"
                >
                  <Icon className="w-4 h-4 text-[#94a3b8]" />
                  {label}
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-[#94a3b8]" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
