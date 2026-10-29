import { createContext } from 'react'

export type ContactType = 'sms' | 'email' | 'both' | 'off'

export interface User {
  id: string
  email: string
  name: string
  source: string
  emailConfirmed: boolean
  onboardComplete: boolean
  newLeadNotify: ContactType
  newMessageReplyNotify: ContactType
  weeklySummeryNotify: ContactType
}

export interface Preferences {
  newLeadNotify: ContactType
  newMessageReplyNotify: ContactType
  weeklySummeryNotify: ContactType
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'logging-in'

export interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  initializing: boolean
  authLoading: boolean
  authError: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  logout: () => Promise<void>
  refreshUser: () => Promise<boolean>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
