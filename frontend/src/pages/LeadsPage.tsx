import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Lead } from '../services/api'
import { Card } from '../components/ui/Card'
import { LeadStatusBadge } from '../components/ui/Badge'
import { SkeletonTable } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import {
  Search, Users, Filter, UserPlus,
  X, Info, MoreVertical, Pencil, Trash2,
  Sparkles, MessageSquare, BellOff,
  AlertTriangle,
} from 'lucide-react'
import { formatRelativeTime, getInitials } from '../lib/utils'
import { useDashboardCache } from '../context/DashboardCacheContext'
import { searchAndRank, getHighlightSegments, useDebounce } from '../lib/searchUtils'
import { sortItems, toggleSort, getSortIndicator } from '../lib/tableSortUtils'
import type { SortState } from '../lib/tableSortUtils'
import { BACKEND_URL } from '../consts'
import type { RawDashboardData } from '../lib/dashboardTransformer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadSortKey = 'name' | 'source' | 'status' | 'score' | 'createdAt'
type RawLead = RawDashboardData['leads'][number]
type MessageMode = 'ai' | 'custom' | 'none'

// Channel resolved from the agent's onboarding preference + lead contact info.
// We derive this client-side for UI purposes only; the backend re-derives it authoritatively.
type ResolvedChannel = 'sms' | 'email' | 'phone' | null

const STATUS_FILTERS = ['all', 'new', 'active', 'cold', 'converted', 'opted_out']

interface ReferLeadFormData {
  name: string
  email: string
  phone: string
  source: 'zillow' | 'realtor' | 'referral' | 'unknown' | ''
  sourceId: string
  propertyId: string
  notes: string
  messageMode: MessageMode
  customMessage: string
  customSubject: string
}

interface ReferLeadErrors {
  name?: string
  email?: string
  contact?: string
  customMessage?: string
  customSubject?: string
  general?: string
}

const EMPTY_REFER_FORM: ReferLeadFormData = {
  name:          '',
  email:         '',
  phone:         '',
  source:        'referral',
  sourceId:      '',
  propertyId:    '',
  notes:         '',
  messageMode:   'ai',
  customMessage: '',
  customSubject: '',
}

