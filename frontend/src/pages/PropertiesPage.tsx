import { useState, useMemo, useCallback } from 'react'
import type { Property } from '../services/api'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SkeletonCard } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import {
  Search, Building2, Bed, Bath, Square, Plus, X,
  DollarSign, Info,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/utils'
import { useDashboardCache } from '../hooks/useDashboardCache'
import { searchAndRank, getHighlightSegments, useDebounce } from '../lib/searchUtils'
import { sortItems, toggleSort, getSortIndicator } from '../lib/tableSortUtils'
import type { SortState } from '../lib/tableSortUtils'
import { BACKEND_URL } from '../consts'
import { ModalFrame, SectionHeader } from '../components/leads/LeadFormShared'
import { LeadMenu } from '../components/leads/LeadMenu'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PropertySortKey = 'address' | 'price' | 'bedrooms' | 'bathrooms' | 'sqft' | 'status' | 'createdAt'
type ViewMode = 'grid' | 'table'

// Optional fields already consumed by this screen; the shared API contract is
// intentionally unchanged until the separate property-contract repair.
interface PropertyDetails extends Property {
  addressLine1?: string | null
  addressLine2?: string | null
  description?: string | null
}

interface PropertyFormData {
  addressLine1: string
  addressLine2: string
  status: 'draft' | 'open' | 'archived' | ''
  price: string
  bedrooms: string
  bathrooms: string
  sqft: string
  description: string
  source: 'zillow' | 'realtor' | 'referral' | 'unknown' | ''
  externalId: string
}

interface FormErrors {
  addressLine1?: string
  description?: string
  status?: string
  price?: string
  bedrooms?: string
  bathrooms?: string
  sqft?: string
  general?: string
}

const EMPTY_FORM: PropertyFormData = {
  addressLine1: '',
  addressLine2: '',
  status:       '',
  price:        '',
  bedrooms:     '',
  bathrooms:    '',
  sqft:         '',
  description:  '',
  source:       '',
  externalId:   '',
}

function propertyToForm(p: PropertyDetails): PropertyFormData {
  return {
    addressLine1: p.addressLine1 ?? p.address ?? '',
    addressLine2: p.addressLine2 ?? '',
    status:       (p.status) as PropertyFormData['status'],
    price:        p.price     != null ? String(p.price)     : '',
    bedrooms:     p.bedrooms  != null ? String(p.bedrooms)  : '',
    bathrooms:    p.bathrooms != null ? String(p.bathrooms) : '',
    sqft:         p.sqft      != null ? String(p.sqft)      : '',
    description:  p.description ?? '',
    source:       (p.source ?? '') as PropertyFormData['source'],
    externalId:   p.externalId ?? '',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PropertyStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'default' }> = {
    open:     { label: 'Open',     variant: 'success' },
    draft:    { label: 'Draft',    variant: 'warning' },
    archived: { label: 'Archived', variant: 'muted'   },
  }
  const { label, variant } = config[status] ?? { label: status, variant: 'muted' }
  return <Badge variant={variant}>{label}</Badge>
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = getHighlightSegments(text, query)
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight
          ? <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5">{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </>
  )
}

function SortableHeader({ label, sortKey, sort, onSort }: {
  label: string; sortKey: PropertySortKey
  sort: SortState<PropertySortKey>; onSort: (key: PropertySortKey) => void
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      aria-label={`${label}: ${sort.key === sortKey ? `${sort.direction}ending; reverse sort` : 'sort ascending'}`}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-primary transition-colors group"
    >
      {label}
      <span aria-hidden="true" className="text-xs text-primary">
        {getSortIndicator(sort, sortKey)}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// 3-dot menu
// ---------------------------------------------------------------------------

function PropertyMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void
  onDelete: () => void
}) {
  return <LeadMenu onEdit={onEdit} onDelete={onDelete} label="Property actions" />
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  title,
  onConfirm,
  onCancel,
  loading,
}: {
  title: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <ModalFrame titleId="delete-property-title" onClose={onCancel} busy={loading}>
      <div className="w-full max-w-sm p-6">
        <h3 id="delete-property-title" className="text-base font-semibold mb-2">Delete Property</h3>
        <p className="text-sm text-muted-foreground mb-1">
          Are you sure you want to delete <span className="font-medium text-foreground">{title}</span>?
        </p>
        <p className="text-xs text-muted-foreground mb-6">
          The property will be marked for deletion and removed within 30 days.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </div>
    </ModalFrame>
  )
}

// ---------------------------------------------------------------------------
// Add / Edit Property Modal
// ---------------------------------------------------------------------------

