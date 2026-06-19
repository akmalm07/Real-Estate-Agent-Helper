import { useApi } from '../hooks/useApi'
import type { DashboardData } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { SkeletonCard, Skeleton } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { LeadStatusBadge } from '../components/ui/Badge'
import {
  Users,
  TrendingUp,
  Building2,
  MessageSquare,
  ArrowUpRight,
  Activity,
  UserPlus,
  CheckCircle2,
  StickyNote,
  RefreshCw,
} from 'lucide-react'
import { formatRelativeTime } from '../lib/utils'
import { useNavigate } from 'react-router-dom'
import { BACKEND_URL } from '../consts'

const MOCK_DASHBOARD: DashboardData = {
  totalLeads: 248,
  activeLeads: 87,
  convertedLeads: 34,
  newLeadsToday: 12,
  totalProperties: 56,
  recentActivity: [
    { id: '1', type: 'lead_created', description: 'New lead from Zillow', timestamp: new Date(Date.now() - 300000).toISOString(), leadName: 'Sarah Mitchell' },
    { id: '2', type: 'message_sent', description: 'SMS reply sent', timestamp: new Date(Date.now() - 900000).toISOString(), leadName: 'James Carter' },
    { id: '3', type: 'lead_converted', description: 'Lead converted to client', timestamp: new Date(Date.now() - 3600000).toISOString(), leadName: 'Emily Torres' },
    { id: '4', type: 'note_added', description: 'Note added to lead', timestamp: new Date(Date.now() - 7200000).toISOString(), leadName: 'Robert Kim' },
    { id: '5', type: 'status_changed', description: 'Status changed to Active', timestamp: new Date(Date.now() - 14400000).toISOString(), leadName: 'Linda Park' },
    { id: '6', type: 'lead_created', description: 'New lead from Realtor.com', timestamp: new Date(Date.now() - 21600000).toISOString(), leadName: 'David Chen' },
  ],
  leadsByStatus: [
    { status: 'new', count: 45 },
    { status: 'active', count: 87 },
    { status: 'cold', count: 82 },
    { status: 'converted', count: 34 },
  ],
}

function ActivityIcon({ type }: { type: string }) {
  const config: Record<string, { icon: React.ReactNode; bg: string }> = {
    lead_created: { icon: <UserPlus className="w-3.5 h-3.5 text-[#4f46e5]" />, bg: 'bg-[#eef2ff]' },
    message_sent: { icon: <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />, bg: 'bg-emerald-50' },
    lead_converted: { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />, bg: 'bg-emerald-50' },
    note_added: { icon: <StickyNote className="w-3.5 h-3.5 text-amber-600" />, bg: 'bg-amber-50' },
    status_changed: { icon: <RefreshCw className="w-3.5 h-3.5 text-[#94a3b8]" />, bg: 'bg-[#f9fafb]' },
  }
  const { icon, bg } = config[type] ?? { icon: <Activity className="w-3.5 h-3.5 text-[#94a3b8]" />, bg: 'bg-[#f9fafb]' }
  return (
    <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
  )
}

export function DashboardPage() {
  const { data, loading, error, refetch } = useApi<DashboardData>(`${BACKEND_URL}api/dashboard`)
  const navigate = useNavigate()

  const dashboard = data ?? MOCK_DASHBOARD

  const kpis = [
    {
      label: 'Total Leads',
      value: dashboard.totalLeads,
      icon: Users,
      change: '+12%',
      positive: true,
    },
    {
      label: 'Active Leads',
      value: dashboard.activeLeads,
      icon: Activity,
      change: '+5%',
      positive: true,
    },
    {
      label: 'Converted',
      value: dashboard.convertedLeads,
      icon: TrendingUp,
      change: '+8%',
      positive: true,
    },
    {
      label: 'New Today',
      value: dashboard.newLeadsToday,
      icon: UserPlus,
      change: '+3',
      positive: true,
    },
  ]

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Overview</h2>
          <p className="text-sm text-[#94a3b8] mt-0.5">
            {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
          </p>
        </div>
        <button
          onClick={() => navigate('/leads')}
          className="flex items-center gap-1.5 text-sm font-medium text-[#4f46e5] hover:text-[#4338ca] transition-colors"
        >
          View all leads
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : kpis.map(({ label, value, icon: Icon, change, positive }) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center">
                      <Icon className="w-4 h-4 text-[#4f46e5]" />
                    </div>
                    <span
                      className={`text-xs font-medium flex items-center gap-0.5 ${
                        positive ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      {change}
                    </span>
                  </div>
                  <p className="text-2xl font-semibold text-[#0f172a]">{value}</p>
                  <p className="text-xs text-[#94a3b8] mt-0.5">{label}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            {loading ? (
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
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {dashboard.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f9fafb] transition-colors">
                    <ActivityIcon type={item.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0f172a] truncate">
                        {item.leadName && (
                          <span className="text-[#4f46e5]">{item.leadName} — </span>
                        )}
                        {item.description}
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

        {/* Lead Status Breakdown */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Leads by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-5 w-20 rounded-md" />
                      <Skeleton className="h-4 w-8" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.leadsByStatus.map(({ status, count }) => {
                    const total = dashboard.leadsByStatus.reduce((s, x) => s + x.count, 0)
                    const pct = Math.round((count / total) * 100)
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1">
                          <LeadStatusBadge status={status} />
                          <span className="text-sm font-medium text-[#0f172a]">{count}</span>
                        </div>
                        <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#4f46e5] rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
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
                { label: 'View all leads', icon: Users, to: '/leads' },
                { label: 'Check messages', icon: MessageSquare, to: '/messages' },
                { label: 'Browse properties', icon: Building2, to: '/properties' },
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
