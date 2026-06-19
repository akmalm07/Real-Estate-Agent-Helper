import { useState } from 'react'
import { useApi } from '../hooks/useApi'
import type { Property } from '../services/api'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { SkeletonCard } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { Search, Building2, Bed, Bath, Square } from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/utils'
import { BACKEND_URL } from '../consts'

const MOCK_PROPERTIES: Property[] = [
  { id: '1', address: '1234 Oak Street, Austin, TX 78701', price: 425000, bedrooms: 3, bathrooms: 2, sqft: 1850, status: 'open', source: 'Zillow', externalId: 'z123', createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '2', address: '567 Maple Ave, Austin, TX 78702', price: 680000, bedrooms: 4, bathrooms: 3, sqft: 2600, status: 'under_contract', source: 'Realtor.com', externalId: 'r456', createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: '3', address: '890 Pine Blvd, Austin, TX 78703', price: 320000, bedrooms: 2, bathrooms: 2, sqft: 1200, status: 'open', source: 'Zillow', externalId: 'z789', createdAt: new Date(Date.now() - 259200000).toISOString() },
  { id: '4', address: '234 Cedar Lane, Austin, TX 78704', price: 895000, bedrooms: 5, bathrooms: 4, sqft: 3800, status: 'sold', source: 'Direct', createdAt: new Date(Date.now() - 604800000).toISOString() },
  { id: '5', address: '456 Elm Court, Austin, TX 78705', price: 540000, bedrooms: 3, bathrooms: 2.5, sqft: 2100, status: 'open', source: 'Realtor.com', externalId: 'r012', createdAt: new Date(Date.now() - 43200000).toISOString() },
  { id: '6', address: '789 Birch Way, Austin, TX 78706', price: 375000, bedrooms: 3, bathrooms: 2, sqft: 1650, status: 'open', source: 'Zillow', externalId: 'z345', createdAt: new Date(Date.now() - 21600000).toISOString() },
]

function PropertyStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
    open: { label: 'Open', variant: 'success' },
    under_contract: { label: 'Under Contract', variant: 'warning' },
    sold: { label: 'Sold', variant: 'muted' },
  }
  const { label, variant } = config[status] ?? { label: status, variant: 'muted' }
  return <Badge variant={variant}>{label}</Badge>
}

export function PropertiesPage() {
  const { data, loading, error, refetch } = useApi<Property[]>(`${BACKEND_URL}api/properties`)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const properties = data ?? MOCK_PROPERTIES

  const filtered = properties.filter((p) => {
    const matchesSearch = !search || p.address.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#0f172a]">Properties</h2>
          <p className="text-sm text-[#94a3b8] mt-0.5">{properties.length} total properties</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            icon={Search}
            placeholder="Search by address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {['all', 'open', 'under_contract', 'sold'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-[#4f46e5] text-white'
                  : 'bg-white border border-[#e5e7eb] text-[#475569] hover:bg-[#f9fafb]'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No properties found"
            description="Try adjusting your search or filter."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((property) => (
            <Card key={property.id} className="overflow-hidden">
              {/* Image placeholder */}
              <div className="h-40 bg-[#f1f5f9] flex items-center justify-center border-b border-[#e5e7eb]">
                <img
                  src={`https://placehold.co/400x160/eef2ff/4f46e5?text=${encodeURIComponent(property.bedrooms + 'BR+Property')}&font=lato`}
                  alt="Property"
                  className="w-full h-full object-cover"
                />
              </div>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-[#0f172a] leading-snug line-clamp-2">
                    {property.address}
                  </p>
                  <PropertyStatusBadge status={property.status} />
                </div>
                <p className="text-lg font-semibold text-[#4f46e5] mb-3">
                  {formatCurrency(property.price)}
                </p>
                <div className="flex items-center gap-3 text-xs text-[#475569]">
                  <span className="flex items-center gap-1">
                    <Bed className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {property.bedrooms} bd
                  </span>
                  <span className="flex items-center gap-1">
                    <Bath className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {property.bathrooms} ba
                  </span>
                  <span className="flex items-center gap-1">
                    <Square className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {property.sqft.toLocaleString()} sqft
                  </span>
                </div>
                <div className="mt-3 pt-3 border-t border-[#f1f5f9] flex items-center justify-between">
                  <span className="text-xs text-[#94a3b8]">{property.source}</span>
                  <span className="text-xs text-[#94a3b8]">{formatDate(property.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
