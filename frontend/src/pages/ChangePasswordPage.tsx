import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { BACKEND_URL } from '../consts'

export function ChangePasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const changePassword = searchParams.get('changePassword')
  return <ChangePasswordForm key={JSON.stringify([token, changePassword])} token={token} changePassword={changePassword} />
}

function ChangePasswordForm({ token, changePassword }: { token: string | null; changePassword: string | null }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const isValidLink = !!token && changePassword === 'true'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    if (newPassword.length < 8) { setErrorMessage('Password must be at least 8 characters long.'); return }
    if (newPassword !== confirmPassword) { setErrorMessage('Passwords do not match.'); return }
    setStatus('loading')
    try {
      const res = await fetch(`${BACKEND_URL}api/auth/change-password/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.error ?? 'Something went wrong. Please try again.')
        setStatus('error')
        return
      }
      setStatus('success')
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.')
      setStatus('error')
    }
  }

  const busy = status === 'loading'
  const errorProps = { 'aria-invalid': !!errorMessage, 'aria-describedby': errorMessage ? 'reset-error' : undefined }
  return (
    <main className="account-page">
      <div className="account-panel">
        <Link to="/" className="account-wordmark">RealCRM</Link>
        <div className="account-sheet">
          <p className="utility-label">Account / Password</p>
          {status === 'success' ? <>
            <h1>Password Changed!</h1>
            <p className="account-description" role="status">Your password has been updated successfully. You can now log in with your new password.</p>
            <Link className="journal-primary-link" to="/login">Go to Login</Link>
          </> : !isValidLink ? <>
            <h1>Invalid Reset Link</h1>
            <p className="account-description">This password reset link is invalid or has expired. Please request a new one from the login page.</p>
            <Link className="journal-primary-link" to="/login">Back to Login</Link>
          </> : <>
            <h1>Set New Password</h1>
            <p className="account-description">Enter your new password below.</p>
            <form onSubmit={handleSubmit} className="space-y-5" aria-busy={busy}>
              <div><label htmlFor="newPassword" className="crm-field-label">New Password</label><Input id="newPassword" type="password" autoComplete="new-password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} disabled={busy} {...errorProps} /></div>
              <div><label htmlFor="confirmPassword" className="crm-field-label">Confirm New Password</label><Input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={busy} {...errorProps} /></div>
              {errorMessage && <p id="reset-error" role="alert" className="account-error">{errorMessage}</p>}
              <Button type="submit" className="w-full" disabled={busy} loading={busy}>{busy ? 'Updating Password…' : 'Set New Password'}</Button>
            </form>
          </>}
        </div>
      </div>
    </main>
  )
}
