import { useState, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/ui/Card'
import { LeadStatusBadge } from '../components/ui/Badge'
import { SkeletonTable } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import {
  Search, Users, Filter, UserPlus,
  ShieldAlert, AlertTriangle, CheckCircle2, Trash2,
} from 'lucide-react'
import { formatRelativeTime, getInitials } from '../lib/utils'
import { useDashboardCache } from '../hooks/useDashboardCache'
import { searchAndRank, useDebounce } from '../lib/searchUtils'
import { sortItems, toggleSort } from '../lib/tableSortUtils'
import type { SortState } from '../lib/tableSortUtils'
import { BACKEND_URL } from '../consts'
import type { RawDashboardData } from '../lib/dashboardTransformer'

import type { Lead, LeadSortKey } from '../components/leads/types'
import { LeadModal }             from '../components/leads/LeadModal'
import { DeleteLeadModal }       from '../components/leads/DeleteLeadModal'
import { DeleteUnverifiedModal } from '../components/leads/DeleteUnverifiedModal'
import { VerifyLeadModal }       from '../components/leads/VerifyLeadModal'
import { LeadMenu }              from '../components/leads/LeadMenu'
import { LeadReadyIndicator }    from '../components/leads/LeadReadyIndicator'
import { SortableHeader, HighlightedText } from '../components/leads/LeadFormShared'

type RawLead = RawDashboardData['leads'][number]

const STATUS_FILTERS = [
  ['all', 'all'], ['unverified', 'unverified'], ['new', 'new'],
  ['active', 'active'], ['cold', 'cold'], ['AI Disabled', 'converted'],
]

export function LeadsPage() {
  const { cache, loading, error, reload, addLead, updateLead, removeLead, properties } = useDashboardCache()

  const [searchRaw, setSearchRaw]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort]                 = useState<SortState<LeadSortKey>>({ key: 'name', direction: 'asc' })
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'warning' } | null>(null)

  const [modalMode, setModalMode]       = useState<'add' | 'edit'>('add')
  const [editTarget, setEditTarget]     = useState<Lead | undefined>(undefined)
  const [showModal, setShowModal]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting]         = useState(false)

  const [verifyTarget, setVerifyTarget]                     = useState<Lead | null>(null)
  const [deleteUnverifiedTarget, setDeleteUnverifiedTarget] = useState<Lead | null>(null)
  const [deletingUnverified, setDeletingUnverified]         = useState(false)

  const search = useDebounce(searchRaw, 200)

  const showToast = useCallback((message: string, type: 'success' | 'warning' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const leads: Lead[] = useMemo(() => {
    if (!cache?.leads) return []
    return cache.leads.map((l) => ({
      id:         String(l.id),
      name:       l.name   ?? 'Unknown',
      email:      l.email  ?? '',
      phone:      l.phone  ?? '',
      status:     l.status as Lead['status'],
      source:     l.source ?? 'Unknown',
      score:      0,
      createdAt:  l.createdAt,
      updatedAt:  l.createdAt,
      propertyId: l.propertyId ?? null,
    }))
  }, [cache])

  const unverifiedCount = useMemo(() => leads.filter((l) => l.status === 'unverified').length, [leads])

  // Build property options for the modal, ensuring `address` is always a
  // non-empty string so the dropdown label is never blank.
  const propertyOptions = useMemo(() => properties.map((p) => {
    const raw: { addressLine1?: string | null; address?: string | null } = p
    const address = (raw.addressLine1 ?? raw.address ?? '').trim()
    return {
      id:           String(p.id),
      address:      address || `Property #${p.id}`,
      addressLine1: raw.addressLine1 ?? '',
    }
  }), [properties])

  const handleSort = useCallback((key: LeadSortKey) => setSort((prev) => toggleSort(prev, key)), [])

  const openAdd  = useCallback(() => { setModalMode('add');  setEditTarget(undefined); setShowModal(true) }, [])
  const openEdit = useCallback((lead: Lead) => { setModalMode('edit'); setEditTarget(lead); setShowModal(true) }, [])

  const handleModalSuccess = useCallback((lead: Lead, warning?: string) => {
    const raw: RawLead = {
      id: Number(lead.id), status: lead.status, createdAt: lead.createdAt,
      name: lead.name, source: lead.source, propertyId: lead.propertyId,
    }
    if (modalMode === 'add') { addLead(raw);    if (warning) showToast(warning, 'warning'); else showToast('Lead added successfully!') }
    else                     { updateLead(raw); showToast('Lead updated successfully!') }
    setShowModal(false)
  }, [modalMode, addLead, updateLead, showToast])

  const handleVerifySuccess = useCallback((warning?: string) => {
    if (!verifyTarget) return
    updateLead({
      id: Number(verifyTarget.id), status: 'active', createdAt: verifyTarget.createdAt,
      name: verifyTarget.name, source: verifyTarget.source, propertyId: verifyTarget.propertyId,
    })
    setVerifyTarget(null)
    if (warning) showToast(warning, 'warning'); else showToast('Lead verified and activated!')
  }, [verifyTarget, updateLead, showToast])

  const handleDeleteUnverifiedConfirm = useCallback(async () => {
    if (!deleteUnverifiedTarget) return
    setDeletingUnverified(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/leads/verify/${deleteUnverifiedTarget.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: false }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); showToast(b.error ?? 'Failed to delete lead.', 'warning'); return }
      removeLead(Number(deleteUnverifiedTarget.id))
      showToast('Unverified lead permanently deleted.')
    } catch { showToast('Network error. Please try again.', 'warning') }
    finally  { setDeletingUnverified(false); setDeleteUnverifiedTarget(null) }
  }, [deleteUnverifiedTarget, removeLead, showToast])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/leads/${deleteTarget.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_deletion' }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); showToast(b.error ?? 'Failed to delete lead.', 'warning'); return }
      removeLead(Number(deleteTarget.id))
      showToast('Lead deleted.')
    } catch { showToast('Network error. Please try again.', 'warning') }
    finally  { setDeleting(false); setDeleteTarget(null) }
  }, [deleteTarget, removeLead, showToast])

  const filtered = useMemo(() => {
    const byStatus = statusFilter === 'all' ? leads : leads.filter((l) => l.status === statusFilter)
    const searched = searchAndRank(byStatus, search, (l) => [l.name, l.email, l.phone, l.source, l.status])
    return sortItems(searched, sort, (item, key) => {
      if (key === 'name')       return item.name
      if (key === 'source')     return item.source
      if (key === 'status')     return item.status
      if (key === 'propertyId') return item.propertyId
      if (key === 'createdAt')  return item.createdAt
      return ''
    }).sort((a, b) => {
      if (a.status === 'unverified' && b.status !== 'unverified') return -1
      if (a.status !== 'unverified' && b.status === 'unverified') return 1
      return 0
    })
  }, [leads, statusFilter, search, sort])

  if (error && !cache) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      {showModal && (
        <LeadModal mode={modalMode} initial={editTarget} onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess} properties={propertyOptions} agentContactMethod={null} />
      )}
      {deleteTarget && (
        <DeleteLeadModal name={deleteTarget.name} onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)} loading={deleting} />
      )}
      {deleteUnverifiedTarget && (
        <DeleteUnverifiedModal name={deleteUnverifiedTarget.name} onConfirm={handleDeleteUnverifiedConfirm}
          onCancel={() => setDeleteUnverifiedTarget(null)} loading={deletingUnverified} />
      )}
      {verifyTarget && (
        <VerifyLeadModal lead={verifyTarget} onClose={() => setVerifyTarget(null)} onSuccess={handleVerifySuccess} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-sm ${
          toast.type === 'warning' ? 'bg-caution-subtle border border-caution text-caution' : 'bg-foreground text-primary-foreground'
        }`}>
          {toast.type === 'warning'
            ? <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            : <span className="text-emerald-400">✓</span>}
          {toast.message}
        </div>
      )}

      <div className="crm-workspace space-y-5">
        {/* Page header */}
        <div className="crm-page-header">
          <div>
            <h1 className="crm-page-title">Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} of {leads.length} leads</p>
          </div>
          <Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={openAdd}>Refer Lead</Button>
        </div>

        {/* Unverified banner */}
        {unverifiedCount > 0 && statusFilter !== 'unverified' && (
          <div className="crm-attention">
            <ShieldAlert aria-hidden="true" className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm flex-1 min-w-0">
              <span className="font-semibold">{unverifiedCount} unverified lead{unverifiedCount !== 1 ? 's' : ''}</span>
              {' '}require your review before they can be contacted.
            </p>
            <button onClick={() => setStatusFilter('unverified')}
              className="text-sm font-semibold underline underline-offset-4 flex-shrink-0">
              Review now
            </button>
          </div>
        )}

        {/* Filters */}
        <Card>
          <div className="px-4 py-3 flex flex-col gap-3">
            <div className="flex-1 min-w-0">
              <label htmlFor="lead-search" className="crm-field-label">Search leads</label>
              <Input id="lead-search" icon={Search} placeholder="Name, email, phone, source, or status" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter aria-hidden="true" className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {STATUS_FILTERS.map((s) => (
                <button key={s[0]} aria-pressed={statusFilter === s[1]} onClick={() => setStatusFilter(s[1])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                    statusFilter === s[1]
                      ? s[0] === 'unverified' ? 'bg-caution text-primary-foreground' : 'bg-primary text-primary-foreground'
                      : s[0] === 'unverified' ? 'bg-caution-subtle text-caution hover:underline' : 'bg-background text-muted-foreground hover:bg-accent hover:text-primary'
                  }`}>
                  {s[0] === 'all' ? 'All' : s[0].replace('_', ' ')}
                  {s[0] === 'unverified' && unverifiedCount > 0 && (
                    <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
                      statusFilter === 'unverified' ? 'bg-card text-caution' : 'bg-caution text-primary-foreground'
                    }`}>{unverifiedCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="border-t border-border min-w-0">
            <div className="crm-lead-columns crm-lead-heading gap-3 px-4 bg-background border-b border-border">
              <SortableHeader label="Name"     sortKey="name"       sort={sort} onSort={handleSort} />
              <SortableHeader label="Source"   sortKey="source"     sort={sort} onSort={handleSort} />
              <SortableHeader label="Status"   sortKey="status"     sort={sort} onSort={handleSort} />
              <SortableHeader label="Property" sortKey="propertyId" sort={sort} onSort={handleSort} />
              <div />
            </div>

            {loading ? (
              <SkeletonTable rows={7} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Users} title="No leads found" description="Try adjusting your search or filter." />
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((lead) => {
                  const isUnverified = lead.status === 'unverified'
                  const isReady      = lead.status === 'active' || lead.status === 'converted'

                  // Compare as strings on both sides — propertyOptions.id is a
                  // string, lead.propertyId is number | null, so we normalise both.
                  const interestedProperty = lead.propertyId != null
                    ? propertyOptions.find((p) => p.id === String(lead.propertyId))
                    : undefined

                  return (
                    <div key={lead.id}
                      className={`crm-lead-columns gap-3 px-4 py-3 transition-colors items-center ${
                        isUnverified ? 'bg-caution-subtle/50' : 'hover:bg-background'
                      }`}
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div aria-hidden="true" className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${isUnverified ? 'bg-caution-subtle' : 'bg-accent'}`}>
                          {isUnverified
                            ? <ShieldAlert className="w-4 h-4 text-caution" />
                            : <span className="text-xs font-semibold text-primary">{getInitials(lead.name)}</span>}
                        </div>
                        <div className="min-w-0">
                          {isUnverified ? (
                            <p className="text-sm font-semibold"><HighlightedText text={lead.name} query={search} /></p>
                          ) : (
                            <Link to={`/leads/${lead.id}`} className="inline-flex items-center text-sm font-semibold text-primary underline underline-offset-4">
                              <HighlightedText text={lead.name} query={search} />
                            </Link>
                          )}
                          {isReady && <LeadReadyIndicator lead={lead} />}
                          <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(lead.updatedAt)}</p>
                        </div>
                      </div>

                      {/* Source */}
                      <div className="min-w-0">
                        <span className="crm-mobile-label">Source: </span>
                        <span className="text-sm text-muted-foreground"><HighlightedText text={lead.source} query={search} /></span>
                      </div>

                      {/* Status */}
                      <div className="min-w-0">
                        <span className="crm-mobile-label">Status: </span>
                        <LeadStatusBadge status={lead.status} />
                      </div>

                      {/* Property */}
                      <div className="min-w-0 text-sm text-foreground">
                        <span className="crm-mobile-label">Property: </span>
                        {interestedProperty
                          ? <HighlightedText text={interestedProperty.address} query={search} />
                          : 'N/A'}
                      </div>

                      {/* Actions */}
                      <div className="crm-lead-actions flex flex-wrap items-center gap-2">
                        {isUnverified ? (
                          <>
                            <button onClick={() => setVerifyTarget(lead)}
                              aria-label={`Verify ${lead.name}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-caution text-primary-foreground hover:underline whitespace-nowrap">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Verify
                            </button>
                            <button onClick={() => setDeleteUnverifiedTarget(lead)}
                              aria-label={`Delete ${lead.name}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-card text-destructive border border-destructive hover:bg-destructive-subtle whitespace-nowrap">
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </>
                        ) : (
                          <LeadMenu onEdit={() => openEdit(lead)} onDelete={() => setDeleteTarget(lead)} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
