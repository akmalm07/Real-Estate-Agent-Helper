import { useState, useMemo } from 'react'
import { useApi } from '../hooks/useApi'
import type { Message } from '../services/api'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorState } from '../components/ui/ErrorState'
import { EmptyState } from '../components/ui/EmptyState'
import { Search, MessageSquare, Send, Mail, Phone } from 'lucide-react'
import { formatRelativeTime, getInitials } from '../lib/utils'
import { BACKEND_URL } from '../consts'

const MOCK_MESSAGES: Message[] = [
  { id: 'm1', leadId: '1', leadName: 'Sarah Mitchell', direction: 'inbound', body: 'Hi, I saw the listing on Zillow and I\'m interested in scheduling a tour.', channel: 'sms', sentAt: new Date(Date.now() - 172800000).toISOString(), conversationId: 'c1' },
  { id: 'm2', leadId: '1', leadName: 'Sarah Mitchell', direction: 'outbound', body: 'Hi Sarah! Thanks for reaching out. I\'d love to set up a tour. Are you available this weekend?', channel: 'sms', sentAt: new Date(Date.now() - 169200000).toISOString(), conversationId: 'c1' },
  { id: 'm3', leadId: '1', leadName: 'Sarah Mitchell', direction: 'inbound', body: 'Saturday afternoon works great for me!', channel: 'sms', sentAt: new Date(Date.now() - 86400000).toISOString(), conversationId: 'c1' },
  { id: 'm4', leadId: '2', leadName: 'James Carter', direction: 'inbound', body: 'Hello, I have a question about the property on Maple Ave.', channel: 'email', sentAt: new Date(Date.now() - 3600000).toISOString(), conversationId: 'c2' },
  { id: 'm5', leadId: '2', leadName: 'James Carter', direction: 'outbound', body: 'Hi James! Happy to help. What would you like to know?', channel: 'email', sentAt: new Date(Date.now() - 1800000).toISOString(), conversationId: 'c2' },
  { id: 'm6', leadId: '3', leadName: 'Emily Torres', direction: 'inbound', body: 'We\'re ready to make an offer on the Cedar Lane property!', channel: 'sms', sentAt: new Date(Date.now() - 900000).toISOString(), conversationId: 'c3' },
  { id: 'm7', leadId: '4', leadName: 'Robert Kim', direction: 'inbound', body: 'Can you send me more details about the investment properties?', channel: 'email', sentAt: new Date(Date.now() - 7200000).toISOString(), conversationId: 'c4' },
]

interface Conversation {
  id: string
  leadId: string
  leadName: string
  lastMessage: Message
  messages: Message[]
  channel: 'sms' | 'email'
  unread: boolean
}

function groupIntoConversations(messages: Message[]): Conversation[] {
  const convMap = new Map<string, Message[]>()
  for (const msg of messages) {
    const key = msg.conversationId ?? msg.leadId
    if (!convMap.has(key)) convMap.set(key, [])
    convMap.get(key)!.push(msg)
  }
  return Array.from(convMap.entries()).map(([id, msgs]) => {
    const sorted = [...msgs].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    const last = sorted[0]
    return {
      id,
      leadId: last.leadId,
      leadName: last.leadName ?? 'Unknown',
      lastMessage: last,
      messages: sorted.reverse(),
      channel: last.channel,
      unread: last.direction === 'inbound',
    }
  }).sort((a, b) => new Date(b.lastMessage.sentAt).getTime() - new Date(a.lastMessage.sentAt).getTime())
}

export function MessagesPage() {
  const { data, loading, error, refetch } = useApi<Message[]>(`${BACKEND_URL}api/messages`)
  const [search, setSearch] = useState('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const messages = data ?? MOCK_MESSAGES
  const conversations = useMemo(() => groupIntoConversations(messages), [messages])

  const filtered = conversations.filter(
    (c) => !search || c.leadName.toLowerCase().includes(search.toLowerCase())
  )

  const selectedConv = filtered.find((c) => c.id === selectedConvId) ?? filtered[0] ?? null

  const handleSend = async () => {
    if (!replyText.trim() || !selectedConv) return
    setSending(true)
    try {
      await new Promise((r) => setTimeout(r, 500))
      setReplyText('')
    } finally {
      setSending(false)
    }
  }

  if (error && !data) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#0f172a]">Messages</h2>
        <p className="text-sm text-[#94a3b8] mt-0.5">{conversations.length} conversations</p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Conversation list */}
        <Card className="w-72 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#e5e7eb]">
            <Input
              icon={Search}
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-[#e5e7eb]">
            {loading ? (
              <div className="p-3 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations"
                description="No messages yet."
              />
            ) : (
              filtered.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-colors ${
                    selectedConv?.id === conv.id
                      ? 'bg-[#eef2ff]'
                      : 'hover:bg-[#f9fafb]'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-full bg-[#eef2ff] flex items-center justify-center">
                      <span className="text-xs font-semibold text-[#4f46e5]">
                        {getInitials(conv.leadName)}
                      </span>
                    </div>
                    {conv.unread && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#4f46e5] rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`text-sm truncate ${conv.unread ? 'font-semibold text-[#0f172a]' : 'font-medium text-[#475569]'}`}>
                        {conv.leadName}
                      </span>
                      <span className="text-[10px] text-[#94a3b8] flex-shrink-0 ml-1">
                        {formatRelativeTime(conv.lastMessage.sentAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8] truncate">{conv.lastMessage.body}</p>
                    <div className="mt-1">
                      <Badge variant={conv.channel === 'sms' ? 'indigo' : 'default'}>
                        {conv.channel === 'sms' ? (
                          <span className="flex items-center gap-1"><Phone className="w-2.5 h-2.5" />SMS</span>
                        ) : (
                          <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5" />Email</span>
                        )}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Message thread */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                description="Choose a conversation from the left to view messages."
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-3.5 border-b border-[#e5e7eb] flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#eef2ff] flex items-center justify-center">
                  <span className="text-xs font-semibold text-[#4f46e5]">
                    {getInitials(selectedConv.leadName)}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0f172a]">{selectedConv.leadName}</p>
                  <p className="text-xs text-[#94a3b8] capitalize">{selectedConv.channel} conversation</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
                {selectedConv.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2.5 rounded-xl text-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-[#4f46e5] text-white'
                          : 'bg-[#f9fafb] text-[#0f172a] border border-[#e5e7eb]'
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          msg.direction === 'outbound' ? 'text-indigo-200' : 'text-[#94a3b8]'
                        }`}
                      >
                        {formatRelativeTime(msg.sentAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div className="px-5 py-3 border-t border-[#e5e7eb]">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={`Reply via ${selectedConv.channel}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
                    }}
                  />
                  <Button
                    size="sm"
                    loading={sending}
                    onClick={handleSend}
                    icon={<Send className="w-3.5 h-3.5" />}
                    className="self-end"
                  >
                    Send
                  </Button>
                </div>
                <p className="text-[10px] text-[#94a3b8] mt-1.5">⌘ + Enter to send</p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
