import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Lead as ApiLead } from '../services/api' // Renamed to ApiLead to avoid conflict with local Lead interface
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
  AlertTriangle, CheckCircle2, ShieldAlert, CircleDot, // Added CircleDot
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
// Redefined Lead interface locally to include propertyId if not already in ApiLead
interface Lead extends ApiLead {
  propertyId?: number | null
}


type LeadSortKey = 'name' | 'source' | 'status' | 'propertyId' | 'createdAt'
type RawLead = RawDashboardData['leads'][number]
type MessageMode = 'ai' | 'manual' | 'none'

// New component for LeadReadyIndicator - Moved below Lead interface definition
function LeadReadyIndicator({ lead }: { lead: Lead }) {
  const isReady = lead.status === 'active' || lead.status === 'converted'
  const color = isReady ? 'text-green-500' : 'text-red-500' // Green for "ready", red for "not ready"
  const tooltip = isReady ? 'Lead is ready' : 'Lead is not ready'
  return (
    <div className={`flex items-center gap-1 ${color}`} title={tooltip}>
      <CircleDot className="w-3 h-3 fill-current" />
    </div>
  )
}

const STATUS_FILTERS = [['all', 'all'], ['unverified', 'unverified'], ['new', 'new'], ['active', 'active'], ['cold', 'cold'], ['AI Disabled', 'converted']]

interface ReferLeadFormData {
  name: string
  email: string
  phone: string
  source: 'zillow' | 'realtor' | 'referral' | 'unknown' | ''
  sourceId: string
  propertyId: string
  notes: string
  messageMode: MessageMode
  smsMessage: string
  emailSubject: string
  emailBody: string
}

interface ReferLeadErrors {
  name?: string
  email?: string
  contact?: string
  smsMessage?: string
  emailSubject?: string
  emailBody?: string
  general?: string
}

interface VerifyLeadErrors {
  smsMessage?: string
  emailSubject?: string
  emailBody?: string
  general?: string
}

const EMPTY_REFER_FORM: ReferLeadFormData = {
  name:         '',
  email:        '',
  phone:        '',
  source:       'referral',
  sourceId:     '',
  propertyId:   '',
  notes:        '',
  messageMode:  'ai',
  smsMessage:   '',
  emailSubject: '',
  emailBody:    '',
}