function leadToForm(lead: Lead): ReferLeadFormData {
  return {
    name:          lead.name    ?? '',
    email:         lead.email   ?? '',
    phone:         lead.phone   ?? '',
    source:        (lead.source ?? 'referral') as ReferLeadFormData['source'],
    sourceId:      '',
    propertyId:    '',
    notes:         '',
    messageMode:   'ai',
    customMessage: '',
    customSubject: '',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScorePill({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-700 bg-emerald-50' : score >= 50 ? 'text-amber-700 bg-amber-50' : 'text-[#94a3b8] bg-[#f9fafb]'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${color}`}>{score}</span>
}

function SortableHeader({ label, sortKey, sort, onSort }: {
  label: string; sortKey: LeadSortKey
  sort: SortState<LeadSortKey>; onSort: (key: LeadSortKey) => void
}) {
  return (
    <button onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold text-[#94a3b8] uppercase tracking-wide hover:text-[#4f46e5] transition-colors group">
      {label}
      <span className={`text-xs ${sort.key === sortKey ? 'text-[#4f46e5]' : 'text-[#cbd5e1] group-hover:text-[#4f46e5]'}`}>
        {getSortIndicator(sort, sortKey)}
      </span>
    </button>
  )
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

function SectionHeader({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-[#4f46e5] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{number}</div>
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

function LeadMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
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
          <button onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#475569] hover:bg-[#f9fafb] transition-colors">
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
          <button onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal
// ---------------------------------------------------------------------------

function DeleteLeadModal({ name, onConfirm, onCancel, loading }: {
  name: string; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-semibold text-[#0f172a] mb-2">Delete Lead</h3>
        <p className="text-sm text-[#475569] mb-1">
          Are you sure you want to delete <span className="font-medium text-[#0f172a]">{name}</span>?
        </p>
        <p className="text-xs text-[#94a3b8] mb-6">
          The lead will be marked for deletion and removed within 30 days.
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
// Refer / Edit Lead Modal
// ---------------------------------------------------------------------------

function LeadModal({
  mode,
  initial,
  onClose,
  onSuccess,
  properties,
  agentContactMethod,
}: {
  mode: 'add' | 'edit'
  initial?: Lead
  onClose: () => void
  onSuccess: (lead: Lead, warning?: string) => void
  properties: { id: string; address: string; addressLine1?: string }[]
  agentContactMethod: string | null
}) {
  const [form, setForm]             = useState<ReferLeadFormData>(initial ? leadToForm(initial) : EMPTY_REFER_FORM)
  const [errors, setErrors]         = useState<ReferLeadErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // ── Derive the likely channel for UI hints ────────────────────────────────
  // This is a client-side approximation — the backend re-derives authoritatively.
  const resolvedChannel: ResolvedChannel = useMemo((): ResolvedChannel => {
    const hasPhone = form.phone.trim() !== ''
    const hasEmail = form.email.trim() !== ''
    switch (agentContactMethod) {
      case 'sms':   return hasPhone ? 'sms' : null
      case 'email': return hasEmail ? 'email' : null
      case 'phone': return 'phone'
      case 'mix':
      default:
        if (hasPhone) return 'sms'
        if (hasEmail) return 'email'
        return null
    }
  }, [form.phone, form.email, agentContactMethod])

  const hasContact = form.email.trim() !== '' || form.phone.trim() !== ''
  const showOutreachSection = mode === 'add' && hasContact

  const set = (field: keyof ReferLeadFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined, contact: undefined, general: undefined }))
  }

  const setMessageMode = (m: MessageMode) => {
    setForm((prev) => ({ ...prev, messageMode: m }))
    setErrors((prev) => ({ ...prev, customMessage: undefined, customSubject: undefined }))
  }

  const validate = (): ReferLeadErrors => {
    const errs: ReferLeadErrors = {}
    if (!form.name.trim()) errs.name = 'Full name is required.'
    if (!form.email.trim() && !form.phone.trim()) errs.contact = 'At least one contact method (email or phone) is required.'
    if (form.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email address.'
    }
    if (mode === 'add' && form.messageMode === 'custom') {
      if (!form.customMessage.trim()) errs.customMessage = 'Please enter a message, or choose a different option.'
      if (resolvedChannel === 'email' && !form.customSubject.trim()) {
        errs.customSubject = 'Subject is required for email messages.'
      }
    }
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      // ── Step 1: Create or update the lead ────────────────────────────────
      const url    = mode === 'add' ? `${BACKEND_URL}api/leads` : `${BACKEND_URL}api/leads/${initial!.id}`
      const method = mode === 'add' ? 'POST' : 'PATCH'

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim()    || null,
          phone:      form.phone.trim()    || null,
          source:     form.source          || 'referral',
          sourceId:   form.sourceId.trim() || null,
          propertyId: form.propertyId      || null,
          ...(mode === 'add' && { notes: form.notes.trim() || undefined }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrors({ general: body.error ?? `Server error (${res.status})` })
        return
      }

      const created = await res.json()

      // ── Step 2: Send initial message (add mode only) ──────────────────────
      let warning: string | undefined

      if (mode === 'add') {
        const sendRes = await fetch(`${BACKEND_URL}api/leads/${created.id}/send-initial`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode:          form.messageMode,
            customMessage: form.messageMode === 'custom' ? form.customMessage.trim() : null,
            customSubject: form.messageMode === 'custom' && resolvedChannel === 'email'
              ? form.customSubject.trim()
              : null,
          }),
        })

        if (sendRes.ok) {
          const sendData = await sendRes.json().catch(() => ({}))
          if (sendData.warning) warning = sendData.warning
        } else {
          // Non-fatal — lead was created, message sending failed
          console.warn('Initial message send failed:', await sendRes.text().catch(() => ''))
          warning = 'Lead was saved but the initial message could not be sent. You can message them manually.'
        }
      }

      const lead: Lead = {
        id:        String(created.id),
        name:      created.name   ?? 'Unknown',
        email:     created.email  ?? '',
        phone:     created.phone  ?? '',
        status:    created.status as Lead['status'],
        source:    created.source ?? 'referral',
        score:     0,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt ?? created.createdAt,
      }
      onSuccess(lead, warning)
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">
              {mode === 'add' ? 'Refer a Lead' : 'Edit Lead'}
            </h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              {mode === 'add'
                ? 'Add a referred lead to your CRM. The more detail you provide, the better the AI can engage them.'
                : "Update the lead's contact information and context."}
            </p>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{errors.general}</div>
          )}

          {/* ── Section 1: Contact Information ── */}
          <div>
            <SectionHeader number={1} title="Contact Information" subtitle="Who is this lead? Provide as much contact detail as possible." />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={set('name')} placeholder="e.g. Jane Smith"
                  className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.name ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
              </div>
              {errors.contact && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{errors.contact}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">Email Address</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com"
                    className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.email ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                  {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">Phone Number</label>
                  <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000"
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: Lead Context ── */}
          <div>
            <SectionHeader number={2} title="Lead Context" subtitle="Where did this lead come from, and are they interested in a specific property?" />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Lead Source</label>
                <select value={form.source} onChange={set('source')}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors bg-white">
                  <option value="referral">Referral — Personally referred by someone</option>
                  <option value="zillow">Zillow</option>
                  <option value="realtor">Realtor.com</option>
                  <option value="unknown">Unknown / Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Source ID <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                <input type="text" value={form.sourceId} onChange={set('sourceId')} placeholder="e.g. Zillow inquiry ID, MLS ID"
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors" />
              </div>
              {properties.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-[#475569] mb-1.5">Interested Property <span className="text-[#94a3b8] font-normal">(optional)</span></label>
                  <select value={form.propertyId} onChange={set('propertyId')}
                    className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors bg-white">
                    <option value="">No specific property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.address ?? p.addressLine1 ?? `Property #${p.id}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Section 3: Notes ── */}
          {mode === 'add' && (
            <div>
              <SectionHeader number={3} title="Initial Notes" subtitle="Any context that will help the AI engage this lead effectively." />
              <div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-2 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Be as detailed as possible. Include what the lead is looking for, their timeline, budget range, preferred neighborhoods, family situation, motivation for buying or selling, and any personal context that may help build rapport.
                  </p>
                </div>
                <textarea value={form.notes} onChange={set('notes')} rows={5}
                  placeholder={`Example:\nJane was referred by Mike Johnson. She's looking to buy a 3-bedroom home in the Westfield area within the next 3 months. Budget is around $450k...`}
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors resize-y leading-relaxed"
                  style={{ minHeight: '120px' }} />
              </div>
            </div>
          )}

          {/* ── Section 4: Initial Outreach (add mode + has contact only) ── */}
          {showOutreachSection && (
            <div>
              <SectionHeader
                number={4}
                title="Initial Outreach"
                subtitle={
                  resolvedChannel === 'sms'   ? 'Message will be sent via SMS based on your contact preference.' :
                  resolvedChannel === 'email' ? 'Message will be sent via email based on your contact preference.' :
                  resolvedChannel === 'phone' ? 'Your contact preference is set to phone calls.' :
                  'Choose how to reach out to this lead.'
                }
              />

              {/* Phone preference notice */}
              {resolvedChannel === 'phone' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2 mb-4">
                  <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-800">
                    Your contact preference is set to <strong>phone calls</strong>. A follow-up task will be created reminding you to call this lead directly. No automated message will be sent.
                  </p>
                </div>
              )}

              {/* Mode toggle — hidden for phone preference */}
              {resolvedChannel !== 'phone' && (
                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => setMessageMode('ai')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'ai' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                    <Sparkles className="w-4 h-4" />
                    Let AI decide
                  </button>
                  <button type="button" onClick={() => setMessageMode('custom')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'custom' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                    <MessageSquare className="w-4 h-4" />
                    Write my own
                  </button>
                  <button type="button" onClick={() => setMessageMode('none')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'none' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                    <BellOff className="w-4 h-4" />
                    Don't send
                  </button>
                </div>
              )}

              {/* AI mode */}
              {form.messageMode === 'ai' && resolvedChannel !== 'phone' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">
                    The AI will craft a personalized opening {resolvedChannel === 'email' ? 'email' : 'SMS'} based on the lead's name, source, notes, and any property they're interested in. It will be sent immediately and the AI will continue managing this lead's responses automatically.
                  </p>
                </div>
              )}

              {/* None mode */}
              {form.messageMode === 'none' && resolvedChannel !== 'phone' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <BellOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700">
                    No message will be sent. The lead will be created and the AI will remain active for future responses. You can message this lead manually at any time.
                  </p>
                </div>
              )}

              {/* Custom message */}
              {form.messageMode === 'custom' && resolvedChannel !== 'phone' && (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Write a personalized opening message. This will be sent exactly as written via{' '}
                      <strong>{resolvedChannel === 'email' ? 'email' : 'SMS'}</strong> immediately after the lead is added.
                      The AI will continue managing future responses automatically.
                    </p>
                  </div>

                  {/* Subject — only for email channel */}
                  {resolvedChannel === 'email' && (
                    <div>
                      <label className="block text-xs font-medium text-[#475569] mb-1.5">
                        Subject <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={form.customSubject}
                        onChange={set('customSubject')}
                        placeholder="e.g. Following up on your home search"
                        className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.customSubject ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                      />
                      {errors.customSubject && <p className="text-xs text-red-600 mt-1">{errors.customSubject}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#475569] mb-1.5">
                      Message <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.customMessage}
                      onChange={set('customMessage')}
                      rows={5}
                      placeholder={
                        resolvedChannel === 'email'
                          ? `Example:\nHi Jane,\n\nMike Johnson mentioned you're looking for a home in the Westfield area. I'd love to connect and learn more about what you're looking for!\n\nBest,\nSarah`
                          : `Example:\nHi Jane! This is Sarah from Westfield Realty. Mike Johnson mentioned you're looking for a home in the area — I'd love to help! Do you have a few minutes to chat this week?`
                      }
                      className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.customMessage ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                      style={{ minHeight: '140px' }}
                    />
                    {errors.customMessage && <p className="text-xs text-red-600 mt-1">{errors.customMessage}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-2xl">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<UserPlus className="w-4 h-4" />}>
            {submitting
              ? (mode === 'add' ? 'Adding Lead...' : 'Saving...')
              : (mode === 'add' ? 'Add Lead' : 'Save Changes')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LeadsPage() {
  const { cache, loading, error, reload, addLead, updateLead, removeLead, properties } = useDashboardCache()
  const navigate = useNavigate()

  const [searchRaw, setSearchRaw]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sort, setSort]                 = useState<SortState<LeadSortKey>>({ key: 'name', direction: 'asc' })
  const [toast, setToast]               = useState<{ message: string; type: 'success' | 'warning' } | null>(null)

  // Modal state
  const [modalMode, setModalMode]       = useState<'add' | 'edit'>('add')
  const [editTarget, setEditTarget]     = useState<Lead | undefined>(undefined)
  const [showModal, setShowModal]       = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleting, setDeleting]         = useState(false)

  // Agent contact method — loaded from cache if available
  const agentContactMethod = useMemo(() => {
    // The onboarding contactMethod is not in the dashboard cache directly.
    // We pass null here and let the backend resolve it authoritatively.
    // For UI hints only, we default to 'mix'.
    return null
  }, [])

  const search = useDebounce(searchRaw, 200)

  const showToast = useCallback((message: string, type: 'success' | 'warning' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── Map raw cache leads → Lead shape ─────────────────────────────────────
  const leads: Lead[] = useMemo(() => {
    if (!cache?.leads) return []
    return cache.leads.map((l) => ({
      id:        String(l.id),
      name:      l.name   ?? 'Unknown',
      email:     '',
      phone:     '',
      status:    l.status as Lead['status'],
      source:    l.source ?? 'Unknown',
      score:     0,
      createdAt: l.createdAt,
      updatedAt: l.createdAt,
    }))
  }, [cache])

  const propertyOptions = useMemo(() => properties.map((p) => ({
    id:           String(p.id),
    address:      (p as any).address      ?? '',
    addressLine1: (p as any).addressLine1 ?? '',
  })), [properties])

  const handleSort = useCallback((key: LeadSortKey) => {
    setSort((prev) => toggleSort(prev, key))
  }, [])

  const openAdd = useCallback(() => {
    setModalMode('add')
    setEditTarget(undefined)
    setShowModal(true)
  }, [])

  const openEdit = useCallback((lead: Lead) => {
    setModalMode('edit')
    setEditTarget(lead)
    setShowModal(true)
  }, [])

  const handleModalSuccess = useCallback((lead: Lead, warning?: string) => {
    const raw: RawLead = {
      id:        Number(lead.id),
      status:    lead.status,
      createdAt: lead.createdAt,
      name:      lead.name,
      source:    lead.source,
    }
    if (modalMode === 'add') {
      addLead(raw)
      if (warning) {
        showToast(warning, 'warning')
      } else {
        showToast('Lead added successfully!')
      }
    } else {
      updateLead(raw)
      showToast('Lead updated successfully!')
    }
    setShowModal(false)
  }, [modalMode, addLead, updateLead, showToast])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/leads/${deleteTarget.id}`, {
        method:      'PATCH',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_deletion' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showToast(body.error ?? 'Failed to delete lead.', 'warning')
        return
      }
      removeLead(Number(deleteTarget.id))
      showToast('Lead deleted.')
    } catch {
      showToast('Network error. Please try again.', 'warning')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, removeLead, showToast])

  // ── Filter pipeline ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const byStatus = statusFilter === 'all' ? leads : leads.filter((l) => l.status === statusFilter)
    const searched = searchAndRank(byStatus, search, (l) => [l.name, l.email, l.phone, l.source, l.status])
    return sortItems(searched, sort, (item, key) => {
      switch (key) {
        case 'name':      return item.name
        case 'source':    return item.source
        case 'status':    return item.status
        case 'score':     return item.score
        case 'createdAt': return item.createdAt
        default:          return ''
      }
    })
  }, [leads, statusFilter, search, sort])

  if (error && !cache) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      {showModal && (
        <LeadModal
          mode={modalMode}
          initial={editTarget}
          onClose={() => setShowModal(false)}
          onSuccess={handleModalSuccess}
          properties={propertyOptions}
          agentContactMethod={agentContactMethod}
        />
      )}

      {deleteTarget && (
        <DeleteLeadModal
          name={deleteTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}

      {/* Toast — supports success and warning variants */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 max-w-sm ${
          toast.type === 'warning'
            ? 'bg-amber-50 border border-amber-200 text-amber-800'
            : 'bg-[#0f172a] text-white'
        }`}>
          {toast.type === 'warning'
            ? <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            : <span className="text-emerald-400">✓</span>
          }
          {toast.message}
        </div>
      )}

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#0f172a]">Leads</h2>
            <p className="text-sm text-[#94a3b8] mt-0.5">{filtered.length} of {leads.length} leads</p>
          </div>
          <Button variant="primary" icon={<UserPlus className="w-4 h-4" />} onClick={openAdd}>
            Refer Lead
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <div className="px-5 py-3 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input icon={Search} placeholder="Search by name, email, phone, source, or status..." value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
              {STATUS_FILTERS.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${statusFilter === s ? 'bg-[#4f46e5] text-white' : 'bg-[#f9fafb] text-[#475569] hover:bg-[#eef2ff] hover:text-[#4f46e5]'}`}>
                  {s === 'all' ? 'All' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="border-t border-[#e5e7eb]">
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_44px] gap-4 px-5 py-2.5 bg-[#f9fafb] border-b border-[#e5e7eb]">
              <SortableHeader label="Name"   sortKey="name"   sort={sort} onSort={handleSort} />
              <SortableHeader label="Source" sortKey="source" sort={sort} onSort={handleSort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <SortableHeader label="Score"  sortKey="score"  sort={sort} onSort={handleSort} />
              <div />
            </div>

            {loading ? (
              <SkeletonTable rows={7} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Users} title="No leads found" description="Try adjusting your search or filter." />
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {filtered.map((lead) => (
                  <div
                    key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_44px] gap-4 px-5 py-3.5 hover:bg-[#f9fafb] cursor-pointer transition-colors items-center"
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#eef2ff] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-semibold text-[#4f46e5]">{getInitials(lead.name)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0f172a] truncate">
                          <HighlightedText text={lead.name} query={search} />
                        </p>
                        <p className="text-xs text-[#94a3b8] mt-0.5">{formatRelativeTime(lead.updatedAt)}</p>
                      </div>
                    </div>

                    {/* Source */}
                    <div className="hidden sm:block">
                      <span className="text-sm text-[#475569]"><HighlightedText text={lead.source} query={search} /></span>
                    </div>

                    {/* Status */}
                    <div className="hidden sm:block">
                      <LeadStatusBadge status={lead.status} />
                    </div>

                    {/* Score */}
                    <div className="hidden sm:block">
                      <ScorePill score={lead.score} />
                    </div>

                    {/* 3-dot menu */}
                    <div className="hidden sm:flex justify-end">
                      <LeadMenu onEdit={() => openEdit(lead)} onDelete={() => setDeleteTarget(lead)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
