import { useEffect, useState } from 'react'
import { X, ShieldAlert, Sparkles, MessageSquare, BellOff, Info, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { SectionHeader } from './LeadFormShared'
import { BACKEND_URL } from '../../consts'
import type { Lead, MessageMode, VerifyLeadErrors } from './types'

export function VerifyLeadModal({ lead, onClose, onSuccess }: {
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
          email:     data.email     ?? lead.email,
          phone:     data.phone     ?? lead.phone,
          status:    data.status    ?? lead.status,
          source:    data.source    ?? lead.source,
          score:     data.score     ?? 0,
          createdAt: data.createdAt ?? lead.createdAt,
          updatedAt: data.updatedAt ?? lead.updatedAt,
        })
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load lead details. Please try again.') })
      .finally(() => { if (!cancelled) setLoadingLead(false) })
    return () => { cancelled = true }
  }, [lead.id, lead.name, lead.email, lead.phone, lead.status, lead.source, lead.createdAt, lead.updatedAt])

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
          {errors.general && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{errors.general}</div>}
          {loadError    && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{loadError}</div>}

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
              <div className="flex gap-2 mb-4">
                {(['ai', 'manual', 'none'] as MessageMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => { setMessageMode(m); setErrors({}) }}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${messageMode === m ? 'bg-[#4f46e5] text-white border-[#4f46e5]' : 'bg-white text-[#475569] border-[#e5e7eb] hover:bg-[#f9fafb]'}`}>
                    {m === 'ai'     && <><Sparkles className="w-4 h-4" />AI</>}
                    {m === 'manual' && <><MessageSquare className="w-4 h-4" />Manual</>}
                    {m === 'none'   && <><BellOff className="w-4 h-4" />None</>}
                  </button>
                ))}
              </div>

              {messageMode === 'ai' && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-800">The AI will craft a personalized opening message based on the lead's name, source, and any available context. It will be sent immediately via the best available channel.</p>
                </div>
              )}

              {messageMode === 'none' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <BellOff className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700">No message will be sent. The lead will be activated and the AI will remain ready for future responses.</p>
                </div>
              )}

              {messageMode === 'manual' && (
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
                        <span className="text-xs text-[#94a3b8]">— sent to {fullLead?.phone}</span>
                      </div>
                      <textarea value={smsMessage} onChange={(e) => { setSmsMessage(e.target.value); setErrors((p) => ({ ...p, smsMessage: undefined })) }}
                        rows={4} placeholder={`Hi ${firstName}! This is [Your Name] from [Brokerage]. I'd love to connect about your real estate needs — do you have a few minutes to chat?`}
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
                        <span className="text-xs text-[#94a3b8]">— sent to {fullLead?.email}</span>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">Subject <span className="text-red-500">*</span></label>
                        <input type="text" value={emailSubject} onChange={(e) => { setEmailSubject(e.target.value); setErrors((p) => ({ ...p, emailSubject: undefined })) }}
                          placeholder="e.g. Following up on your real estate inquiry"
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors ${errors.emailSubject ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`} />
                        {errors.emailSubject && <p className="text-xs text-red-600 mt-1">{errors.emailSubject}</p>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#475569] mb-1.5">Body <span className="text-red-500">*</span></label>
                        <textarea value={emailBody} onChange={(e) => { setEmailBody(e.target.value); setErrors((p) => ({ ...p, emailBody: undefined })) }}
                          rows={5} placeholder={`Hi ${firstName},\n\nI came across your inquiry and would love to help with your real estate needs. When would be a good time to connect?\n\nBest,\n[Your Name]`}
                          className={`w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors resize-y leading-relaxed ${errors.emailBody ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb] focus:border-[#4f46e5]'}`}
                          style={{ minHeight: '140px' }} />
                        {errors.emailBody && <p className="text-xs text-red-600 mt-1">{errors.emailBody}</p>}
                      </div>
                    </div>
                  )}

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
          <Button variant="primary" onClick={handleVerify} loading={submitting} disabled={loadingLead || !!loadError} icon={<CheckCircle2 className="w-4 h-4" />}>
            {submitting ? 'Verifying...' : 'Verify Lead'}
          </Button>
        </div>
      </div>
    </div>
  )
}
