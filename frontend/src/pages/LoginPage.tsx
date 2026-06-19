import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { BACKEND_URL } from '../consts'

export function LoginPage() {
  const { login, signup, authError, authLoading, isAuthenticated, user } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Once auth state updates, navigate to the correct page.
  // This is the single place that decides where to send the user.
  useEffect(() => {
    if (!isAuthenticated || !user) return

    if (user.source === 'manual' && !user.emailConfirmed) {
      navigate('/confirm-email', { replace: true, state: { email: user.email } })
    } else if (!user.onboardComplete) {
      navigate('/onboard', { replace: true })
    } else {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  const handleGoogleAuth = async (authMode: 'login' | 'signup') => {
    setGoogleLoading(true)
    setLocalError(null)

    const endpoint = authMode === 'login' ? 'login' : 'signup'

    try {
        window.location.href = `${BACKEND_URL}auth/google/${endpoint}`
    } catch {
      setLocalError(`Failed to connect to Google ${authMode}.`)
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (mode === 'signup') {
      if (!name.trim()) {
        setLocalError('Please enter your full name.')
        return
      }
      if (password !== confirmPassword) {
        setLocalError('Passwords do not match.')
        return
      }
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters.')
        return
      }
      try {
        await signup(name, email, password)
        // No navigate() here — useEffect above handles it once user state updates
      } catch {
        // authError is set inside useAuth — displayed below
      }
    } else {
      try {
        await login(email, password)
        // No navigate() here — useEffect above handles it once user state updates
      } catch {
        // authError is set inside useAuth
      }
    }
  }

  const displayError = localError ?? authError

  return (
    <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-9 h-9 bg-[#4f46e5] rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-semibold text-[#0f172a] tracking-tight">RealCRM</span>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#e5e7eb] rounded-xl shadow-card p-8">
          <div className="text-center mb-6">
            <h1 className="text-lg font-semibold text-[#0f172a] mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-sm text-[#94a3b8]">
              {mode === 'login'
                ? 'Sign in to your account to continue'
                : 'Get started with RealCRM today'}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg p-1 mb-6">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setLocalError(null)
                }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  mode === m
                    ? 'bg-white text-[#0f172a] shadow-sm'
                    : 'text-[#475569] hover:text-[#0f172a]'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Google OAuth button */}
          <button
            type="button"
            onClick={() => handleGoogleAuth(mode)}
            disabled={googleLoading}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-[#e5e7eb] rounded-lg text-sm font-medium text-[#0f172a] hover:bg-[#f9fafb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <svg className="w-4 h-4 animate-spin text-[#4f46e5]" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e5e7eb]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-[#94a3b8]">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Johnson"
                  className="w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 outline-none transition-colors focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Email Address</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 outline-none transition-colors focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-[#475569] mb-1.5">Password</label>
              <input
                type="password"
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 outline-none transition-colors focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]"
              />
            </div>

            {/* Confirm Password — signup only */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-[#475569] mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8] px-3 py-2 outline-none transition-colors focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]"
                />
              </div>
            )}

            {/* Error */}
            {displayError && (
              <div className="px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
                <p className="text-xs text-red-600">{displayError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4f46e5] text-white rounded-lg text-sm font-medium hover:bg-[#4338ca] transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : null}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-[#e5e7eb]">
            <p className="text-xs text-center text-[#94a3b8]">
              By continuing, you agree to our{' '}
              <a href="#" className="text-[#4f46e5] hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-[#4f46e5] hover:underline">Privacy Policy</a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          © 2025 RealCRM. All rights reserved.
        </p>
      </div>
    </div>
  )
}
