import { BACKEND_URL } from '../consts'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // BACKEND_URL is expected to end with '/'. Strip any leading '/' from path
  // so we always produce a well-formed URL regardless of how callers write it.
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  const res = await fetch(`${BACKEND_URL}${cleanPath}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      if (body?.error) detail = `: ${body.error}`
    } catch {
      // ignore parse error
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText}${detail}`)
  }
  return res.json()
}

export const api = {
  getDashboard:  ()             => request<DashboardData>('api/dashboard'),
  getLeads:      ()             => request<Lead[]>('api/leads'),
  getLead:       (id: string)   => request<Lead>(`api/leads/${id}`),
  getProperties: ()             => request<Property[]>('api/properties'),
  getMessages:   ()             => request<Message[]>('api/messages'),

  // Notes are scoped to a lead. The backend exposes them under /api/leads/:id/notes.
  postNote: (body: { leadId: string; content: string }) =>
    request(`api/leads/${body.leadId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ note: body.content }),
    }),

  // Outbound messages. For email, `subject` must be provided by the caller.
  postMessage: (body: { leadId: string; content: string; channel: 'sms' | 'email'; subject?: string }) =>
    request('api/messages', { method: 'POST', body: JSON.stringify(body) }),
}

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  status: 'new' | 'active' | 'cold' | 'unverified' | 'converted' | 'opted_out' | 'ready' | 'archived' | 'pending_deletion'
  source: string
  score: number
  createdAt: string
  updatedAt: string
  propertyInterest?: string
  notes?: Note[]
  messages?: Message[]
}

export interface Property {
  id: string
  address: string
  price: number
  bedrooms: number
  bathrooms: number
  sqft: number
  status: 'open' | 'under_contract' | 'sold'
  source: string
  externalId?: string
  createdAt: string
}

export interface Message {
  id: string
  leadId: string
  leadName?: string
  direction: 'inbound' | 'outbound'
  body: string
  subject?: string | null
  channel: 'sms' | 'email'
  sentAt: string
  conversationId?: string
}

export interface Note {
  id: string
  leadId: string
  // Backend stores the column as `note`; we keep the same name on the frontend.
  note: string
  createdAt: string
}

export interface DashboardData {
  totalLeads: number
  activeLeads: number
  convertedLeads: number
  newLeadsToday: number
  totalProperties: number
  recentActivity: ActivityItem[]
  leadsByStatus: { status: string; count: number }[]
}

export interface ActivityItem {
  id: string
  type: 'lead_created' | 'message_sent' | 'note_added' | 'status_changed' | 'lead_converted'
  description: string
  timestamp: string
  leadName?: string
}
