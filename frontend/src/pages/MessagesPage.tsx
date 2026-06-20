import { useState, useMemo, useCallback } from 'react'
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
import { useDashboardCache } from '../context/DashboardCacheContext'
import { searchAndRank, getHighlightSegments, useDebounce } from '../lib/searchUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Conversation {
  id: string
  leadId: string
  leadName: string
  lastMessage: Message
  messages: Message[]
  channel: 'sms' | 'email'
  unread: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupIntoConversations(messages: Message[]): Conversation[] {
  const convMap = new Map<string, Message[]>()
  for (const msg of messages) {
    const key = msg.conversationId ?? msg.leadId
    if (!convMap.has(key)) convMap.set(key, [])
    convMap.get(key)!.push(msg)
  }
  return Array.from(convMap.entries())
    .map(([id, msgs]) => {
      const sorted = [...msgs].sort(
        (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      )
      const last = sorted[0]
      return {
        id,
        leadId:      last.leadId,
        leadName:    last.leadName ?? 'Unknown',
        lastMessage: last,
        messages:    sorted.reverse(),
        channel:     last.channel,
        unread:      last.direction === 'inbound',
      }
    })
    .sort(
      (a, b) =>
        new Date(b.lastMessage.sentAt).getTime() - new Date(a.lastMessage.sentAt).getTime()
    )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = getHighlightSegments(text, query)
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MessagesPage() {
  const { messages, messagesLoading, messagesError, reload } = useDashboardCache()

  const [searchRaw, setSearchRaw]           = useState('')
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [replyText, setReplyText]           = useState('')
  const [sending, setSending]               = useState(false)

  const search = useDebounce(searchRaw, 200)

  // ── Group all messages into conversations (memoized) ─────────────────────
  const allConversations = useMemo(() => groupIntoConversations(messages), [messages])

  // ── Filter conversations by search ────────────────────────────────────────
  const filteredConversations = useMemo(() => {
    return searchAndRank(allConversations, search, (conv) => [
      // Primary: lead name
      conv.leadName,
      // Secondary: content of all messages in the conversation
      ...conv.messages.map((m) => m.body),
    ])
  }, [allConversations, search])

  // ── Selected conversation ─────────────────────────────────────────────────
  const selectedConv = useMemo(() => {
    if (selectedConvId) {
      const found = filteredConversations.find((c) => c.id === selectedConvId)
      if (found) return found
    }
    return filteredConversations[0] ?? null
  }, [filteredConversations, selectedConvId])

  const handleSelectConv = useCallback((id: string) => {
    setSelectedConvId(id)
    setReplyText('')
  }, [])

  const handleSend = useCallback(async () => {
    if (!replyText.trim() || !selectedConv) return
    setSending(true)
    try {
      // Placeholder — backend integration to be added later
      await new Promise((r) => setTimeout(r, 500))
      setReplyText('')
    } finally {
      setSending(false)
    }
  }, [replyText, selectedConv])

  if (messagesError && messages.length === 0) {
    return <ErrorState message={messagesError} onRetry={reload} />
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-[#0f172a]">Messages</h2>
        <p className="text-sm text-[#94a3b8] mt-0.5">
          {filteredConversations.length} of {allConversations.length} conversations
        </p>
      </div>

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Conversation list */}
        <Card className="w-72 flex-shrink-0 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[#e5e7eb]">
            <Input
              icon={Search}
              placeholder="Search conversations..."
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-[#e5e7eb]">
            {messagesLoading ? (
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
            ) : filteredConversations.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No conversations"
                description={search ? 'No matches found.' : 'No messages yet.'}
              />
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConv(conv.id)}
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
                        <HighlightedText text={conv.leadName} query={search} />
                      </span>
                      <span className="text-[10px] text-[#94a3b8] flex-shrink-0 ml-1">
                        {formatRelativeTime(conv.lastMessage.sentAt)}
                      </span>
                    </div>
                    <p className="text-xs text-[#94a3b8] truncate">
                      <HighlightedText text={conv.lastMessage.body} query={search} />
                    </p>
                    <div className="mt-1">
                      <Badge variant={conv.channel === 'sms' ? 'indigo' : 'default'}>
                        {conv.channel === 'sms' ? (
                          <span className="flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5" />SMS
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5" />Email
                          </span>
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
                  <p className="text-xs text-[#94a3b8] capitalize">
                    {selectedConv.channel} conversation
                  </p>
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
                      <p>
                        {search ? (
                          <HighlightedText text={msg.body} query={search} />
                        ) : (
                          msg.body
                        )}
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
