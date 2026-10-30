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
import { useDashboardCache } from '../hooks/useDashboardCache'
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

  if (messagesError && messages.length === 0) {
    return <ErrorState message={messagesError} onRetry={reload} />
  }

  return (
    <div className="account-workspace space-y-5">
      <div>
        <p className="utility-label mb-2">Operate / Inbox</p>
        <h1 className="account-title">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {filteredConversations.length} of {allConversations.length} conversations
        </p>
        <p className="text-sm text-muted-foreground mt-1">Unread labels indicate the latest message is inbound, not tracked read status.</p>
      </div>

      <div className="inbox-layout">
        {/* Conversation list */}
        <Card className="inbox-list flex flex-col overflow-hidden">
          <div className="p-3 border-b border-border">
            <label htmlFor="inbox-search" className="crm-field-label">Search conversations</label>
            <Input
              id="inbox-search"
              icon={Search}
              placeholder="Search conversations..."
              value={searchRaw}
              onChange={(e) => setSearchRaw(e.target.value)}
            />
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
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
                  aria-pressed={selectedConv?.id === conv.id}
                  onClick={() => handleSelectConv(conv.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 text-left transition-colors ${
                    selectedConv?.id === conv.id
                      ? 'bg-accent border-l-2 border-primary'
                      : 'hover:bg-muted border-l-2 border-transparent'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
                      <span className="text-xs font-semibold text-primary">
                        {getInitials(conv.leadName)}
                      </span>
                    </div>
                    {conv.unread && (
                      <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-card" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-1 mb-1">
                      <span className={`text-sm break-words ${conv.unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'}`}>
                        <HighlightedText text={conv.leadName} query={search} />
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatRelativeTime(conv.lastMessage.sentAt)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 break-words">
                      <HighlightedText text={conv.lastMessage.body} query={search} />
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {conv.unread && <span className="text-xs font-semibold text-primary">Unread · Latest inbound</span>}
                      <Badge variant={conv.channel === 'sms' ? 'success' : 'default'}>
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
        <Card className="inbox-thread flex flex-col overflow-hidden min-w-0">
          {!selectedConv ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="Select a conversation"
                 description="Choose a conversation to view messages."
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 shrink-0 rounded-md bg-accent flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {getInitials(selectedConv.leadName)}
                  </span>
                </div>
                <div className="min-w-0 break-words">
                  <h2 className="text-base font-semibold text-foreground">{selectedConv.leadName}</h2>
                  <p className="text-sm text-muted-foreground capitalize">
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
                      className={`inbox-message px-4 py-3 rounded-md text-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground border border-border'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">
                        {search ? (
                          <HighlightedText text={msg.body} query={search} />
                        ) : (
                          msg.body
                        )}
                      </p>
                      <p
                        className={`text-xs font-mono mt-2 ${
                          msg.direction === 'outbound' ? 'text-primary-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {formatRelativeTime(msg.sentAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply box */}
              <div className="px-5 py-4 border-t border-border">
                <label htmlFor="inbox-reply" className="crm-field-label">Reply draft</label>
                <div className="flex gap-2">
                  <Textarea
                    id="inbox-reply"
                    aria-describedby="inbox-send-help"
                    placeholder={`Reply via ${selectedConv.channel}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    disabled
                    aria-describedby="inbox-send-help"
                    icon={<Send className="w-3.5 h-3.5" />}
                    className="self-end"
                  >
                    Send
                  </Button>
                </div>
                <p id="inbox-send-help" className="text-sm text-muted-foreground mt-2">Sending is not connected yet. This draft has not been sent.</p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
