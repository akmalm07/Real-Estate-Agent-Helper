import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { BACKEND_URL } from '../consts'

export type ContactType = 'sms' | 'email' | 'both' | 'off'

interface User {
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

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'logging-in'


interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [authError, setAuthError] = useState<string | null>(null)

  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${BACKEND_URL}api/auth/me`, {
        credentials: 'include',
      })

      if (!res.ok) {
        setUser(null)
        setStatus('unauthenticated')
        return false
      } else {
        console.log("I recived the authentication successfully")
      }

      const data = await res.json()
      setUser(data.user)
      setStatus('authenticated')
      return true
    } catch {
      setUser(null)
      setStatus('unauthenticated')
      return false
    }
  }, [])

  // Check session once on app start
  useEffect(() => {
    validateSession()
  }, [validateSession])

  const login = useCallback(async (email: string, password: string) => {
    setStatus('logging-in')
    setAuthError(null)

    const res = await fetch(`${BACKEND_URL}api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setStatus('unauthenticated')
      const msg = (data as { error?: string }).error ?? 'Login failed'
      setAuthError(msg)
      throw new Error(msg)
    }

    await validateSession()
  }, [validateSession])

  const signup = useCallback(async (name: string, email: string, password: string) => {
    setStatus('logging-in')
    setAuthError(null)

    const res = await fetch(`${BACKEND_URL}api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setStatus('unauthenticated')
      const msg = (data as { error?: string }).error ?? 'Signup failed'
      setAuthError(msg)
      throw new Error(msg)
    }

    await validateSession()
    return { needsConfirmation: true }
  }, [validateSession])

  const logout = useCallback(async () => {
    try {
      await fetch(`${BACKEND_URL}api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: status === 'authenticated',
        initializing: status === 'checking',
        authLoading: status === 'logging-in',
        authError,
        login,
        signup,
        logout,
        refreshUser: validateSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
