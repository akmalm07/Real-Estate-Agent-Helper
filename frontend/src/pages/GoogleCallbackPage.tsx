import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { BACKEND_URL } from '../consts'

/**
 * Handles the redirect from the backend after Google OAuth completes.
 *
 * Flow:
 *   1. Backend redirects here with ?tempToken=...&firstTime=...
 *   2. We POST the tempToken to /auth/google/exchange to get a session cookie.
 *   3. We call refreshUser() to load the user from the new session cookie.
 *   4. We navigate based on firstTime flag.
 */
export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [searchParams] = useSearchParams()
  const firstTime = searchParams.get('firstTime') === 'true'
  const tempToken = searchParams.get('tempToken')
  const ran = useRef(false)

  useEffect(() => {
    // Strict-mode guard — only run once
    if (ran.current) return
    ran.current = true

    async function handleCallback() {
      try {
        if (!tempToken) {
          console.error('No tempToken found in URL')
          navigate('/login', { replace: true })
          return
        }

        // Step 1: Exchange the temp token for a real session cookie.
        const exchangeRes = await fetch(`${BACKEND_URL}auth/google/exchange`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken }),
        })

        if (!exchangeRes.ok) {
          console.error('Exchange failed with status:', exchangeRes.status)
          navigate('/login', { replace: true })
          return
        }

        // Step 2: Now that the cookie is set, load the user.
        // refreshUser() will update the auth context, and App.tsx will
        // route based on user.onboardComplete — so we only need to
        // navigate to /onboard for first-time users. Returning users
        // are routed by App.tsx automatically via onboardComplete.
        const ok = await refreshUser()

        if (!ok) {
          console.error('refreshUser() returned false after successful exchange')
          navigate('/login', { replace: true })
          return
        }

        // Step 3: Navigate based on whether this is a first-time user.
        if (firstTime) {
          navigate('/onboard', { replace: true })
        } else {
          navigate('/dashboard', { replace: true })
        }
      } catch (err) {
        console.error('Google callback error:', err)
        navigate('/login', { replace: true })
      }
    }

    handleCallback()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col items-center justify-center gap-4">
      <div className="w-9 h-9 bg-[#4f46e5] rounded-xl flex items-center justify-center">
        <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
      </div>
      <div className="flex items-center gap-2 text-sm text-[#475569]">
        <svg className="w-4 h-4 animate-spin text-[#4f46e5]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Signing you in…
      </div>
    </div>
  )
}
