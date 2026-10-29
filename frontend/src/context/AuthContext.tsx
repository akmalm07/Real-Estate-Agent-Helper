import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { BACKEND_URL } from '../consts'
import { AuthContext, type AuthStatus, type User } from './auth-context'
export type { ContactType, Preferences } from './auth-context'

async function fetchSession(): Promise<User | null> {
  try {
    const res = await fetch(`${BACKEND_URL}api/auth/me`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    return data.user
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [authError, setAuthError] = useState<string | null>(null)

  const validateSession = useCallback(async (): Promise<boolean> => {
    const sessionUser = await fetchSession()
    setUser(sessionUser)
    setStatus(sessionUser ? 'authenticated' : 'unauthenticated')
    return !!sessionUser
  }, [])

  // Check session once on app start
  useEffect(() => {
    let cancelled = false
    fetchSession().then((sessionUser) => {
      if (cancelled) return
      setUser(sessionUser)
      setStatus(sessionUser ? 'authenticated' : 'unauthenticated')
    })
    return () => { cancelled = true }
  }, [])

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
