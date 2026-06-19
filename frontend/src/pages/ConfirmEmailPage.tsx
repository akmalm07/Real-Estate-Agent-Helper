/*
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Zap, Mail, RefreshCw } from 'lucide-react'
import { BACKEND_URL } from '../consts'
import { useAuth } from '../hooks/useAuth'

export function ConfirmEmailPage() {
  const location = useLocation()
  const { user, refreshUser } = useAuth()

  // Email comes from navigation state (set by LoginPage) or falls back to
  // the current user's email from auth state
  const email: string = (location.state as { email?: string })?.email ?? user?.email ?? ''

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = code.trim()
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Please enter the 6-digit code sent to your email.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/auth/signup/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: Number(trimmed), email }),
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Invalid code. Please try again.')
        return
      }

      // Refresh auth state — App.tsx will automatically route to /onboard
      // once it sees emailConfirmed=true on the user object
      await refreshUser()

    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError(null)
    setSuccess(null)
    setResending(true)
    try {
      const res = await fetch(`${BACKEND_URL}api/auth/signup/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend: true, email }),
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Failed to resend code.')
        return
      }

      setSuccess((data as { message?: string }).message ?? 'Code resent! Check your inbox.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        //{ Logo }
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-[#4f46e5] rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-[#0f172a] tracking-tight">RealCRM</span>
        </div>

        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-card p-8">
          //{ Icon }
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
              <Mail className="w-7 h-7 text-[#4f46e5]" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold text-[#0f172a] mb-1">Check your email</h1>
            <p className="text-sm text-[#94a3b8]">
              We sent a 6-digit confirmation code to{' '}
              {email ? (
                <span className="font-medium text-[#475569]">{email}</span>
              ) : (
                'your email address'
              )}
              . Enter it below to verify your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">
                Confirmation Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 outline-none transition-colors focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff] text-center tracking-widest text-lg"
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                <p className="text-xs text-emerald-700">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-medium hover:bg-[#4338ca] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : null}
              Verify Email
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 text-sm text-[#4f46e5] hover:text-[#4338ca] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resending ? 'Resending…' : 'Resend code'}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          © 2025 RealCRM. All rights reserved.
        </p>
      </div>
    </div>
  )
}
*/