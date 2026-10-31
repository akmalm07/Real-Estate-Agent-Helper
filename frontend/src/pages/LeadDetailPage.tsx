import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import type { Lead, Note } from '../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { LeadStatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Input'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  MessageSquare,
  StickyNote,
  Send,
  Clock,
  Star,
  Building2,
} from 'lucide-react'
import { formatDate, formatRelativeTime, getInitials } from '../lib/utils'
import { api } from '../services/api'
import { BACKEND_URL } from '../consts'

// Backend message shape (from GET /api/leads/:id) is similar to the shared
// Message interface but lacks leadName. We type the raw row locally so we
// don't depend on optional fields that aren't always present.
export interface LeadDetailMessage {
  id: number
  conversationId: number
  direction: 'inbound' | 'outbound'
  body: string | null
  channel: 'sms' | 'email'
  sentAt: string | null
  subject?: string | null
}

interface LeadDetail extends Omit<Lead, 'messages'> {
  notes?: Note[]
  messages?: LeadDetailMessage[]
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, loading, error, refetch } = useApi<LeadDetail>(`${BACKEND_URL}api/leads/${id}`)

  const [noteText, setNoteText]           = useState('')
  const [messageText, setMessageText]     = useState('')
  const [messageChannel, setMessageChannel] = useState<'sms' | 'email'>('sms')
  const [messageSubject, setMessageSubject] = useState('')
  const [submittingNote, setSubmittingNote]       = useState(false)
  const [submittingMessage, setSubmittingMessage] = useState(false)
  const [actionError, setActionError]             = useState<string | null>(null)
  const [activeTab, setActiveTab]                 = useState<'messages' | 'notes'>('messages')

  // No mock fallback — if the API errors, we render an error state.
  const lead = data

  const handleAddNote = async () => {
    if (!noteText.trim() || !id) return
    setSubmittingNote(true)
    setActionError(null)
    try {
      await api.postNote({ leadId: id, content: noteText.trim() })
      setNoteText('')
      refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note.')
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || !id) return
    if (messageChannel === 'email' && !messageSubject.trim()) {
      setActionError('Subject is required when sending email.')
      return
    }
    setSubmittingMessage(true)
    setActionError(null)
    try {
      await api.postMessage({
        leadId: id,
        content: messageText.trim(),
        channel: messageChannel,
        subject: messageChannel === 'email' ? messageSubject.trim() : undefined,
      })
      setMessageText('')
      setMessageSubject('')
      refetch()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send message.')
    } finally {
      setSubmittingMessage(false)
    }
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="crm-workspace space-y-4">
      {/* Back */}
      <button
        onClick={() => navigate('/leads')}
        className="flex items-center gap-1.5 text-sm text-primary hover:underline transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </button>

      {/* Lead header */}
      <Card>
        <CardContent className="p-5">
          {loading || !lead ? (
            <div className="flex items-center gap-4">
              <Skeleton className="w-14 h-14 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div aria-hidden="true" className="w-11 h-11 rounded-md bg-accent flex items-center justify-center flex-shrink-0">
                <span className="text-base font-semibold text-primary">
                  {getInitials(lead.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="crm-page-title">{lead.name}</h1>
                  <LeadStatusBadge status={lead.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {lead.email && (
                    <span className="inline-block min-w-0">
                      <Mail aria-hidden="true" className="inline w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                      {lead.email}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="inline-block min-w-0">
                      <Phone aria-hidden="true" className="inline w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                      {lead.phone}
                    </span>
                  )}
                  {lead.source && (
                    <span className="inline-block min-w-0">
                      <MapPin aria-hidden="true" className="inline w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                      {lead.source}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Star aria-hidden="true" className="w-3.5 h-3.5 text-caution" />
                    <span className="text-lg font-semibold text-foreground">{lead.score ?? 0}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Score</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {actionError && (
        <div id="lead-action-error" role="alert" className="bg-destructive-subtle border border-destructive rounded-lg px-4 py-3 text-sm text-destructive">
          {actionError}
        </div>
      )}

      <div className="crm-inspect-grid">
        {/* Left: Messages + Notes */}
        <div className="min-w-0 space-y-4">
          {/* Tabs */}
          <div role="group" aria-label="Lead workspace" className="flex flex-wrap gap-1 bg-muted border border-border rounded-md p-1 w-fit">
            {(['messages', 'notes'] as const).map((tab) => (
              <button
                key={tab}
                aria-pressed={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? 'bg-card text-primary shadow-card'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'messages' ? <MessageSquare className="w-3.5 h-3.5" /> : <StickyNote className="w-3.5 h-3.5" />}
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'messages' && (
            <Card>
              <CardHeader>
                <CardTitle>Conversation</CardTitle>
              </CardHeader>
              <div className="px-5 py-4 space-y-3 max-h-80 overflow-y-auto scrollbar-thin">
                {loading || !lead ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
                        <Skeleton className={`h-12 rounded-xl ${i % 2 === 0 ? 'w-64' : 'w-48'}`} />
                      </div>
                    ))}
                  </div>
                ) : (lead.messages ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8">No messages yet</p>
                ) : (
                  (lead.messages ?? []).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`min-w-0 max-w-[90%] sm:max-w-[80%] px-3.5 py-2.5 rounded-lg text-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-foreground border border-border'
                        }`}
                      >
                        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                          {msg.channel === 'sms' ? (
                            <Phone aria-hidden="true" className="inline mr-1 w-3 h-3 text-current" />
                          ) : (
                            <Mail aria-hidden="true" className="inline mr-1 w-3 h-3 text-current" />
                          )}
                          {msg.body}
                        </p>
                        <p
                          className={`text-xs mt-1 ${
                            msg.direction === 'outbound' ? 'text-primary-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {msg.sentAt && formatRelativeTime(msg.sentAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 pb-4 pt-3 border-t border-border space-y-3">
                {/* Channel picker — limited to channels the lead actually supports. */}
                <div role="group" aria-label="Message channel" className="flex flex-wrap gap-2">
                  {lead?.phone && (
                    <button
                      type="button"
                      aria-pressed={messageChannel === 'sms'}
                      onClick={() => setMessageChannel('sms')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        messageChannel === 'sms'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-input hover:bg-accent'
                      }`}
                    >
                      <Phone className="w-3 h-3" /> SMS
                    </button>
                  )}
                  {lead?.email && (
                    <button
                      type="button"
                      aria-pressed={messageChannel === 'email'}
                      onClick={() => setMessageChannel('email')}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        messageChannel === 'email'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-input hover:bg-accent'
                      }`}
                    >
                      <Mail className="w-3 h-3" /> Email
                    </button>
                  )}
                </div>

                {messageChannel === 'email' && (
                  <label className="crm-field-label">
                    Subject
                  <input
                    aria-describedby={actionError ? 'lead-action-error' : undefined}
                    type="text"
                    placeholder="Subject"
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm border border-input bg-card text-foreground rounded-md"
                  />
                  </label>
                )}

                <label htmlFor="detail-message" className="crm-field-label">Message</label>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <Textarea
                    id="detail-message"
                    aria-describedby={actionError ? 'lead-action-error' : undefined}
                    placeholder={`Type a ${messageChannel} message...`}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={2}
                    className="flex-1 min-w-0"
                  />
                  <Button
                    size="sm"
                    loading={submittingMessage}
                    onClick={handleSendMessage}
                    icon={<Send className="w-3.5 h-3.5" />}
                    className="self-end"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'notes' && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <div className="px-5 py-4 space-y-3">
                {loading || !lead ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="p-3 bg-background rounded-lg space-y-2">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    ))}
                  </div>
                ) : (lead.notes ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">No notes yet</p>
                ) : (
                  (lead.notes ?? []).map((note) => (
                    <div key={note.id} className="p-3.5 bg-background rounded-md border border-border">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.note}</p>
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(note.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 pb-4 pt-3 border-t border-border">
                <label htmlFor="detail-note" className="crm-field-label">New note</label>
                <Textarea
                  id="detail-note"
                  aria-describedby={actionError ? 'lead-action-error' : undefined}
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  className="mb-2"
                />
                <Button
                  size="sm"
                  loading={submittingNote}
                  onClick={handleAddNote}
                  icon={<StickyNote className="w-3.5 h-3.5" />}
                >
                  Add Note
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Details */}
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading || !lead ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex justify-between">
                      <Skeleton className="h-3.5 w-20" />
                      <Skeleton className="h-3.5 w-28" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {[
                    { label: 'Source', value: lead.source ?? '—' },
                    { label: 'Status', value: <LeadStatusBadge status={lead.status} /> },
                    { label: 'Score', value: `${lead.score ?? 0}/100` },
                    { label: 'Created', value: lead.createdAt ? formatDate(lead.createdAt) : '—' },
                    { label: 'Updated', value: lead.updatedAt ? formatRelativeTime(lead.updatedAt) : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-wrap gap-2 items-center justify-between py-2 border-b border-border last:border-0">
                      <span className="text-xs text-muted-foreground font-medium">{label}</span>
                      <span className="text-sm text-foreground min-w-0">{value}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {lead?.propertyInterest && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  Property Interest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{lead.propertyInterest}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
