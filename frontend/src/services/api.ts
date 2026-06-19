const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
  return res.json()
}

export const api = {
  getDashboard: () => request<DashboardData>('/api/dashboard'),
  getLeads: () => request<Lead[]>('/api/leads'),
  getLead: (id: string) => request<Lead>(`/api/leads/${id}`),
  getProperties: () => request<Property[]>('/api/properties'),
  getMessages: () => request<Message[]>('/api/messages'),
  postNote: (body: { leadId: string; content: string }) =>
    request('/api/notes', { method: 'POST', body: JSON.stringify(body) }),
  postMessage: (body: { leadId: string; content: string; channel: string }) =>
    request('/api/messages', { method: 'POST', body: JSON.stringify(body) }),
}

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  status: 'new' | 'active' | 'cold' | 'converted' | 'opted_out'
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
  channel: 'sms' | 'email'
  sentAt: string
  conversationId?: string
}

export interface Note {
  id: string
  leadId: string
  content: string
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
