import { useState } from 'react'
import { X, UserPlus, Sparkles, MessageSquare, BellOff, Info } from 'lucide-react'
import { Button } from '../ui/Button'
import { ModalFrame, SectionHeader } from './LeadFormShared'
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
    if (form.source === 'referral' && !form.sourceId.trim()) errs.sourceId = 'Referrer name is required for referral leads.'
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
    <ModalFrame titleId="lead-form-title" onClose={onClose} busy={submitting}>
      <div className="w-full max-w-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 id="lead-form-title" className="text-base font-semibold text-foreground">{mode === 'add' ? 'Refer a Lead' : 'Edit Lead'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'add'
                ? 'Add a referred lead to your CRM. The more detail you provide, the better the AI can engage them.'
                : "Update the lead's contact information and context."}
            </p>
          </div>
          <button onClick={onClose} disabled={submitting} aria-label="Close lead dialog" className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0 min-w-11 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 px-6 py-5 space-y-6">
          {errors.general && <div role="alert" className="bg-destructive-subtle border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{errors.general}</div>}

          {/* Section 1: Contact Information */}
          <div>
            <SectionHeader number={1} title="Contact Information" subtitle="Who is this lead? Provide as much contact detail as possible." />
            <div className="space-y-4">
              <div>
                <label htmlFor="lead-name" className="crm-field-label">Full Name <span>*</span></label>
                <input id="lead-name" aria-required="true" aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lead-name-error' : undefined} type="text" value={form.name} onChange={set('name')} placeholder="e.g. Jane Smith"
                  className="crm-field" />
                {errors.name && <p id="lead-name-error" className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>
              {errors.contact && <div id="lead-contact-error" className="bg-destructive-subtle border border-destructive rounded-lg px-3 py-2 text-xs text-destructive">{errors.contact}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="lead-email" className="crm-field-label">Email Address</label>
                  <input id="lead-email" aria-invalid={!!(errors.email || errors.contact)} aria-describedby={[errors.email && 'lead-email-error', errors.contact && 'lead-contact-error'].filter(Boolean).join(' ') || undefined} type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com"
                    className="crm-field" />
                  {errors.email && <p id="lead-email-error" className="text-xs text-destructive mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label htmlFor="lead-phone" className="crm-field-label">Phone Number</label>
                  <input id="lead-phone" aria-invalid={!!errors.contact} aria-describedby={errors.contact ? 'lead-contact-error' : undefined} type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000"
                    className="crm-field" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Lead Context */}
          <div>
            <SectionHeader number={2} title="Lead Context" subtitle="Where did this lead come from, and are they interested in a specific property?" />
            <div className="space-y-4">
              <div>
                <label htmlFor="lead-source" className="crm-field-label">Lead Source</label>
                <select id="lead-source" value={form.source} onChange={set('source')} className="w-full px-3 py-2 text-sm border border-input rounded-md bg-card">
                  <option value="referral">Referral — Personally referred by someone</option>
                  <option value="zillow">Zillow</option>
                  <option value="realtor">Realtor.com</option>
                  <option value="unknown">Unknown / Other</option>
                </select>
              </div>
              {form.source === 'referral' && (
                <div>
                  <label htmlFor="lead-referrer" className="crm-field-label">Referrer <span>*</span></label>
                  <input id="lead-referrer" aria-required="true" aria-invalid={!!errors.sourceId} aria-describedby={errors.sourceId ? 'lead-referrer-error' : undefined} type="text" value={form.sourceId} onChange={set('sourceId')} placeholder="e.g. John Smith"
                    className="crm-field" />
                  {errors.sourceId && <p id="lead-referrer-error" className="text-xs text-destructive mt-1">{errors.sourceId}</p>}
                </div>
              )}
              {form.source !== 'referral' && (
                <div>
                  <label htmlFor="lead-source-id" className="crm-field-label">Source ID (optional)</label>
                  <input id="lead-source-id" type="text" value={form.sourceId} onChange={set('sourceId')} placeholder="e.g. Zillow inquiry ID, MLS ID"
                    className="crm-field" />
                </div>
              )}
              {properties.length > 0 && (
                <div>
                  <label htmlFor="lead-property" className="crm-field-label">Interested Property (optional)</label>
                  <select id="lead-property" value={form.propertyId} onChange={set('propertyId')} className="w-full px-3 py-2 text-sm border border-input rounded-md bg-card">
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
              <div className="bg-caution-subtle border border-border rounded-md px-3 py-2.5 mb-2 flex items-start gap-2">
                <Info aria-hidden="true" className="w-3.5 h-3.5 text-caution flex-shrink-0 mt-0.5" />
                <p className="text-sm text-caution">Be as detailed as possible. Include what the lead is looking for, their timeline, budget range, preferred neighborhoods, family situation, motivation for buying or selling, and any personal context that may help build rapport.</p>
              </div>
              <label htmlFor="lead-notes" className="crm-field-label">Initial notes</label>
              <textarea id="lead-notes" value={form.notes} onChange={set('notes')} rows={5}
                placeholder={`Example:\nJane was referred by Mike Johnson. She's looking to buy a 3-bedroom home in the Westfield area within the next 3 months. Budget is around $450k...`}
                className="crm-field resize-y leading-relaxed"
                style={{ minHeight: '120px' }} />
            </div>
          )}

          {/* Section 4: Initial Outreach (add mode + has contact only) */}
          {mode === 'add' && hasContact && (
            <div>
              <SectionHeader number={4} title="Initial Outreach" subtitle="Choose how you'd like to reach out to this lead after they're added." />

              <div role="group" aria-label="Initial outreach" className="flex flex-wrap gap-2 mb-4">
                {(['ai', 'manual', 'none'] as MessageMode[]).map((m) => (
                  <button key={m} type="button" aria-pressed={form.messageMode === m} onClick={() => setMessageMode(m)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium border transition-colors ${form.messageMode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-input hover:bg-accent'}`}>
                    {m === 'ai'     && <><Sparkles className="w-4 h-4" />AI</>}
                    {m === 'manual' && <><MessageSquare className="w-4 h-4" />Manual</>}
                    {m === 'none'   && <><BellOff className="w-4 h-4" />None</>}
                  </button>
                ))}
              </div>

              {form.messageMode === 'ai' && (
                <div className="bg-accent border border-border rounded-md px-4 py-3 flex items-start gap-2">
                  <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-primary">The AI will craft a personalized opening message based on the lead's name, source, notes, and any property they're interested in. It will be sent immediately via the best available channel and the AI will continue managing this lead's responses automatically.</p>
                </div>
              )}

              {form.messageMode === 'none' && (
                <div className="bg-background border border-border rounded-md px-4 py-3 flex items-start gap-2">
                  <BellOff aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">No message will be sent. The lead will be created and the AI will remain active for future responses. You can message this lead manually at any time.</p>
                </div>
              )}

              {form.messageMode === 'manual' && (
                <div className="space-y-5">
                  <div className="bg-caution-subtle border border-border rounded-md px-3 py-2.5 flex items-start gap-2">
                    <Info aria-hidden="true" className="w-3.5 h-3.5 text-caution flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-caution">Write your own opening message. Fill out whichever channel(s) apply — only messages for contact methods the lead has provided will be sent.</p>
                  </div>

                  {hasPhone && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div aria-hidden="true" className="w-5 h-5 rounded-sm bg-accent flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide">SMS Message</span>
                        <span className="text-xs text-muted-foreground">— sent to {form.phone}</span>
                      </div>
                      <label htmlFor="lead-sms" className="crm-field-label">SMS message</label>
                      <textarea id="lead-sms" aria-invalid={!!errors.smsMessage} aria-describedby={errors.smsMessage ? 'lead-sms-error' : undefined} value={form.smsMessage} onChange={set('smsMessage')} rows={4}
                        placeholder={`Example:\nHi ${firstName}! This is Sarah from Westfield Realty. Mike Johnson mentioned you're looking for a home in the area — I'd love to help! Do you have a few minutes to chat this week?`}
                        className="crm-field resize-y leading-relaxed"
                        style={{ minHeight: '100px' }} />
                      {errors.smsMessage && <p id="lead-sms-error" className="text-xs text-destructive mt-1">{errors.smsMessage}</p>}
                    </div>
                  )}

                  {hasEmail && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div aria-hidden="true" className="w-5 h-5 rounded-sm bg-accent flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide">Email Message</span>
                        <span className="text-xs text-muted-foreground">— sent to {form.email}</span>
                      </div>
                      <div>
                        <label htmlFor="lead-subject" className="crm-field-label">Subject *</label>
                        <input id="lead-subject" aria-invalid={!!errors.emailSubject} aria-describedby={errors.emailSubject ? 'lead-subject-error' : undefined} type="text" value={form.emailSubject} onChange={set('emailSubject')} placeholder="e.g. Following up on your home search"
                          className="crm-field" />
                        {errors.emailSubject && <p id="lead-subject-error" className="text-xs text-destructive mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label htmlFor="lead-body" className="crm-field-label">Email body *</label>
                        <textarea id="lead-body" aria-invalid={!!errors.emailBody} aria-describedby={errors.emailBody ? 'lead-body-error' : undefined} value={form.emailBody} onChange={set('emailBody')} rows={5}
                          placeholder={`Example:\nHi ${firstName},\n\nMike Johnson mentioned you're looking for a home in the Westfield area. I'd love to connect!\n\nBest,\nSarah`}
                          className="crm-field resize-y leading-relaxed"
                          style={{ minHeight: '140px' }} />
                        {errors.emailBody && <p id="lead-body-error" className="text-xs text-destructive mt-1">{errors.emailBody}</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-border bg-background">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<UserPlus className="w-4 h-4" />}>
            {submitting ? (mode === 'add' ? 'Adding Lead...' : 'Saving...') : (mode === 'add' ? 'Add Lead' : 'Save Changes')}
          </Button>
        </div>
      </div>
    </ModalFrame>
  )
}