function PropertyModal({
  mode,
  initial,
  onClose,
  onSuccess,
}: {
  mode: 'add' | 'edit'
  initial?: PropertyDetails
  onClose: () => void
  onSuccess: (property: Property) => void
}) {
  const [form, setForm]             = useState<PropertyFormData>(initial ? propertyToForm(initial) : EMPTY_FORM)
  const [errors, setErrors]         = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  const set = (field: keyof PropertyFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }))
  }

  const validate = (): FormErrors => {
    const errs: FormErrors = {}
    if (!form.addressLine1.trim())  errs.addressLine1 = 'Address Line 1 is required.'
    if (!form.description.trim())   errs.description  = 'Description is required.'
    if (!form.status)               errs.status       = 'Status is required.'
    if (form.price    && (isNaN(Number(form.price))    || Number(form.price)    < 0)) errs.price    = 'Price must be a non-negative number.'
    if (form.bedrooms && (isNaN(Number(form.bedrooms)) || Number(form.bedrooms) < 0 || !Number.isInteger(Number(form.bedrooms)))) errs.bedrooms = 'Bedrooms must be a non-negative whole number.'
    if (form.bathrooms&& (isNaN(Number(form.bathrooms))|| Number(form.bathrooms)< 0)) errs.bathrooms= 'Bathrooms must be a non-negative number.'
    if (form.sqft     && (isNaN(Number(form.sqft))     || Number(form.sqft)     < 0 || !Number.isInteger(Number(form.sqft)))) errs.sqft = 'Square feet must be a non-negative whole number.'
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      const url    = mode === 'add' ? `${BACKEND_URL}api/properties` : `${BACKEND_URL}api/properties/${initial!.id}`
      const method = mode === 'add' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addressLine1: form.addressLine1.trim(),
          addressLine2: form.addressLine2.trim() || null,
          description:  form.description.trim(),
          status:       form.status,
          source:       form.source || 'unknown',
          externalId:   form.externalId.trim() || null,
          price:        form.price     !== '' ? Number(form.price)     : null,
          bedrooms:     form.bedrooms  !== '' ? Number(form.bedrooms)  : null,
          bathrooms:    form.bathrooms !== '' ? Number(form.bathrooms) : null,
          sqft:         form.sqft      !== '' ? Number(form.sqft)      : null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrors({ general: body.error ?? `Server error (${res.status})` })
        return
      }

      const saved: Property = await res.json()
      onSuccess(saved)
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ModalFrame titleId="property-form-title" onClose={onClose} busy={submitting}>
      <div className="w-full max-w-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 id="property-form-title" className="text-base font-semibold text-foreground">
              {mode === 'add' ? 'Add New Property' : 'Edit Property'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Provide as much detail as possible — this information helps the AI discuss the property with leads.
            </p>
          </div>
          <button onClick={onClose} disabled={submitting} aria-label="Close property dialog" className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0 min-w-11 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 px-6 py-5 space-y-6">

          {errors.general && (
            <div role="alert" className="bg-destructive-subtle border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">
              {errors.general}
            </div>
          )}

          {/* Section 1 */}
          <div>
            <SectionHeader number={1} title="Property Information" subtitle="The address and current listing status of the property." />
            <div className="space-y-4">
              <div>
                <label htmlFor="property-address1" className="crm-field-label">Address Line 1 *</label>
                <input id="property-address1" aria-required="true" aria-invalid={!!errors.addressLine1} aria-describedby={errors.addressLine1 ? 'property-address1-error' : undefined} type="text" value={form.addressLine1} onChange={set('addressLine1')} placeholder="e.g. 123 Maple Street"
                  className="crm-field" />
                {errors.addressLine1 && <p id="property-address1-error" className="text-xs text-destructive mt-1">{errors.addressLine1}</p>}
              </div>
              <div>
                <label htmlFor="property-address2" className="crm-field-label">Address Line 2 (optional)</label>
                <input id="property-address2" type="text" value={form.addressLine2} onChange={set('addressLine2')} placeholder="e.g. Unit 4B"
                  className="crm-field" />
              </div>
              <div>
                <label htmlFor="property-status" className="crm-field-label">Status *</label>
                <select id="property-status" aria-required="true" aria-invalid={!!errors.status} aria-describedby={errors.status ? 'property-status-error' : undefined} value={form.status} onChange={set('status')}
                  className="crm-field">
                  <option value="">Select a status...</option>
                  <option value="draft">Draft — Not yet listed, still being prepared</option>
                  <option value="open">Open — Actively listed and available</option>
                  <option value="archived">Archived — No longer active</option>
                </select>
                {errors.status && <p id="property-status-error" className="text-xs text-destructive mt-1">{errors.status}</p>}
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <SectionHeader number={2} title="Property Details" subtitle="Numeric details about the property." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="property-price" className="crm-field-label">Price (optional)</label>
                <div className="relative">
                  <DollarSign aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input id="property-price" aria-invalid={!!errors.price} aria-describedby={errors.price ? 'property-price-error' : undefined} type="number" min="0" step="1000" value={form.price} onChange={set('price')} placeholder="e.g. 450000"
                    className="crm-field pl-8" />
                </div>
                {errors.price && <p id="property-price-error" className="text-xs text-destructive mt-1">{errors.price}</p>}
              </div>
              <div>
                <label htmlFor="property-sqft" className="crm-field-label">Square Feet (optional)</label>
                <div className="relative">
                  <Square aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input id="property-sqft" aria-invalid={!!errors.sqft} aria-describedby={errors.sqft ? 'property-sqft-error' : undefined} type="number" min="0" step="1" value={form.sqft} onChange={set('sqft')} placeholder="e.g. 2100"
                    className="crm-field pl-8" />
                </div>
                {errors.sqft && <p id="property-sqft-error" className="text-xs text-destructive mt-1">{errors.sqft}</p>}
              </div>
              <div>
                <label htmlFor="property-bedrooms" className="crm-field-label">Bedrooms (optional)</label>
                <div className="relative">
                  <Bed aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input id="property-bedrooms" aria-invalid={!!errors.bedrooms} aria-describedby={errors.bedrooms ? 'property-bedrooms-error' : undefined} type="number" min="0" step="1" value={form.bedrooms} onChange={set('bedrooms')} placeholder="e.g. 3"
                    className="crm-field pl-8" />
                </div>
                {errors.bedrooms && <p id="property-bedrooms-error" className="text-xs text-destructive mt-1">{errors.bedrooms}</p>}
              </div>
              <div>
                <label htmlFor="property-bathrooms" className="crm-field-label">Bathrooms (optional)</label>
                <div className="relative">
                  <Bath aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input id="property-bathrooms" aria-invalid={!!errors.bathrooms} aria-describedby={errors.bathrooms ? 'property-bathrooms-error' : undefined} type="number" min="0" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} placeholder="e.g. 2.5"
                    className="crm-field pl-8" />
                </div>
                {errors.bathrooms && <p id="property-bathrooms-error" className="text-xs text-destructive mt-1">{errors.bathrooms}</p>}
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <SectionHeader number={3} title="Property Description" subtitle="This is the most important field. The AI will use this to answer lead questions." />
            <div>
              <label htmlFor="property-description" className="crm-field-label">Description *</label>
              <div className="bg-caution-subtle border border-border rounded-md px-3 py-2.5 mb-2 flex items-start gap-2">
                <Info aria-hidden="true" className="w-3.5 h-3.5 text-caution flex-shrink-0 mt-0.5" />
                <p className="text-sm text-caution">
                  Be as detailed as possible. Include property features, amenities, selling points, neighborhood information, special conditions, pricing details, and anything that may help the AI understand and discuss this property with leads.
                </p>
              </div>
              <textarea id="property-description" aria-required="true" aria-invalid={!!errors.description} aria-describedby={errors.description ? 'property-description-error' : undefined} value={form.description} onChange={set('description')} rows={8}
                placeholder="Example: 3-bedroom, 2.5-bath colonial in the heart of Westfield..."
                className="crm-field resize-y leading-relaxed"
                style={{ minHeight: '200px' }} />
              {errors.description && <p id="property-description-error" className="text-xs text-destructive mt-1">{errors.description}</p>}
            </div>
          </div>

          {/* Section 4 */}
          <div>
            <SectionHeader number={4} title="Property Source" subtitle="Where did this listing originate?" />
            <div className="space-y-4">
              <div>
                <label htmlFor="property-source" className="crm-field-label">Source (optional)</label>
                <select id="property-source" value={form.source} onChange={set('source')}
                  className="crm-field">
                  <option value="">Select a source...</option>
                  <option value="zillow">Zillow</option>
                  <option value="realtor">Realtor.com</option>
                  <option value="referral">Referral</option>
                  <option value="unknown">Unknown / Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="property-external-id" className="crm-field-label">External ID (optional)</label>
                <input id="property-external-id" type="text" value={form.externalId} onChange={set('externalId')} placeholder="e.g. 12345678_zpid"
                  className="crm-field" />
                <p className="text-xs text-muted-foreground mt-1">Optional. Zillow Listing ID, Realtor Listing ID, MLS ID, or another external identifier.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-border bg-background">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<Plus className="w-4 h-4" />}>
            {submitting ? (mode === 'add' ? 'Creating...' : 'Saving...') : (mode === 'add' ? 'Create Property' : 'Save Changes')}
          </Button>
        </div>
      </div>
    </ModalFrame>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PropertiesPage() {
  const { properties: cachedProperties, propertiesLoading, propertiesError, reload, addProperty, updateProperty, removeProperty } = useDashboardCache()
  const properties: PropertyDetails[] = cachedProperties

  const [searchRaw, setSearchRaw]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort]                 = useState<SortState<PropertySortKey>>({ key: 'address', direction: 'asc' })
  const [viewMode, setViewMode]         = useState<ViewMode>('grid')
  const [toast, setToast]               = useState<string | null>(null)

  // Modal state
  const [modalMode, setModalMode]         = useState<'add' | 'edit'>('add')
  const [editTarget, setEditTarget]       = useState<PropertyDetails | undefined>(undefined)
  const [showModal, setShowModal]         = useState(false)
  const [deleteTarget, setDeleteTarget]   = useState<PropertyDetails | null>(null)
  const [deleting, setDeleting]           = useState(false)

  const search = useDebounce(searchRaw, 200)

  const handleSort = useCallback((key: PropertySortKey) => {
    setSort((prev) => toggleSort(prev, key))
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }, [])

  const openAdd = useCallback(() => {
    setModalMode('add')
    setEditTarget(undefined)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((property: PropertyDetails) => {
    setModalMode('edit')
    setEditTarget(property)
    setShowModal(true)
  }, [])

  const handleModalSuccess = useCallback((property: Property) => {
    if (modalMode === 'add') {
      addProperty(property)
      showToast('Property created successfully!')
    } else {
      updateProperty(property)
      showToast('Property updated successfully!')
    }
    setShowModal(false)
  }, [modalMode, addProperty, updateProperty, showToast])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/properties/${deleteTarget.id}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_deletion' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showToast(body.error ?? 'Failed to delete property.')
        return
      }
      removeProperty(deleteTarget.id)
      showToast('Property deleted.')
    } catch {
      showToast('Network error. Please try again.')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, removeProperty, showToast])

  // ── Filter pipeline ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const byStatus = statusFilter === 'all'
      ? properties
      : properties.filter((p) => p.status === statusFilter)

    const searched = searchAndRank(byStatus, search, (p) => [
      p.address,
      p.addressLine1,
      p.addressLine2,
      p.status,
      p.source,
    ])

    return sortItems(searched, sort, (item, key) => {
      switch (key) {
        case 'address':   return item.address ?? item.addressLine1
        case 'price':     return item.price
        case 'bedrooms':  return item.bedrooms
        case 'bathrooms': return item.bathrooms
        case 'sqft':      return item.sqft
        case 'status':    return item.status
        case 'createdAt': return item.createdAt
        default:          return ''
      }
    })
  }, [properties, statusFilter, search, sort])

  if (propertiesError && properties.length === 0) {
    return <ErrorState message={propertiesError} onRetry={reload} />
  }

  return (
    <>
      {showModal && (
        <PropertyModal
          mode={modalMode}
          initial={editTarget}
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title={deleteTarget.addressLine1 ?? deleteTarget.address ?? 'this property'}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-4 left-4 sm:left-auto z-50 bg-foreground text-primary-foreground text-sm font-medium px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          {toast}
        </div>
      )}

      <div className="crm-workspace space-y-5">
        {/* Header */}
        <div className="crm-page-header">
          <div>
            <h1 className="crm-page-title">Properties</h1>
            <p className="text-sm text-muted-foreground mt-1">{filtered.length} of {properties.length} properties</p>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
            Add Property
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <div className="flex-1 min-w-0">
            <label htmlFor="property-search" className="crm-field-label">Search properties</label>
            <Input id="property-search" icon={Search} placeholder="Address, status, or source" value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'open', 'draft', 'archived'].map((s) => (
              <button key={s} aria-pressed={statusFilter === s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:bg-accent'}`}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div role="group" aria-label="Property view" className="flex items-center gap-1 bg-muted border border-border rounded-md p-1">
              <button aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`px-3 py-1 rounded text-xs font-medium ${viewMode === 'grid' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>Grid</button>
              <button aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} className={`px-3 py-1 rounded text-xs font-medium ${viewMode === 'table' ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground'}`}>Table</button>
            </div>
          </div>
        </div>

        {/* Sort bar (grid mode) */}
        {viewMode === 'grid' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Sort by:</span>
            {(['address', 'price', 'bedrooms', 'status'] as PropertySortKey[]).map((key) => (
              <button key={key} aria-pressed={sort.key === key} aria-label={`${key}: ${sort.key === key ? `${sort.direction}ending; reverse sort` : 'sort ascending'}`} onClick={() => handleSort(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${sort.key === key ? 'bg-accent text-primary border-primary' : 'bg-card text-muted-foreground border-border hover:bg-background'}`}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
                <span className="text-[10px]">{getSortIndicator(sort, key)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Grid view */}
        {viewMode === 'grid' && (
          propertiesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <Card><EmptyState icon={Building2} title="No properties found" description="Try adjusting your search or filter, or add a new property." /></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((property) => {
                const address      = property.address ?? property.addressLine1 ?? ''
                const bedroomsVal  = property.bedrooms  ?? 0
                const bathroomsVal = property.bathrooms ?? 0
                const sqftVal      = property.sqft      ?? 0
                const priceVal     = property.price     ?? 0
                return (
                  <Card key={property.id} className="min-w-0">
                    <div className="crm-property-frame">
                      <span aria-hidden="true" className="text-xs uppercase tracking-widest">Property record</span>
                      <p>No property photo</p>
                    </div>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <p className="text-base font-semibold text-foreground leading-snug min-w-0 flex-1">
                          <HighlightedText text={address} query={search} />
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          <PropertyStatusBadge status={property.status} />
                          <PropertyMenu onEdit={() => openEdit(property)} onDelete={() => setDeleteTarget(property)} />
                        </div>
                      </div>
                      {Number(priceVal) > 0 && (
                        <p className="crm-numeric text-xl font-semibold text-primary mb-3">{formatCurrency(Number(priceVal))}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        {Number(bedroomsVal)  > 0 && <span className="flex items-center gap-1"><Bed aria-hidden="true" className="w-3.5 h-3.5" />{bedroomsVal} bd</span>}
                        {Number(bathroomsVal) > 0 && <span className="flex items-center gap-1"><Bath aria-hidden="true" className="w-3.5 h-3.5" />{bathroomsVal} ba</span>}
                        {Number(sqftVal)      > 0 && <span className="flex items-center gap-1"><Square aria-hidden="true" className="w-3.5 h-3.5" />{Number(sqftVal).toLocaleString()} sqft</span>}
                      </div>
                      <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2 items-center justify-between">
                        <span className="text-xs text-muted-foreground">{property.source}</span>
                        <span className="crm-numeric text-xs text-muted-foreground">{formatDate(property.createdAt)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        )}

        {/* Table view */}
        {viewMode === 'table' && (
          <Card className="min-w-0">
            <div role="region" aria-label="Property comparison table" tabIndex={0} className="crm-property-table overflow-x-auto">
              <div className="crm-property-columns gap-4 px-5 bg-background border-b border-border">
                <SortableHeader label="Address"  sortKey="address"   sort={sort} onSort={handleSort} />
                <SortableHeader label="Price"    sortKey="price"     sort={sort} onSort={handleSort} />
                <SortableHeader label="Beds"     sortKey="bedrooms"  sort={sort} onSort={handleSort} />
                <SortableHeader label="Baths"    sortKey="bathrooms" sort={sort} onSort={handleSort} />
                <SortableHeader label="Status"   sortKey="status"    sort={sort} onSort={handleSort} />
                <SortableHeader label="Listed"   sortKey="createdAt" sort={sort} onSort={handleSort} />
                <div />
              </div>

              {propertiesLoading ? (
                <div className="p-5 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} aria-hidden="true" className="h-10 bg-background rounded animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState icon={Building2} title="No properties found" description="Try adjusting your search or filter." />
              ) : (
                <div className="divide-y divide-border">
                  {filtered.map((property) => {
                    const address = property.address ?? property.addressLine1 ?? ''
                    return (
                      <div key={property.id} className="crm-property-columns gap-4 px-5 py-3 hover:bg-background transition-colors items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            <HighlightedText text={address} query={search} />
                          </p>
                          <p className="text-xs text-muted-foreground">{property.source}</p>
                        </div>
                        <span className="text-sm text-foreground font-medium">{property.price ? formatCurrency(Number(property.price)) : '—'}</span>
                        <span className="text-sm text-muted-foreground">{property.bedrooms  != null ? `${property.bedrooms} bd`  : '—'}</span>
                        <span className="text-sm text-muted-foreground">{property.bathrooms != null ? `${property.bathrooms} ba` : '—'}</span>
                        <PropertyStatusBadge status={property.status} />
                        <span className="text-xs text-muted-foreground">{formatDate(property.createdAt)}</span>
                        <PropertyMenu onEdit={() => openEdit(property)} onDelete={() => setDeleteTarget(property)} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