function leadToForm(lead: Lead): ReferLeadFormData {
  return {
    name:         lead.name    ?? '',
    email:        lead.email   ?? '',
    phone:        lead.phone   ?? '',
    source:       (lead.source ?? 'referral') as ReferLeadFormData['source'],
    sourceId:     '',
    propertyId:   lead.propertyId ? String(lead.propertyId) : '', // Set propertyId from lead
    notes:        '',
    messageMode:  'ai',
    smsMessage:   '',
    emailSubject: '',
    emailBody:    '',
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------


function SortableHeader({ label, sortKey, sort, onSort }: {
  label: string
  sortKey: LeadSortKey
  sort: SortState<LeadSortKey>
  onSort: (key: LeadSortKey) => void
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
// 3-dot menu (for verified leads only)
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
          <button
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#475569] hover:bg-[#f9fafb] transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />Edit
          </button>
          <button
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation modal (soft-delete for verified leads)
// ---------------------------------------------------------------------------

function DeleteLeadModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
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
// Permanent delete confirmation modal (for unverified leads)
// ---------------------------------------------------------------------------

function DeleteUnverifiedModal({ name, onConfirm, onCancel, loading }: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <h3 className="text-base font-semibold text-[#0f172a]">Permanently Delete Lead</h3>
        </div>
        <p className="text-sm text-[#475569] mb-1">
          Are you sure you want to permanently delete{' '}
          <span className="font-medium text-[#0f172a]">{name}</span>?
        </p>
        <p className="text-xs text-red-600 font-medium mb-1">
          This action cannot be undone.
        </p>
        <p className="text-xs text-[#94a3b8] mb-6">
          All data associated with this unverified lead will be immediately and permanently removed.
        </p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>Permanently Delete</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Verify Lead Modal — fetches full lead details, then shows outreach options
// ---------------------------------------------------------------------------

function VerifyLeadModal({ lead, onClose, onSuccess }: {
  lead: Lead
  onClose: () => void
  onSuccess: (warning?: string) => void
}) {
  const [messageMode, setMessageMode]   = useState<MessageMode>('ai')
  const [smsMessage, setSmsMessage]     = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody]       = useState('')
  const [errors, setErrors]             = useState<VerifyLeadErrors>({})
  const [submitting, setSubmitting]     = useState(false)

  // Fetch the full lead details (phone + email) since the cache omits them
  const [fullLead, setFullLead]         = useState<Lead | null>(null)
  const [loadingLead, setLoadingLead]   = useState(true)
  const [loadError, setLoadError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingLead(true)
    setLoadError(null)
    fetch(`${BACKEND_URL}api/leads/${lead.id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setFullLead({
          id:        String(data.id),
          name:      data.name      ?? lead.name,
          email:     data.email     ?? '',
          phone:     data.phone     ?? '',
          status:    data.status    ?? lead.status,
          source:    data.source    ?? lead.source,
          score:     data.score     ?? 0,
          createdAt: data.createdAt ?? lead.createdAt,
          updatedAt: data.updatedAt ?? lead.updatedAt,
        })
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load lead details. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoadingLead(false)
      })
    return () => { cancelled = true }
  }, [lead.id])

  const hasPhone = (fullLead?.phone ?? '').trim() !== ''
  const hasEmail = (fullLead?.email ?? '').trim() !== ''

  const validate = (): VerifyLeadErrors => {
    const errs: VerifyLeadErrors = {}
    if (messageMode === 'manual') {
      const wantsSms   = hasPhone && smsMessage.trim() !== ''
      const wantsEmail = hasEmail && (emailSubject.trim() !== '' || emailBody.trim() !== '')

      if (hasEmail && emailBody.trim() !== '' && !emailSubject.trim()) {
        errs.emailSubject = 'Subject is required when sending an email.'
      }
      if (hasEmail && emailSubject.trim() !== '' && !emailBody.trim()) {
        errs.emailBody = 'Email body is required when a subject is provided.'
      }
      if (!wantsSms && !wantsEmail) {
        if (hasPhone && !hasEmail) {
          errs.smsMessage = 'Please enter an SMS message, or choose a different outreach option.'
        } else if (hasEmail && !hasPhone) {
          errs.emailBody = 'Please enter an email message, or choose a different outreach option.'
        } else {
          errs.smsMessage = 'Please fill out at least one message (SMS or email), or choose a different outreach option.'
        }
      }
    }
    return errs
  }

  const handleVerify = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
      // Step 1: Verify the lead (sets status to active)
      const verifyRes = await fetch(`${BACKEND_URL}api/leads/verify/${lead.id}`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: true }),
      })

      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}))
        setErrors({ general: body.error ?? `Server error (${verifyRes.status})` })
        return
      }

      // Step 2: Send initial message if applicable
      let warning: string | undefined

      if (messageMode === 'manual') {
        const smsMsg   = hasPhone && smsMessage.trim()   ? smsMessage.trim()   : null
        const emailSub = hasEmail && emailSubject.trim() ? emailSubject.trim() : null
        const emailBod = hasEmail && emailBody.trim()    ? emailBody.trim()    : null

        const sendRes = await fetch(`${BACKEND_URL}api/leads/${lead.id}/send-initial`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'manual', smsMessage: smsMsg, emailSubject: emailSub, emailBody: emailBod }),
        })
        if (sendRes.ok) {
          const d = await sendRes.json().catch(() => ({}))
          if (d.warning) warning = d.warning
        } else {
          warning = 'Lead was verified but the initial message could not be sent. You can message them manually.'
        }
      } else if (messageMode === 'ai') {
        const sendRes = await fetch(`${BACKEND_URL}api/leads/${lead.id}/send-initial`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'ai' }),
        })
        if (sendRes.ok) {
          const d = await sendRes.json().catch(() => ({}))
          if (d.warning) warning = d.warning
        } else {
          warning = 'Lead was verified but the initial message could not be sent. You can message them manually.'
        }
      }
      // mode === 'none' → no message

      onSuccess(warning)
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
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#0f172a]">Verify Lead</h3>
              <p className="text-xs text-[#94a3b8] mt-0.5">
                Review and activate <span className="font-medium text-[#0f172a]">{lead.name}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-[#475569] transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {errors.general}
            </div>
          )}

          {loadError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {/* Lead summary */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Lead Details</p>
            {loadingLead ? (
              <div className="space-y-2">
                <div className="h-3 bg-amber-200/60 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-amber-200/60 rounded animate-pulse w-1/2" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs text-amber-900">
                <div><span className="font-medium">Name:</span> {fullLead?.name || lead.name || '—'}</div>
                <div><span className="font-medium">Source:</span> {fullLead?.source || lead.source || '—'}</div>
                <div><span className="font-medium">Email:</span> {fullLead?.email || '—'}</div>
                <div><span className="font-medium">Phone:</span> {fullLead?.phone || '—'}</div>
              </div>
            )}
          </div>

          {/* Outreach selection — only shown once lead details are loaded */}
          {!loadingLead && !loadError && (
            <div>
              <SectionHeader
                number={1}
                title="Initial Outreach"
                subtitle="Choose how you'd like to reach out to this lead after verifying them."
              />

              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => { setMessageMode('ai'); setErrors({}) }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${messageMode === 'ai' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <Sparkles className="w-4 h-4" />AI
                </button>
                <button type="button" onClick={() => { setMessageMode('manual'); setErrors({}) }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${messageMode === 'manual' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <MessageSquare className="w-4 h-4" />Manual
                </button>
                <button type="button" onClick={() => { setMessageMode('none'); setErrors({}) }}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${messageMode === 'none' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <BellOff className="w-4 h-4" />None
                </button>
              </div>

              {messageMode === 'ai' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">
                    The AI will craft a personalized opening message based on the lead's name, source, and any available context. It will be sent immediately via the best available channel.
                  </p>
                </div>
              )}

              {messageMode === 'none' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <BellOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700">
                    No message will be sent. The lead will be activated and the AI will remain ready for future responses.
                  </p>
                </div>
              )}

              {messageMode === 'manual' && (
                <div className="space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Write your own opening message. Fill out whichever channel(s) apply — only messages for contact methods the lead has provided will be sent.
                    </p>
                  </div>

                  {hasPhone && (
                    <div className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-emerald-600" />
                        </div>
                        <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wide">SMS Message</span>
                        <span className="text-xs text-[#94a3b8]">— sent to {fullLead?.phone}</span>
                      </div>
                      <textarea
                        value={smsMessage}
                        onChange={(e) => { setSmsMessage(e.target.value); setErrors((p) => ({ ...p, smsMessage: undefined })) }}
                        rows={4}
                        placeholder={`Hi ${fullLead?.name?.split(' ')[0] ?? 'there'}! This is [Your Name] from [Brokerage]. I'd love to connect about your real estate needs — do you have a few minutes to chat?`}
                        className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.smsMessage ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                        style={{ minHeight: '100px' }}
                      />
                      {errors.smsMessage && <p className="text-xs text-red-600 mt-1">{errors.smsMessage}</p>}
                    </div>
                  )}

                  {hasEmail && (
                    <div className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wide">Email Message</span>
                        <span className="text-xs text-[#94a3b8]">— sent to {fullLead?.email}</span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">
                          Subject <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => { setEmailSubject(e.target.value); setErrors((p) => ({ ...p, emailSubject: undefined })) }}
                          placeholder="e.g. Following up on your real estate inquiry"
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.emailSubject ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                        />
                        {errors.emailSubject && <p className="text-xs text-red-600 mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">
                          Body <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={emailBody}
                          onChange={(e) => { setEmailBody(e.target.value); setErrors((p) => ({ ...p, emailBody: undefined })) }}
                          rows={5}
                          placeholder={`Hi ${fullLead?.name?.split(' ')[0] ?? 'there'},\n\nI came across your inquiry and would love to help with your real estate needs. When would be a good time to connect?\n\nBest,\n[Your Name]`}
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.emailBody ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                          style={{ minHeight: '140px' }}
                        />
                        {errors.emailBody && <p className="text-xs text-red-600 mt-1">{errors.emailBody}</p>}
                      </div>
                    </div>
                  )}

                  {/* If lead has neither phone nor email (edge case) */}
                  {!hasPhone && !hasEmail && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600">
                      No contact methods found for this lead. You can still verify them and reach out manually later.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-2xl">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="primary"
            onClick={handleVerify}
            loading={submitting}
            disabled={loadingLead || !!loadError}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            {submitting ? 'Verifying...' : 'Verify Lead'}
          </Button>
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

  const hasPhone   = form.phone.trim() !== ''
  const hasEmail   = form.email.trim() !== ''
  const hasContact = hasPhone || hasEmail

  const showOutreachSection = mode === 'add' && hasContact

  const set = (field: keyof ReferLeadFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setErrors((prev) => ({ ...prev, [field]: undefined, contact: undefined, general: undefined }))
  }

  const setMessageMode = (m: MessageMode) => {
    setForm((prev) => ({ ...prev, messageMode: m }))
    setErrors((prev) => ({ ...prev, smsMessage: undefined, emailSubject: undefined, emailBody: undefined }))
  }

  const validate = (): ReferLeadErrors => {
    const errs: ReferLeadErrors = {}
    if (!form.name.trim()) errs.name = 'Full name is required.'
    if (!form.email.trim() && !form.phone.trim()) errs.contact = 'At least one contact method (email or phone) is required.'
    if (form.email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email address.'
    }
    if (mode === 'add' && form.messageMode === 'manual') {
      const wantsSms   = hasPhone && form.smsMessage.trim() !== ''
      const wantsEmail = hasEmail && (form.emailSubject.trim() !== '' || form.emailBody.trim() !== '')
      if (hasEmail && form.emailBody.trim() !== '' && !form.emailSubject.trim()) {
        errs.emailSubject = 'Subject is required when sending an email.'
      }
      if (hasEmail && form.emailSubject.trim() !== '' && !form.emailBody.trim()) {
        errs.emailBody = 'Email body is required when a subject is provided.'
      }
      if (!wantsSms && !wantsEmail) {
        if (hasPhone && !hasEmail) {
          errs.smsMessage = 'Please enter an SMS message, or choose a different outreach option.'
        } else if (hasEmail && !hasPhone) {
          errs.emailBody = 'Please enter an email message, or choose a different outreach option.'
        } else {
          errs.smsMessage = 'Please fill out at least one message (SMS or email), or choose a different outreach option.'
        }
      }
    }
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSubmitting(true)
    try {
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
          propertyId: form.propertyId ? Number(form.propertyId) : null, // Convert to number for API
          ...(mode === 'add' && { notes: form.notes.trim() || undefined }),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrors({ general: body.error ?? `Server error (${res.status})` })
        return
      }

      const created = await res.json()
      let warning: string | undefined

      if (mode === 'add') {
        if (form.messageMode === 'manual') {
          const smsMessage   = hasPhone && form.smsMessage.trim()   ? form.smsMessage.trim()   : null
          const emailSubject = hasEmail && form.emailSubject.trim() ? form.emailSubject.trim() : null
          const emailBody    = hasEmail && form.emailBody.trim()    ? form.emailBody.trim()    : null

          const sendRes = await fetch(`${BACKEND_URL}api/leads/${created.id}/send-initial`, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'manual', smsMessage, emailSubject, emailBody }),
          })
          if (sendRes.ok) {
            const sendData = await sendRes.json().catch(() => ({}))
            if (sendData.warning) warning = sendData.warning
          } else {
            warning = 'Lead was saved but the initial message could not be sent. You can message them manually.'
          }
        } else if (form.messageMode === 'ai') {
          const sendRes = await fetch(`${BACKEND_URL}api/leads/${created.id}/send-initial`, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'ai' }),
          })
          if (sendRes.ok) {
            const sendData = await sendRes.json().catch(() => ({}))
            if (sendData.warning) warning = sendData.warning
          } else {
            warning = 'Lead was saved but the initial message could not be sent. You can message them manually.'
          }
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
        propertyId: created.propertyId ?? null, // Added propertyId
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{errors.general}</div>
          )}

          {/* Section 1: Contact Information */}
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

          {/* Section 2: Lead Context */}
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

          {/* Section 3: Notes */}
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

          {/* Section 4: Initial Outreach */}
          {showOutreachSection && (
            <div>
              <SectionHeader
                number={4}
                title="Initial Outreach"
                subtitle="Choose how you'd like to reach out to this lead after they're added."
              />
              <div className="flex gap-2 mb-4">
                <button type="button" onClick={() => setMessageMode('ai')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'ai' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <Sparkles className="w-4 h-4" />AI
                </button>
                <button type="button" onClick={() => setMessageMode('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'manual' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <MessageSquare className="w-4 h-4" />Manual
                </button>
                <button type="button" onClick={() => setMessageMode('none')}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === 'none' ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                  <BellOff className="w-4 h-4" />None
                </button>
              </div>

              {form.messageMode === 'ai' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">
                    The AI will craft a personalized opening message based on the lead's name, source, notes, and any property they're interested in. It will be sent immediately via the best available channel and the AI will continue managing this lead's responses automatically.
                  </p>
                </div>
              )}

              {form.messageMode === 'none' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <BellOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700">
                    No message will be sent. The lead will be created and the AI will remain active for future responses. You can message this lead manually at any time.
                  </p>
                </div>
              )}

              {form.messageMode === 'manual' && (
                <div className="space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Write your own opening message. Fill out whichever channel(s) apply — only messages for contact methods the lead has provided will be sent.
                    </p>
                  </div>

                  {hasPhone && (
                    <div className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-emerald-600" />
                        </div>
                        <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wide">SMS Message</span>
                        <span className="text-xs text-[#94a3b8]">— sent to {form.phone}</span>
                      </div>
                      <textarea
                        value={form.smsMessage}
                        onChange={set('smsMessage')}
                        rows={4}
                        placeholder={`Example:\nHi Jane! This is Sarah from Westfield Realty. Mike Johnson mentioned you're looking for a home in the area — I'd love to help! Do you have a few minutes to chat this week?`}
                        className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.smsMessage ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                        style={{ minHeight: '100px' }}
                      />
                      {errors.smsMessage && <p className="text-xs text-red-600 mt-1">{errors.smsMessage}</p>}
                    </div>
                  )}

                  {hasEmail && (
                    <div className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-[#0f172a] uppercase tracking-wide">Email Message</span>
                        <span className="text-xs text-[#94a3b8]">— sent to {form.email}</span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">Subject <span className="text-red-500">*</span></label>
                        <input type="text" value={form.emailSubject} onChange={set('emailSubject')}
                          placeholder="e.g. Following up on your home search"
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.emailSubject ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                        {errors.emailSubject && <p className="text-xs text-red-600 mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">Body <span className="text-red-500">*</span></label>
                        <textarea value={form.emailBody} onChange={set('emailBody')} rows={5}
                          placeholder={`Example:\nHi Jane,\n\nMike Johnson mentioned you're looking for a home in the Westfield area. I'd love to connect!\n\nBest,\nSarah`}
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.emailBody ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                          style={{ minHeight: '140px' }} />
                        {errors.emailBody && <p className="text-xs text-red-600 mt-1">{errors.emailBody}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e7eb] bg-[#f9fafb] rounded-b-2xl">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<UserPlus className="w-4 h-4" />}>
            {submitting ? (mode === 'add' ? 'Adding Lead...' : 'Saving...') : (mode === 'add' ? 'Add Lead' : 'Save Changes')}
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

  // Verify / unverified delete state
  const [verifyTarget, setVerifyTarget]                     = useState<Lead | null>(null)
  const [deleteUnverifiedTarget, setDeleteUnverifiedTarget] = useState<Lead | null>(null)
  const [deletingUnverified, setDeletingUnverified]         = useState(false)

  const agentContactMethod = useMemo(() => null, [])
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
      email:     '',   // not stored in cache — fetched on demand in VerifyLeadModal
      phone:     '',   // not stored in cache — fetched on demand in VerifyLeadModal
      status:    l.status as Lead['status'],
      source:    l.source ?? 'Unknown',
      score:     0,
      createdAt: l.createdAt,
      updatedAt: l.createdAt,
      propertyId: l.propertyId ?? null, // Added propertyId
    }))
  }, [cache])

  const unverifiedCount = useMemo(() => leads.filter((l) => l.status === 'unverified').length, [leads])

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
      propertyId: lead.propertyId, // Added propertyId
    }
    if (modalMode === 'add') {
      addLead(raw)
      if (warning) showToast(warning, 'warning')
      else showToast('Lead added successfully!')
    } else {
      updateLead(raw)
      showToast('Lead updated successfully!')
    }
    setShowModal(false)
  }, [modalMode, addLead, updateLead, showToast])

  // Verify success — update lead status in cache to 'active'
  const handleVerifySuccess = useCallback((warning?: string) => {
    if (!verifyTarget) return
    const raw: RawLead = {
      id:        Number(verifyTarget.id),
      status:    'active',
      createdAt: verifyTarget.createdAt,
      name:      verifyTarget.name,
      source:    verifyTarget.source,
      propertyId: verifyTarget.propertyId, // Added propertyId
    }
    updateLead(raw)
    setVerifyTarget(null)
    if (warning) showToast(warning, 'warning')
    else showToast('Lead verified and activated!')
  }, [verifyTarget, updateLead, showToast])

  // Permanent delete for unverified leads
  const handleDeleteUnverifiedConfirm = useCallback(async () => {
    if (!deleteUnverifiedTarget) return
    setDeletingUnverified(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/leads/verify/${deleteUnverifiedTarget.id}`, {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: false }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        showToast(body.error ?? 'Failed to delete lead.', 'warning')
        return
      }
      removeLead(Number(deleteUnverifiedTarget.id))
      showToast('Unverified lead permanently deleted.')
    } catch {
      showToast('Network error. Please try again.', 'warning')
    } finally {
      setDeletingUnverified(false)
      setDeleteUnverifiedTarget(null)
    }
  }, [deleteUnverifiedTarget, removeLead, showToast])

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

  // ── Filter + sort pipeline ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const byStatus = statusFilter === 'all' ? leads : leads.filter((l) => l.status === statusFilter)
    const searched = searchAndRank(byStatus, search, (l) => [l.name, l.email, l.phone, l.source, l.status])

    // Apply user sort first, then pin unverified leads to the top
    return sortItems(searched, sort, (item, key) => {
      switch (key) {
        case 'name':           return item.name
        case 'source':         return item.source
        case 'status':         return item.status
        case 'propertyId':     return item.propertyId // Added propertyId sort key
        case 'createdAt':      return item.createdAt
        default:               return ''
      }
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

      {deleteUnverifiedTarget && (
        <DeleteUnverifiedModal
          name={deleteUnverifiedTarget.name}
          onConfirm={handleDeleteUnverifiedConfirm}
          onCancel={() => setDeleteUnverifiedTarget(null)}
          loading={deletingUnverified}
        />
      )}

      {verifyTarget && (
        <VerifyLeadModal
          lead={verifyTarget}
          onClose={() => setVerifyTarget(null)}
          onSuccess={handleVerifySuccess}
        />
      )}

      {/* Toast */}
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

        {/* Unverified leads attention banner — only shown when there are unverified leads and not already filtering by them */}
        {unverifiedCount > 0 && statusFilter !== 'unverified' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800 flex-1">
              <span className="font-semibold">
                {unverifiedCount} unverified lead{unverifiedCount !== 1 ? 's' : ''}
              </span>
              {' '}require your review before they can be contacted.
            </p>
            <button
              onClick={() => setStatusFilter('unverified')}
              className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors flex-shrink-0"
            >
              Review now
            </button>
          </div>
        )}

        {/* Filters */}
        <Card>
          <div className="px-5 py-3 flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input icon={Search} placeholder="Search by name, email, phone, source, or status..." value={searchRaw} onChange={(e) => setSearchRaw(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-[#94a3b8] flex-shrink-0" />
              {STATUS_FILTERS.map((s) => (
                <button key={s} onClick={() => setStatusFilter(s[1])}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${
                    statusFilter === s[0]
                      ? s[0] === 'unverified'
                        ? 'bg-amber-500 text-white'
                        : 'bg-[#4f46e5] text-white'
                      : s[0] === 'unverified'
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'bg-[#f9fafb] text-[#475569] hover:bg-[#eef2ff] hover:text-[#4f46e5]'
                  }`}>
                  {s[0] === 'all' ? 'All' : s[0].replace('_', ' ')}
                  {/* Badge showing count — only shown when there are unverified leads */}
                  {s[0] === 'unverified' && unverifiedCount > 0 && (
                    <span className={`ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold ${
                      statusFilter === 'unverified' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                    }`}>
                      {unverifiedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="border-t border-[#e5e7eb]">
            {/* Column headers — last column wider to accommodate Verify + Delete buttons */}
            {/* Added a property interest column */}
            <div className="hidden sm:grid grid-cols-[2fr_1fr_1.5fr_1fr_220px] gap-4 px-5 py-2.5 bg-[#f9fafb] border-b border-[#e5e7eb]">
              <SortableHeader label="Name" sortKey="name" sort={sort} onSort={handleSort} />
              <SortableHeader label="Source" sortKey="source" sort={sort} onSort={handleSort} />
              <SortableHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
              <SortableHeader label="Property" sortKey="propertyId" sort={sort} onSort={handleSort} /> {/* New Column Header */}
              <div />
            </div>

            {loading ? (
              <SkeletonTable rows={7} />
            ) : filtered.length === 0 ? (
              <EmptyState icon={Users} title="No leads found" description="Try adjusting your search or filter." />
            ) : (
              <div className="divide-y divide-[#e5e7eb]">
                {filtered.map((lead) => {
                  const isUnverified = lead.status === 'unverified'
                  const isReady = lead.status === 'active' || lead.status === 'converted' // Determine if lead is "ready"
                  const interestedProperty = lead.propertyId
                    ? properties.find(p => p.id === String(lead.propertyId))
                    : undefined

                  return (
                    <div
                      key={lead.id}
                      onClick={() => !isUnverified && navigate(`/leads/${lead.id}`)}
                      className={`grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.5fr_1fr_220px] gap-4 px-5 py-3.5 transition-colors items-center ${
                        isUnverified
                          ? 'bg-amber-50/40 hover:bg-amber-50'
                          : 'hover:bg-[#f9fafb] cursor-pointer'
                      }`}
                    >
                      {/* Name */}
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isUnverified ? 'bg-amber-100' : 'bg-[#eef2ff]'}`}>
                          {isUnverified
                            ? <ShieldAlert className="w-4 h-4 text-amber-600" />
                            : <span className="text-xs font-semibold text-[#4f46e5]">{getInitials(lead.name)}</span>
                          }
                        </div>
                        <div className="min-w-0 flex items-center gap-2">
                          <p className="text-sm font-medium text-[#0f172a] truncate">
                            <HighlightedText text={lead.name} query={search} />
                          </p>
                          {isReady && <LeadReadyIndicator lead={lead} />}
                          <p className="text-xs text-[#94a3b8] mt-0.5">{formatRelativeTime(lead.updatedAt)}</p>
                        </div>
                      </div>

                      {/* Source */}
                      <div className="hidden sm:block">
                        <span className="text-sm text-[#475569]">
                          <HighlightedText text={lead.source} query={search} />
                        </span>
                      </div>

                      {/* Status */}
                      <div className="hidden sm:block">
                        <LeadStatusBadge status={lead.status} />
                      </div>

                      {/* Property Interest */}
                      <div className="hidden sm:block">
                        <span className="text-sm text-[#0f172a]">
                          {interestedProperty ? (
                            <HighlightedText text={interestedProperty.address || 'N/A'} query={search} />
                          ) : (
                            'N/A'
                          )}
                        </span>
                      </div>

                      {/* Actions */}
                      <div
                        className="hidden sm:flex justify-end items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {isUnverified ? (
                          <>
                            <button
                              onClick={() => setVerifyTarget(lead)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verify
                            </button>
                            <button
                              onClick={() => setDeleteUnverifiedTarget(lead)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
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
