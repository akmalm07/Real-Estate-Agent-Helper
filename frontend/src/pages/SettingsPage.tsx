import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import type { ContactType, Preferences } from '../context/AuthContext'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { BACKEND_URL } from '../consts'
import { getInitials } from '../lib/utils'

const options: ContactType[] = ['off', 'email', 'sms']

export function SettingsPage() {
  const { user } = useAuth()
  const contextKey = JSON.stringify([user?.id, user?.newLeadNotify, user?.newMessageReplyNotify, user?.weeklySummeryNotify])
  return <SettingsForm key={contextKey} />
}

function SettingsForm() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [sentEmail, setSentEmail] = useState(false)
  const initials = getInitials(user?.name.trim() || '')
  const [preferences, setPreferences] = useState<Preferences>({
    newLeadNotify: user?.newLeadNotify ?? 'off',
    newMessageReplyNotify: user?.newMessageReplyNotify ?? 'off',
    weeklySummeryNotify: user?.weeklySummeryNotify ?? 'off',
  })

  const handleChangePassword = async () => {
    setPasswordBusy(true)
    setPasswordError('')
    setSentEmail(false)
    try {
      const response = await fetch(`${BACKEND_URL}api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: user?.email }),
      })
      if (!response.ok) throw new Error('Failed to send password reset to email')
      setSentEmail(true)
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Password reset request failed. Please try again.')
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      const response = await fetch(`${BACKEND_URL}api/settings/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      })
      if (!response.ok) throw new Error('Preferences could not be saved. Please try again.')
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Preferences could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="account-workspace space-y-6 max-w-3xl">
      <header>
        <p className="utility-label mb-2">Configure / Account</p>
        <h1 className="account-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and integrations</p>
      </header>
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 shrink-0 rounded-md bg-accent flex items-center justify-center text-primary font-semibold" aria-hidden="true">{initials}</div>
            <div className="min-w-0 break-words"><p className="font-semibold">{user?.name}</p><p className="text-sm text-muted-foreground">{user?.email}</p></div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
        <CardContent>
          <div className="settings-row">
            <div>
              <h2 className="text-sm font-semibold">Google / Gmail</h2>
              <p className="text-sm text-muted-foreground mt-1">Sync emails and enable Google OAuth login</p>
              <p id="google-status" className="text-sm text-caution mt-2">Connection status unavailable</p>
              <p id="google-pending" className="text-sm text-muted-foreground">Connection configuration pending. These controls are not connected.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled aria-describedby="google-status google-pending">Connect</Button>
              <Button variant="secondary" size="sm" disabled aria-describedby="google-status google-pending">Disconnect</Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'newLeadNotify', label: 'New lead notifications', description: 'Get notified when a new lead comes in' },
            { key: 'newMessageReplyNotify', label: 'Message replies', description: 'Get notified when a lead replies' },
            { key: 'weeklySummaryNotify', label: 'Weekly summary', description: 'Receive a weekly performance summary' },
          ].map(({ key, label, description }) => (
            <div key={key} className="settings-row border-b border-border pb-4">
              <div>
                <label htmlFor={`notify-${key}`} className="text-sm font-semibold">{label}</label>
                <p id={`notify-${key}-help`} className="text-sm text-muted-foreground mt-1">{description}</p>
              </div>
              <select id={`notify-${key}`} aria-describedby={`notify-${key}-help`} disabled={saving}
                value={preferences[key as keyof Preferences]}
                onChange={e => { setSaved(false); setPreferences(prev => ({ ...prev, [key]: e.target.value as ContactType })) }}
                className="crm-field settings-select">
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3" aria-busy={saving}>
            <Button size="sm" loading={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save Changes'}</Button>
            {saved && <p role="status" className="text-sm text-primary">Saved!</p>}
          </div>
          {saveError && <p role="alert" className="account-error">{saveError}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="settings-row">
            <div><h2 className="text-sm font-semibold">Sign out</h2><p className="text-sm text-muted-foreground mt-1">Sign out of your RealCRM account</p></div>
            <Button variant="secondary" size="sm" onClick={handleLogout}>Sign Out</Button>
          </div>
          {user?.source === 'manual' && <div className="border-t border-border pt-5">
            <div className="settings-row" aria-busy={passwordBusy}>
              <div><h2 className="text-sm font-semibold">Change Password</h2><p className="text-sm text-muted-foreground mt-1">Request a password reset email</p></div>
              <Button variant="secondary" size="sm" loading={passwordBusy} onClick={handleChangePassword} aria-describedby={passwordError ? 'password-request-error' : undefined}>Change Password</Button>
            </div>
            {passwordError && <p id="password-request-error" role="alert" className="account-error mt-3">{passwordError}</p>}
            {sentEmail && <p role="status" className="mt-3 text-sm text-primary">Email successfully sent! Please check your inbox or spam.</p>}
          </div>}
        </CardContent>
      </Card>
    </div>
  )
}
