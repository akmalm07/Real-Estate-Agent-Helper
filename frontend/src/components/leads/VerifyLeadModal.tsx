import { useEffect, useState } from 'react'
import { X, ShieldAlert, Sparkles, MessageSquare, BellOff, Info, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { ModalFrame, SectionHeader } from './LeadFormShared'
import { BACKEND_URL } from '../../consts'
import type { Lead, MessageMode, VerifyLeadErrors } from './types'

export function VerifyLeadModal({ lead, onClose, onSuccess }: {
  lead: Lead
  onClose: () => void
  onSuccess: (warning?: string) => void
}) {
  return <VerifyLeadForm key={lead.id} lead={lead} onClose={onClose} onSuccess={onSuccess} />
}

function VerifyLeadForm({ lead, onClose, onSuccess }: {
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
  // Key details by the same primitive fields that determine the request context.
  // Drafts belong to the lead identity, not to the fetched detail snapshot.
  const requestKey = JSON.stringify([lead.id, lead.name, lead.email, lead.phone, lead.status, lead.source, lead.createdAt, lead.updatedAt])
  const [details, setDetails] = useState<{ key: string; lead: Lead | null; error: string | null; loading: boolean }>({
    key: requestKey, lead: null, error: null, loading: true,
  })
  if (details.key !== requestKey) {
    setDetails({ key: requestKey, lead: null, error: null, loading: true })
  }
  const loadingLead = details.key !== requestKey || details.loading
  const fullLead = !loadingLead ? details.lead : null
  const loadError = !loadingLead ? details.error : null

  useEffect(() => {
    let cancelled = false
    fetch(`${BACKEND_URL}api/leads/${lead.id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setDetails({ key: requestKey, error: null, loading: false, lead: {
          id:        String(data.id),
          name:      data.name      ?? lead.name,
          email:     data.email     ?? lead.email,
          phone:     data.phone     ?? lead.phone,
          status:    data.status    ?? lead.status,
          source:    data.source    ?? lead.source,
          score:     data.score     ?? 0,
          createdAt: data.createdAt ?? lead.createdAt,
          updatedAt: data.updatedAt ?? lead.updatedAt,
        } })
      })
      .catch(() => { if (!cancelled) setDetails({ key: requestKey, lead: null, loading: false, error: 'Could not load lead details. Please try again.' }) })
    return () => { cancelled = true }
  }, [requestKey, lead.id, lead.name, lead.email, lead.phone, lead.status, lead.source, lead.createdAt, lead.updatedAt])

  const hasPhone = (fullLead?.phone ?? '').trim() !== ''
  const hasEmail = (fullLead?.email ?? '').trim() !== ''

  const validate = (): VerifyLeadErrors => {
    const errs: VerifyLeadErrors = {}
    if (messageMode === 'manual') {
      const wantsSms   = hasPhone && smsMessage.trim() !== ''
      const wantsEmail = hasEmail && (emailSubject.trim() !== '' || emailBody.trim() !== '')
      if (hasEmail && emailBody.trim() && !emailSubject.trim())    errs.emailSubject = 'Subject is required when sending an email.'
      if (hasEmail && emailSubject.trim() && !emailBody.trim())    errs.emailBody    = 'Email body is required when a subject is provided.'
      if (!wantsSms && !wantsEmail) {
        if      (hasPhone && !hasEmail) errs.smsMessage = 'Please enter an SMS message, or choose a different outreach option.'
        else if (hasEmail && !hasPhone) errs.emailBody  = 'Please enter an email message, or choose a different outreach option.'
        else                            errs.smsMessage = 'Please fill out at least one message (SMS or email), or choose a different outreach option.'
      }
    }
    return errs
  }

  const sendInitial = async (leadId: string, mode: MessageMode, opts?: { smsMessage: string | null; emailSubject: string | null; emailBody: string | null }) => {
    const res = await fetch(`${BACKEND_URL}api/leads/${leadId}/send-initial`, {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'manual' ? { mode, ...opts } : { mode }),
    })
    if (!res.ok) return 'Lead was verified but the initial message could not be sent. You can message them manually.'
    const d = await res.json().catch(() => ({}))
    return d.warning as string | undefined
  }

  const handleVerify = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const verifyRes = await fetch(`${BACKEND_URL}api/leads/verify/${lead.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verify: true }),
      })
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({}))
        setErrors({ general: body.error ?? `Server error (${verifyRes.status})` })
        return
      }
      let warning: string | undefined
      if (messageMode === 'manual') {
        warning = await sendInitial(lead.id, 'manual', {
          smsMessage:   hasPhone && smsMessage.trim()   ? smsMessage.trim()   : null,
          emailSubject: hasEmail && emailSubject.trim() ? emailSubject.trim() : null,
          emailBody:    hasEmail && emailBody.trim()    ? emailBody.trim()    : null,
        })
      } else if (messageMode === 'ai') {
        warning = await sendInitial(lead.id, 'ai')
      }
      onSuccess(warning)
    } catch {
      setErrors({ general: 'Network error. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = fullLead?.name?.split(' ')[0] ?? 'there'

  return (
    <ModalFrame titleId="verify-lead-title" onClose={onClose} busy={submitting}>
      <div className="w-full max-w-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-caution-subtle flex items-center justify-center flex-shrink-0">
              <ShieldAlert aria-hidden="true" className="w-4 h-4 text-caution" />
            </div>
            <div>
              <h3 id="verify-lead-title" className="text-base font-semibold text-foreground">Verify Lead</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Review and activate <span className="font-medium text-foreground">{lead.name}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} aria-label="Close verification dialog" className="text-muted-foreground hover:text-foreground transition-colors ml-4 flex-shrink-0 min-w-11 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 px-6 py-5 space-y-6">
          {errors.general && <div role="alert" className="bg-destructive-subtle border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{errors.general}</div>}
          {loadError    && <div role="alert" className="bg-destructive-subtle border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">{loadError}</div>}

          {/* Lead summary */}
          <div className="bg-caution-subtle border border-border rounded-lg p-4">
            <p className="text-xs font-semibold text-caution uppercase tracking-wide mb-2">Lead Details</p>
            {loadingLead ? (
              <div className="space-y-2">
                <div aria-hidden="true" className="h-3 bg-muted rounded animate-pulse w-3/4" />
                <div aria-hidden="true" className="h-3 bg-muted rounded animate-pulse w-1/2" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-caution">
                <div><span className="font-medium">Name:</span>   {fullLead?.name   || lead.name   || '—'}</div>
                <div><span className="font-medium">Source:</span> {fullLead?.source || lead.source || '—'}</div>
                <div><span className="font-medium">Email:</span>  {fullLead?.email  || '—'}</div>
                <div><span className="font-medium">Phone:</span>  {fullLead?.phone  || '—'}</div>
              </div>
            )}
          </div>

          {/* Outreach selection */}
          {!loadingLead && !loadError && (
            <div>
              <SectionHeader number={1} title="Initial Outreach" subtitle="Choose how you'd like to reach out to this lead after verifying them." />

              {/* Mode toggle */}
              <div role="group" aria-label="Initial outreach" className="flex flex-wrap gap-2 mb-4">
                {(['ai', 'manual', 'none'] as MessageMode[]).map((m) => (
                  <button key={m} type="button" aria-pressed={messageMode === m} onClick={() => { setMessageMode(m); setErrors({}) }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium border transition-colors ${messageMode === m ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-input hover:bg-accent'}`}>
                    {m === 'ai'     && <><Sparkles className="w-4 h-4" />AI</>}
                    {m === 'manual' && <><MessageSquare className="w-4 h-4" />Manual</>}
                    {m === 'none'   && <><BellOff className="w-4 h-4" />None</>}
                  </button>
                ))}
              </div>

              {messageMode === 'ai' && (
                <div className="bg-accent border border-border rounded-md px-4 py-3 flex items-start gap-2">
                  <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-primary">The AI will craft a personalized opening message based on the lead's name, source, and any available context. It will be sent immediately via the best available channel.</p>
                </div>
              )}

              {messageMode === 'none' && (
                <div className="bg-background border border-border rounded-md px-4 py-3 flex items-start gap-2">
                  <BellOff aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">No message will be sent. The lead will be activated and the AI will remain ready for future responses.</p>
                </div>
              )}

              {messageMode === 'manual' && (
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
                        <span className="text-xs text-muted-foreground">— sent to {fullLead?.phone}</span>
                      </div>
                      <label htmlFor="verify-sms" className="crm-field-label">SMS message</label>
                      <textarea id="verify-sms" aria-invalid={!!errors.smsMessage} aria-describedby={errors.smsMessage ? 'verify-sms-error' : undefined} value={smsMessage} onChange={(e) => { setSmsMessage(e.target.value); setErrors((p) => ({ ...p, smsMessage: undefined })) }}
                        rows={4} placeholder={`Hi ${firstName}! This is [Your Name] from [Brokerage]. I'd love to connect about your real estate needs — do you have a few minutes to chat?`}
                        className="crm-field resize-y leading-relaxed"
                        style={{ minHeight: '100px' }} />
                      {errors.smsMessage && <p id="verify-sms-error" className="text-xs text-destructive mt-1">{errors.smsMessage}</p>}
                    </div>
                  )}

                  {hasEmail && (
                    <div className="border border-border rounded-lg p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div aria-hidden="true" className="w-5 h-5 rounded-sm bg-accent flex items-center justify-center flex-shrink-0">
                          <MessageSquare className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-wide">Email Message</span>
                        <span className="text-xs text-muted-foreground">— sent to {fullLead?.email}</span>
                      </div>
                      <div>
                        <label htmlFor="verify-subject" className="crm-field-label">Subject *</label>
                        <input id="verify-subject" aria-invalid={!!errors.emailSubject} aria-describedby={errors.emailSubject ? 'verify-subject-error' : undefined} type="text" value={emailSubject} onChange={(e) => { setEmailSubject(e.target.value); setErrors((p) => ({ ...p, emailSubject: undefined })) }}
                          placeholder="e.g. Following up on your real estate inquiry"
                          className="crm-field" />
                        {errors.emailSubject && <p id="verify-subject-error" className="text-xs text-destructive mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label htmlFor="verify-body" className="crm-field-label">Email body *</label>
                        <textarea id="verify-body" aria-invalid={!!errors.emailBody} aria-describedby={errors.emailBody ? 'verify-body-error' : undefined} value={emailBody} onChange={(e) => { setEmailBody(e.target.value); setErrors((p) => ({ ...p, emailBody: undefined })) }}
                          rows={5} placeholder={`Hi ${firstName},\n\nI came across your inquiry and would love to help with your real estate needs. When would be a good time to connect?\n\nBest,\n[Your Name]`}
                          className="crm-field resize-y leading-relaxed"
                          style={{ minHeight: '140px' }} />
                        {errors.emailBody && <p id="verify-body-error" className="text-xs text-destructive mt-1">{errors.emailBody}</p>}
                      </div>
                    </div>
                  )}

                  {!hasPhone && !hasEmail && (
                    <div className="bg-background border border-border rounded-md px-4 py-3 text-sm text-muted-foreground">
                      No contact methods found for this lead. You can still verify them and reach out manually later.
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
          <Button variant="primary" onClick={handleVerify} loading={submitting} disabled={loadingLead || !!loadError} icon={<CheckCircle2 className="w-4 h-4" />}>
            {submitting ? 'Verifying...' : 'Verify Lead'}
          </Button>
        </div>
      </div>
    </ModalFrame>
  )
}
