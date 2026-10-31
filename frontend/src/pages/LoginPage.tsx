import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { useAuth } from '../hooks/useAuth'
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

  const handleGoogleAuth = () => {
    setGoogleLoading(true)
    setLocalError(null)
    try {
      window.location.href = `${BACKEND_URL}auth/google/${mode}`
    } catch {
      setLocalError(`Failed to connect to Google ${mode}.`)
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)
    if (mode === 'signup') {
      if (!name.trim()) { setLocalError('Please enter your full name.'); return }
      if (password !== confirmPassword) { setLocalError('Passwords do not match.'); return }
      if (password.length < 8) { setLocalError('Password must be at least 8 characters.'); return }
    }
    try {
      if (mode === 'signup') await signup(name, email, password)
      else await login(email, password)
    } catch {
      // The existing auth context supplies authError.
    }
  }

  const displayError = localError ?? authError
  const busy = authLoading || googleLoading
  const errorProps = { 'aria-invalid': !!displayError, 'aria-describedby': displayError ? 'auth-error' : undefined }

  return (
    <main className="account-page">
      <div className="account-panel">
        <Link to="/" className="account-wordmark">RealCRM</Link>
        <div className="account-sheet">
          <p className="utility-label">Account / {mode === 'login' ? 'Sign in' : 'Sign up'}</p>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create an account'}</h1>
          <p className="account-description">{mode === 'login' ? 'Sign in to your account to continue.' : 'Get started with RealCRM today.'}</p>
          <div className="account-modes" aria-label="Account access">
            {(['login', 'signup'] as const).map(m => (
              <button key={m} type="button" disabled={busy} aria-pressed={mode === m}
                onClick={() => { setMode(m); setLocalError(null) }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full" onClick={handleGoogleAuth} disabled={busy} loading={googleLoading}>Continue with Google</Button>
          <p className="account-divider">Or continue with email</p>
          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={busy}>
            {mode === 'signup' && <div><label htmlFor="auth-name" className="crm-field-label">Full Name</label><Input id="auth-name" required autoComplete="name" value={name} onChange={e => setName(e.target.value)} disabled={busy} {...errorProps} /></div>}
            <div><label htmlFor="auth-email" className="crm-field-label">Email Address</label><Input id="auth-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} {...errorProps} /></div>
            <div><label htmlFor="auth-password" className="crm-field-label">Password</label><Input id="auth-password" type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} {...errorProps} /></div>
            {mode === 'signup' && <div><label htmlFor="auth-confirm" className="crm-field-label">Confirm Password</label><Input id="auth-confirm" type="password" required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} {...errorProps} /></div>}
            {displayError && <p id="auth-error" role="alert" className="account-error">{displayError}</p>}
            <Button type="submit" className="w-full" disabled={busy} loading={authLoading}>{mode === 'login' ? 'Sign In' : 'Create Account'}</Button>
          </form>
          <p className="account-legal">By continuing, you agree to our <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
        </div>
      </div>
    </main>
  )
}
