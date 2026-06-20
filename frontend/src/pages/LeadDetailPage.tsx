import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import type { Lead } from '../services/api'
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

const MOCK_LEAD: Lead = {
  id: '1',
  name: 'Sarah Mitchell',
  email: 'sarah@example.com',
  phone: '+1 555-0101',
  status: 'active',
  source: 'Zillow',
  score: 82,
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  updatedAt: new Date(Date.now() - 3600000).toISOString(),
  propertyInterest: '3BR in Austin, TX — Budget $450k',
  notes: [
    { id: 'n1', leadId: '1', content: 'Pre-approved for $480k. Looking to close within 60 days.', createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 'n2', leadId: '1', content: 'Prefers east side of Austin. Has two kids, needs good school district.', createdAt: new Date(Date.now() - 86400000).toISOString() },
  ],
  messages: [
    { id: 'm1', leadId: '1', direction: 'inbound', body: 'Hi, I saw the listing on Zillow and I\'m interested in scheduling a tour.', channel: 'sms', sentAt: new Date(Date.now() - 172800000).toISOString() },
    { id: 'm2', leadId: '1', direction: 'outbound', body: 'Hi Sarah! Thanks for reaching out. I\'d love to set up a tour. Are you available this weekend?', channel: 'sms', sentAt: new Date(Date.now() - 169200000).toISOString() },
    { id: 'm3', leadId: '1', direction: 'inbound', body: 'Saturday afternoon works great for me!', channel: 'sms', sentAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'm4', leadId: '1', direction: 'outbound', body: 'Perfect! I\'ll send you the address. See you Saturday at 2pm.', channel: 'sms', sentAt: new Date(Date.now() - 82800000).toISOString() },
  ],
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, loading, error, refetch } = useApi<Lead>(`${BACKEND_URL}api/leads/${id}`)
  const [noteText, setNoteText] = useState('')
  const [messageText, setMessageText] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [submittingMessage, setSubmittingMessage] = useState(false)
  const [activeTab, setActiveTab] = useState<'messages' | 'notes'>('messages')

  const lead = data ?? MOCK_LEAD

  const handleAddNote = async () => {
    if (!noteText.trim() || !id) return
    setSubmittingNote(true)
    try {
      await api.postNote({ leadId: id, content: noteText })
      setNoteText('')
      refetch()
    } catch {
      // handle error
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleSendMessage = async () => {
    if (!messageText.trim() || !id) return
    setSubmittingMessage(true)
    try {
      await api.postMessage({ leadId: id, content: messageText, channel: 'sms' })
      setMessageText('')
      refetch()
    } catch {
      // handle error
    } finally {
      setSubmittingMessage(false)
    }
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/leads')}
        className="flex items-center gap-1.5 text-sm text-[#475569] hover:text-[#0f172a] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Leads
      </button>

      {/* Lead header */}
      <Card>
        <CardContent className="p-5">
          {loading ? (
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
              <div className="w-14 h-14 rounded-full bg-[#eef2ff] flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-semibold text-[#4f46e5]">
                  {getInitials(lead.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-[#0f172a]">{lead.name}</h2>
                  <LeadStatusBadge status={lead.status} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#475569]">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {lead.email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {lead.phone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#94a3b8]" />
                    {lead.source}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-lg font-semibold text-[#0f172a]">{lead.score}</span>
                  </div>
                  <p className="text-xs text-[#94a3b8]">Score</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Messages + Notes */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-1 w-fit">
            {(['messages', 'notes'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? 'bg-white text-[#0f172a] shadow-card'
                    : 'text-[#475569] hover:text-[#0f172a]'
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
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={`flex ${i % 2 === 0 ? '' : 'justify-end'}`}>
                        <Skeleton className={`h-12 rounded-xl ${i % 2 === 0 ? 'w-64' : 'w-48'}`} />
                      </div>
                    ))}
                  </div>
                ) : (lead.messages ?? []).length === 0 ? (
                  <p className="text-sm text-[#94a3b8] text-center py-8">No messages yet</p>
                ) : (
                  (lead.messages ?? []).map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] px-3.5 py-2.5 rounded-xl text-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-[#4f46e5] text-white'
                            : 'bg-[#f9fafb] text-[#0f172a] border border-[#e5e7eb]'
                        }`}
                      >
                        <p className="flex items-center gap-1">
                          {msg.channel === 'sms' ? (
                            <Phone className="w-3 h-3 text-current" />
                          ) : (
                            <Mail className="w-3 h-3 text-current" />
                          )}
                          {msg.body}
                        </p>
                        <p
                          className={`text-[10px] mt-1 ${
                            msg.direction === 'outbound' ? 'text-indigo-200' : 'text-[#94a3b8]'
                          }`}
                        >
                          {formatRelativeTime(msg.sentAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 pb-4 pt-2 border-t border-[#e5e7eb]">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    rows={2}
                    className="flex-1"
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
                {loading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="p-3 bg-[#f9fafb] rounded-lg space-y-2">
                        <Skeleton className="h-3.5 w-full" />
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    ))}
                  </div>
                ) : (lead.notes ?? []).length === 0 ? (
                  <p className="text-sm text-[#94a3b8] text-center py-4">No notes yet</p>
                ) : (
                  (lead.notes ?? []).map((note) => (
                    <div key={note.id} className="p-3.5 bg-[#f9fafb] rounded-lg border border-[#e5e7eb]">
                      <p className="text-sm text-[#0f172a]">{note.content}</p>
                      <p className="text-xs text-[#94a3b8] mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(note.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 pb-4 pt-2 border-t border-[#e5e7eb]">
                <Textarea
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
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
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
                    { label: 'Source', value: lead.source },
                    { label: 'Status', value: <LeadStatusBadge status={lead.status} /> },
                    { label: 'Score', value: `${lead.score}/100` },
                    { label: 'Created', value: formatDate(lead.createdAt) },
                    { label: 'Updated', value: formatRelativeTime(lead.updatedAt) },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between py-1 border-b border-[#f1f5f9] last:border-0">
                      <span className="text-xs text-[#94a3b8] font-medium">{label}</span>
                      <span className="text-sm text-[#0f172a]">{value}</span>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {lead.propertyInterest && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#94a3b8]" />
                  Property Interest
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#475569]">{lead.propertyInterest}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
