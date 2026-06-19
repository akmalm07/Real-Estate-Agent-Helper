import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import type { Lead } from '../services/api'
import { Card } from '../components/ui/Card'
import { LeadStatusBadge } from '../components/ui/Badge'
import { SkeletonTable } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import {
  Search,
  Users,
  ChevronRight,
  ArrowUpDown,
  Filter,
} from 'lucide-react'
import { formatRelativeTime, getInitials } from '../lib/utils'
import { BACKEND_URL } from '../consts'

const MOCK_LEADS: Lead[] = [
  { id: '1', name: 'Sarah Mitchell', email: 'sarah@example.com', phone: '+1 555-0101', status: 'active', source: 'Zillow', score: 82, createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 3600000).toISOString(), propertyInterest: '3BR in Austin' },
  { id: '2', name: 'James Carter', email: 'james@example.com', phone: '+1 555-0102', status: 'new', source: 'Realtor.com', score: 65, createdAt: new Date(Date.now() - 172800000).toISOString(), updatedAt: new Date(Date.now() - 7200000).toISOString(), propertyInterest: 'Condo downtown' },
  { id: '3', name: 'Emily Torres', email: 'emily@example.com', phone: '+1 555-0103', status: 'converted', source: 'Referral', score: 95, createdAt: new Date(Date.now() - 604800000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString(), propertyInterest: '4BR suburban' },
  { id: '4', name: 'Robert Kim', email: 'robert@example.com', phone: '+1 555-0104', status: 'cold', source: 'Zillow', score: 28, createdAt: new Date(Date.now() - 1209600000).toISOString(), updatedAt: new Date(Date.now() - 432000000).toISOString(), propertyInterest: 'Investment property' },
  { id: '5', name: 'Linda Park', email: 'linda@example.com', phone: '+1 555-0105', status: 'active', source: 'Direct', score: 74, createdAt: new Date(Date.now() - 259200000).toISOString(), updatedAt: new Date(Date.now() - 14400000).toISOString(), propertyInterest: '2BR near schools' },
  { id: '6', name: 'David Chen', email: 'david@example.com', phone: '+1 555-0106', status: 'new', source: 'Realtor.com', score: 58, createdAt: new Date(Date.now() - 43200000).toISOString(), updatedAt: new Date(Date.now() - 43200000).toISOString(), propertyInterest: 'Townhouse' },
  { id: '7', name: 'Maria Gonzalez', email: 'maria@example.com', phone: '+1 555-0107', status: 'opted_out', source: 'Zillow', score: 10, createdAt: new Date(Date.now() - 2592000000).toISOString(), updatedAt: new Date(Date.now() - 2592000000).toISOString() },
]

const STATUS_FILTERS = ['all', 'new', 'active', 'cold', 'converted', 'opted_out']

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 75 ? 'text-emerald-700 bg-emerald-50' :
    score >= 50 ? 'text-amber-700 bg-amber-50' :
    'text-[#94a3b8] bg-[#f9fafb]'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${color}`}>
      {score}
    </span>
  )
}

export function LeadsPage() {
  const { data, loading, error, refetch } = useApi<Lead[]>(`${BACKEND_URL}api/leads`)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const leads = data ?? MOCK_LEADS

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        !search ||
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase()) ||
        lead.source.toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [leads, search, statusFilter])

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Leads</h2>
          <p className="text-sm text-[#94a3b8] mt-0.5">{leads.length} total leads</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="px-5 py-3 flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              icon={Search}
              placeholder="Search by name, email, or source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                  statusFilter === s
                    ? 'bg-[#4f46e5] text-white'
                    : 'bg-[#f9fafb] text-[#475569] hover:bg-[#eef2ff] hover:text-[#4f46e5]'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="border-t border-[#e5e7eb]">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-4 px-5 py-2.5 bg-[#f9fafb] border-b border-[#e5e7eb]">
            {['Name', 'Contact', 'Source', 'Status', 'Score'].map((h) => (
              <div key={h} className="flex items-center gap-1 text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">
                {h}
                <ArrowUpDown className="w-3 h-3" />
              </div>
            ))}
            <div />
          </div>

          {loading ? (
            <SkeletonTable rows={7} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No leads found"
              description="Try adjusting your search or filter to find what you're looking for."
            />
          ) : (
            <div className="divide-y divide-[#e5e7eb]">
              {filtered.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  className="grid grid-cols-1 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_40px] gap-4 px-5 py-3.5 hover:bg-[#f9fafb] cursor-pointer transition-colors items-center"
                >
                  {/* Name */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#eef2ff] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-[#4f46e5]">
                        {getInitials(lead.name)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0f172a] truncate">{lead.name}</p>
                      <p className="text-xs text-[#94a3b8] truncate sm:hidden">{lead.email}</p>
                      <p className="text-xs text-[#94a3b8] mt-0.5">
                        {formatRelativeTime(lead.updatedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="hidden sm:block min-w-0">
                    <p className="text-sm text-[#0f172a] truncate">{lead.email}</p>
                    <p className="text-xs text-[#94a3b8] truncate">{lead.phone}</p>
                  </div>

                  {/* Source */}
                  <div className="hidden sm:block">
                    <span className="text-sm text-[#475569]">{lead.source}</span>
                  </div>

                  {/* Status */}
                  <div className="hidden sm:block">
                    <LeadStatusBadge status={lead.status} />
                  </div>

                  {/* Score */}
                  <div className="hidden sm:block">
                    <ScorePill score={lead.score} />
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex justify-end">
                    <ChevronRight className="w-4 h-4 text-[#94a3b8]" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
