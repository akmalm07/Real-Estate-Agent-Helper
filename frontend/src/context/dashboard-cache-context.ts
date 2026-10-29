import { createContext } from 'react'
import type { RawDashboardData } from '../lib/dashboardTransformer'
import type { Property, Message } from '../services/api'

interface DashboardCacheContextValue {
  cache: RawDashboardData | null
  cachedAt: number | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  properties: Property[]
  propertiesLoading: boolean
  propertiesError: string | null
  messages: Message[]
  messagesLoading: boolean
  messagesError: string | null
  addProperty: (property: Property) => void
  updateProperty: (property: Property) => void
  removeProperty: (id: string | number) => void
  addLead: (lead: RawDashboardData['leads'][number]) => void
  updateLead: (lead: RawDashboardData['leads'][number]) => void
  removeLead: (id: number) => void
}

export const DashboardCacheContext = createContext<DashboardCacheContextValue>({
  cache: null,
  cachedAt: null,
  loading: true,
  error: null,
  reload: async () => {},
  properties: [],
  propertiesLoading: true,
  propertiesError: null,
  messages: [],
  messagesLoading: true,
  messagesError: null,
  addProperty: () => {},
  updateProperty: () => {},
  removeProperty: () => {},
  addLead: () => {},
  updateLead: () => {},
  removeLead: () => {},
})
