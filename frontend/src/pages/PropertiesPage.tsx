import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
  DollarSign, Info, MoreVertical, Pencil, Trash2,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../lib/utils'
import { useDashboardCache } from '../hooks/useDashboardCache'
import { searchAndRank, getHighlightSegments, useDebounce } from '../lib/searchUtils'
import { sortItems, toggleSort, getSortIndicator } from '../lib/tableSortUtils'
import type { SortState } from '../lib/tableSortUtils'
import { BACKEND_URL } from '../consts'

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
      className="flex items-center gap-1 text-xs font-semibold text-[#94a3b8] uppercase tracking-wide hover:text-[#4f46e5] transition-colors group"
    >
      {label}
      <span className={`text-xs ${sort.key === sortKey ? 'text-[#4f46e5]' : 'text-[#cbd5e1] group-hover:text-[#4f46e5]'}`}>
        {getSortIndicator(sort, sortKey)}
      </span>
    </button>
  )
}

function SectionHeader({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-[#4f46e5] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#0f172a]">{title}</h4>
        {subtitle && <p className="text-xs text-[#94a3b8] mt-0.5">{subtitle}</p>}
      </div>
    </div>
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#475569] transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-white border border-[#e5e7eb] rounded-lg shadow-lg z-30 py-1 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#475569] hover:bg-[#f9fafb] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  )
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-[#0f172a] mb-2">Delete Property</h3>
        <p className="text-sm text-[#475569] mb-1">
          Are you sure you want to delete <span className="font-medium text-[#0f172a]">{title}</span>?
        </p>
        <p className="text-xs text-[#94a3b8] mb-6">
          The property will be marked for deletion and removed within 30 days.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Delete</Button>
        </div>
      </div>
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">
              {mode === 'add' ? 'Add New Property' : 'Edit Property'}
            </h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              Provide as much detail as possible — this information helps the AI discuss the property with leads.
            </p>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">

          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {errors.general}
            </div>
          )}

          {/* Section 1 */}
          <div>
            <SectionHeader number={1} title="Property Information" subtitle="The address and current listing status of the property." />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Address Line 1 <span className="text-red-500">*</span></label>
                <input type="text" value={form.addressLine1} onChange={set('addressLine1')} placeholder="e.g. 123 Maple Street"
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.addressLine1 ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                {errors.addressLine1 && <p className="text-xs text-red-600 mt-1">{errors.addressLine1}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Address Line 2 <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <input type="text" value={form.addressLine2} onChange={set('addressLine2')} placeholder="e.g. Unit 4B"
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Status <span className="text-red-500">*</span></label>
                <select value={form.status} onChange={set('status')}
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors bg-white ${errors.status ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}>
                  <option value="">Select a status...</option>
                  <option value="draft">Draft — Not yet listed, still being prepared</option>
                  <option value="open">Open — Actively listed and available</option>
                  <option value="archived">Archived — No longer active</option>
                </select>
                {errors.status && <p className="text-xs text-red-600 mt-1">{errors.status}</p>}
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <SectionHeader number={2} title="Property Details" subtitle="Numeric details about the property." />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Price <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
                  <input type="number" min="0" step="1000" value={form.price} onChange={set('price')} placeholder="e.g. 450000"
                    className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.price ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                </div>
                {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Square Feet <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <div className="relative">
                  <Square className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
                  <input type="number" min="0" step="1" value={form.sqft} onChange={set('sqft')} placeholder="e.g. 2100"
                    className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.sqft ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                </div>
                {errors.sqft && <p className="text-xs text-red-600 mt-1">{errors.sqft}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Bedrooms <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <div className="relative">
                  <Bed className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
                  <input type="number" min="0" step="1" value={form.bedrooms} onChange={set('bedrooms')} placeholder="e.g. 3"
                    className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.bedrooms ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                </div>
                {errors.bedrooms && <p className="text-xs text-red-600 mt-1">{errors.bedrooms}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Bathrooms <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <div className="relative">
                  <Bath className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
                  <input type="number" min="0" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} placeholder="e.g. 2.5"
                    className={`w-full pl-8 pr-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.bathrooms ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                </div>
                {errors.bathrooms && <p className="text-xs text-red-600 mt-1">{errors.bathrooms}</p>}
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div>
            <SectionHeader number={3} title="Property Description" subtitle="This is the most important field. The AI will use this to answer lead questions." />
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Description <span className="text-red-500">*</span></label>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Be as detailed as possible. Include property features, amenities, selling points, neighborhood information, special conditions, pricing details, and anything that may help the AI understand and discuss this property with leads.
                </p>
              </div>
              <textarea value={form.description} onChange={set('description')} rows={8}
                placeholder="Example: 3-bedroom, 2.5-bath colonial in the heart of Westfield..."
                className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.description ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                style={{ minHeight: '200px' }} />
              {errors.description && <p className="text-xs text-red-600 mt-1">{errors.description}</p>}
            </div>
          </div>

          {/* Section 4 */}
          <div>
            <SectionHeader number={4} title="Property Source" subtitle="Where did this listing originate?" />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Source <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <select value={form.source} onChange={set('source')}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors bg-white">
                  <option value="">Select a source...</option>
                  <option value="zillow">Zillow</option>
                  <option value="realtor">Realtor.com</option>
                  <option value="referral">Referral</option>
                  <option value="unknown">Unknown / Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">External ID <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <input type="text" value={form.externalId} onChange={set('externalId')} placeholder="e.g. 12345678_zpid"
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors" />
                <p className="text-xs text-[#94a3b8] mt-1">Optional. Zillow Listing ID, Realtor Listing ID, MLS ID, or another external identifier.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-2xl">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<Plus className="w-4 h-4" />}>
            {submitting ? (mode === 'add' ? 'Creating...' : 'Saving...') : (mode === 'add' ? 'Create Property' : 'Save Changes')}
          </Button>
        </div>
      </div>
    </div>
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
        <div className="fixed bottom-6 right-6 z-50 bg-[#0f172a] text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span className="text-emerald-400">✓</span>
          {toast}
        </div>
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">Properties</h2>
            <p className="text-sm text-[#94a3b8] mt-0.5">{filtered.length} of {properties.length} properties</p>
          </div>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openAdd}>
            Add Property
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input icon={Search} placeholder="Search by address, status, or source..." value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'open', 'draft', 'archived'].map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[#4f46e5] text-white' : 'bg-white border border-[#e5e7eb] text-[#475569] hover:bg-[#f9fafb]'}`}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-1">
              <button onClick={() => setViewMode('grid')} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'grid' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#94a3b8]'}`}>Grid</button>
              <button onClick={() => setViewMode('table')} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === 'table' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#94a3b8]'}`}>Table</button>
            </div>
          </div>
        </div>

        {/* Sort bar (grid mode) */}
        {viewMode === 'grid' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#94a3b8] font-medium">Sort by:</span>
            {(['address', 'price', 'bedrooms', 'status'] as PropertySortKey[]).map((key) => (
              <button key={key} onClick={() => handleSort(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${sort.key === key ? 'bg-[#eef2ff] text-[#4f46e5] border-[#c7d2fe]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
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
                  <Card key={property.id} className="overflow-hidden">
                    <div className="h-40 bg-[#f1f5f9] flex items-center justify-center border-b border-[#e5e7eb]">
                      <img
                        src={`https://placehold.co/400x160/eef2ff/4f46e5?text=${encodeURIComponent(bedroomsVal + 'BR+Property')}&font=lato`}
                        alt="Property" className="w-full h-full object-cover"
                      />
                    </div>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-[#0f172a] leading-snug line-clamp-2 flex-1">
                          <HighlightedText text={address} query={search} />
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <PropertyStatusBadge status={property.status} />
                          <PropertyMenu onEdit={() => openEdit(property)} onDelete={() => setDeleteTarget(property)} />
                        </div>
                      </div>
                      {Number(priceVal) > 0 && (
                        <p className="text-lg font-semibold text-[#4f46e5] mb-3">{formatCurrency(Number(priceVal))}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-[#475569]">
                        {Number(bedroomsVal)  > 0 && <span className="flex items-center gap-1"><Bed  className="w-3.5 h-3.5 text-[#94a3b8]" />{bedroomsVal} bd</span>}
                        {Number(bathroomsVal) > 0 && <span className="flex items-center gap-1"><Bath className="w-3.5 h-3.5 text-[#94a3b8]" />{bathroomsVal} ba</span>}
                        {Number(sqftVal)      > 0 && <span className="flex items-center gap-1"><Square className="w-3.5 h-3.5 text-[#94a3b8]" />{Number(sqftVal).toLocaleString()} sqft</span>}
                      </div>
                      <div className="mt-3 pt-3 border-t border-[#f1f5f9] flex items-center justify-between">
                        <span className="text-xs text-[#94a3b8]">{property.source}</span>
                        <span className="text-xs text-[#94a3b8]">{formatDate(property.createdAt)}</span>
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
          <Card>
            <div className="border-t border-[#e5e7eb]">
              <div className="hidden sm:grid grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_44px] gap-4 px-5 py-2.5 bg-[#f9fafb] border-b border-[#e5e7eb]">
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
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-[#f9fafb] rounded animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState icon={Building2} title="No properties found" description="Try adjusting your search or filter." />
              ) : (
                <div className="divide-y divide-[#e5e7eb]">
                  {filtered.map((property) => {
                    const address = property.address ?? property.addressLine1 ?? ''
                    return (
                      <div key={property.id} className="grid grid-cols-1 sm:grid-cols-[3fr_1fr_1fr_1fr_1fr_1fr_44px] gap-4 px-5 py-3.5 hover:bg-[#f9fafb] transition-colors items-center">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#0f172a] truncate">
                            <HighlightedText text={address} query={search} />
                          </p>
                          <p className="text-xs text-[#94a3b8]">{property.source}</p>
                        </div>
                        <span className="text-sm text-[#0f172a] font-medium">{property.price ? formatCurrency(Number(property.price)) : '—'}</span>
                        <span className="text-sm text-[#475569]">{property.bedrooms  != null ? `${property.bedrooms} bd`  : '—'}</span>
                        <span className="text-sm text-[#475569]">{property.bathrooms != null ? `${property.bathrooms} ba` : '—'}</span>
                        <PropertyStatusBadge status={property.status} />
                        <span className="text-xs text-[#94a3b8]">{formatDate(property.createdAt)}</span>
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
