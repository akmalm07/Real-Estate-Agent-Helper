import { useState } from 'react'
import { X, UserPlus, Sparkles, MessageSquare, BellOff, Info } from 'lucide-react'
import { Button } from '../ui/Button'
import { SectionHeader } from './LeadFormShared'
import { BACKEND_URL } from '../../consts'
import type { Lead, MessageMode, ReferLeadFormData, ReferLeadErrors } from './types'
import { EMPTY_REFER_FORM, leadToForm } from './types'

export function LeadModal({
  mode,
  initial,
  onClose,
  onSuccess,
  properties,
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
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Please enter a valid email address.'
    if (mode === 'add' && form.messageMode === 'manual') {
      const wantsSms   = hasPhone && form.smsMessage.trim() !== ''
      const wantsEmail = hasEmail && (form.emailSubject.trim() !== '' || form.emailBody.trim() !== '')
      if (hasEmail && form.emailBody.trim() && !form.emailSubject.trim())    errs.emailSubject = 'Subject is required when sending an email.'
      if (hasEmail && form.emailSubject.trim() && !form.emailBody.trim())    errs.emailBody    = 'Email body is required when a subject is provided.'
      if (!wantsSms && !wantsEmail) {
        if      (hasPhone && !hasEmail) errs.smsMessage = 'Please enter an SMS message, or choose a different outreach option.'
        else if (hasEmail && !hasPhone) errs.emailBody  = 'Please enter an email message, or choose a different outreach option.'
        else                            errs.smsMessage = 'Please fill out at least one message (SMS or email), or choose a different outreach option.'
      }
    }
    return errs
  }

  const sendInitial = async (leadId: string) => {
    const body = form.messageMode === 'manual'
      ? {
          mode:         'manual',
          smsMessage:   hasPhone && form.smsMessage.trim()   ? form.smsMessage.trim()   : null,
          emailSubject: hasEmail && form.emailSubject.trim() ? form.emailSubject.trim() : null,
          emailBody:    hasEmail && form.emailBody.trim()    ? form.emailBody.trim()    : null,
        }
      : { mode: form.messageMode }

    const res = await fetch(`${BACKEND_URL}api/leads/${leadId}/send-initial`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return 'Lead was saved but the initial message could not be sent. You can message them manually.'
    const d = await res.json().catch(() => ({}))
    return d.warning as string | undefined
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const url    = mode === 'add' ? `${BACKEND_URL}api/leads` : `${BACKEND_URL}api/leads/${initial!.id}`
      const method = mode === 'add' ? 'POST' : 'PATCH'
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:       form.name.trim(),
          email:      form.email.trim()    || null,
          phone:      form.phone.trim()    || null,
          source:     form.source          || 'referral',
          sourceId:   form.sourceId.trim() || null,
          propertyId: form.propertyId ? Number(form.propertyId) : null,
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
      if (mode === 'add' && form.messageMode !== 'none') warning = await sendInitial(String(created.id))

      onSuccess({
        id:         String(created.id),
        name:       created.name   ?? 'Unknown',
        email:      created.email  ?? '',
        phone:      created.phone  ?? '',
        status:     created.status as Lead['status'],
        source:     created.source ?? 'referral',
        score:      0,
        createdAt:  created.createdAt,
        updatedAt:  created.updatedAt ?? created.createdAt,
        propertyId: created.propertyId ?? null,
      }, warning)
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = form.name.split(' ')[0] || 'them'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h3 className="text-base font-semibold text-[#0f172a]">{mode === 'add' ? 'Refer a Lead' : 'Edit Lead'}</h3>
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
          {errors.general && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{errors.general}</div>}

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
              {errors.contact && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{errors.contact}</div>}
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
                <select value={form.source} onChange={set('source')} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors bg-white">
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
                  <select value={form.propertyId} onChange={set('propertyId')} className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors bg-white">
                    <option value="">No specific property</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>{p.address ?? p.addressLine1 ?? `Property #${p.id}`}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Notes (add mode only) */}
          {mode === 'add' && (
            <div>
              <SectionHeader number={3} title="Initial Notes" subtitle="Any context that will help the AI engage this lead effectively." />
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">Be as detailed as possible. Include what the lead is looking for, their timeline, budget range, preferred neighborhoods, family situation, motivation for buying or selling, and any personal context that may help build rapport.</p>
              </div>
              <textarea value={form.notes} onChange={set('notes')} rows={5}
                placeholder={`Example:\nJane was referred by Mike Johnson. She's looking to buy a 3-bedroom home in the Westfield area within the next 3 months. Budget is around $450k...`}
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#4f46e5] transition-colors resize-y leading-relaxed"
                style={{ minHeight: '120px' }} />
            </div>
          )}

          {/* Section 4: Initial Outreach (add mode + has contact only) */}
          {mode === 'add' && hasContact && (
            <div>
              <SectionHeader number={4} title="Initial Outreach" subtitle="Choose how you'd like to reach out to this lead after they're added." />

              <div className="flex gap-2 mb-4">
                {(['ai', 'manual', 'none'] as MessageMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setMessageMode(m)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${form.messageMode === m ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                    {m === 'ai'     && <><Sparkles className="w-4 h-4" />AI</>}
                    {m === 'manual' && <><MessageSquare className="w-4 h-4" />Manual</>}
                    {m === 'none'   && <><BellOff className="w-4 h-4" />None</>}
                  </button>
                ))}
              </div>

              {form.messageMode === 'ai' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">The AI will craft a personalized opening message based on the lead's name, source, notes, and any property they're interested in. It will be sent immediately via the best available channel and the AI will continue managing this lead's responses automatically.</p>
                </div>
              )}

              {form.messageMode === 'none' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <BellOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700">No message will be sent. The lead will be created and the AI will remain active for future responses. You can message this lead manually at any time.</p>
                </div>
              )}

              {form.messageMode === 'manual' && (
                <div className="space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800">Write your own opening message. Fill out whichever channel(s) apply — only messages for contact methods the lead has provided will be sent.</p>
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
                      <textarea value={form.smsMessage} onChange={set('smsMessage')} rows={4}
                        placeholder={`Example:\nHi ${firstName}! This is Sarah from Westfield Realty. Mike Johnson mentioned you're looking for a home in the area — I'd love to help! Do you have a few minutes to chat this week?`}
                        className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.smsMessage ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                        style={{ minHeight: '100px' }} />
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
                        <input type="text" value={form.emailSubject} onChange={set('emailSubject')} placeholder="e.g. Following up on your home search"
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.emailSubject ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                        {errors.emailSubject && <p className="text-xs text-red-600 mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">Body <span className="text-red-500">*</span></label>
                        <textarea value={form.emailBody} onChange={set('emailBody')} rows={5}
                          placeholder={`Example:\nHi ${firstName},\n\nMike Johnson mentioned you're looking for a home in the Westfield area. I'd love to connect!\n\nBest,\nSarah`}
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

        {/* Footer */}
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
