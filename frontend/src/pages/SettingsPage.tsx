import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import type { ContactType, Preferences } from '../context/AuthContext'
import {
  Chrome,
  Bell,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { BACKEND_URL } from '../consts'

interface IntegrationCardProps {
  icon: React.ReactNode
  title: string
  description: string
  connected: boolean
  onConnect: () => void
  onDisconnect: () => void
}

function IntegrationCard({ icon, title, description, connected, onConnect, onDisconnect }: IntegrationCardProps) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-[#f1f5f9] last:border-0">
      <div className="w-10 h-10 rounded-xl bg-[#f9fafb] border border-[#e5e7eb] flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-[#0f172a]">{title}</p>
          {connected ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="w-3 h-3" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-[#94a3b8]">
              <AlertCircle className="w-3 h-3" />
              Not connected
            </span>
          )}
        </div>
        <p className="text-xs text-[#94a3b8]">{description}</p>
      </div>
      <Button
        variant={connected ? 'danger' : 'secondary'}
        size="sm"
        onClick={connected ? onDisconnect : onConnect}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </Button>
    </div>
  )
}

const options: ContactType[] = ['off', 'email', 'sms']

export function SettingsPage() {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const [googleConnected, setGoogleConnected] = useState(true)
  const [saving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [sentEmail, setSentEmail] = useState(false)

  const initials = user?.name.trim()
    .split(/\s+/)
    .map(word => word[0].toUpperCase())
    .join('')

  const [preferences, setPreferences] = useState<Preferences>({
    newLeadNotify: 'off',
    newMessageReplyNotify: 'off',
    weeklySummeryNotify: 'off',
  })

  useEffect(() => {
    if (!user) return

    setPreferences({
      newLeadNotify: user.newLeadNotify,
      newMessageReplyNotify: user.newMessageReplyNotify,
      weeklySummeryNotify: user.weeklySummeryNotify,
    })
  }, [user])

  const handleChangePassword = async () => {
    const response = await fetch(`${BACKEND_URL}api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        email: user?.email,
      }),
    })
    if (!response.ok) {
      throw new Error('Failed to send password reset to email')
    }
    setSentEmail(true)
  }

  const handleSave = async () => {
    const response = await fetch(`${BACKEND_URL}api/settings/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(preferences),
    })

    if (!response.ok) {
      alert('Error saving the files')
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-[#0f172a]">Settings</h2>
        <p className="text-sm text-[#94a3b8] mt-0.5">Manage your account and integrations</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 pb-4 border-[#f1f5f9]">
            <div className="w-14 h-14 rounded-full bg-[#4f46e5] flex items-center justify-center">
              <span className="text-white text-lg font-semibold">{initials}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-[#0f172a]">{user?.name}</p>
              <p className="text-xs text-[#94a3b8]">{user?.email}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integrations */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Integrations</CardTitle>
            <a
              href="#"
              className="text-xs text-[#4f46e5] hover:underline flex items-center gap-1"
            >
              View docs
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent className="py-0">
          <IntegrationCard
            icon={<Chrome className="w-5 h-5 text-[#475569]" />}
            title="Google / Gmail"
            description="Sync emails and enable Google OAuth login"
            connected={googleConnected}
            onConnect={() => setGoogleConnected(true)}
            onDisconnect={() => setGoogleConnected(false)}
          />
          { /*<IntegrationCard
            icon={<Mail className="w-5 h-5 text-[#475569]" />}
            title="Outlook / Microsoft"
            description="Sync Outlook emails and calendar"
            connected={false}
            onConnect={() => {}}
            onDisconnect={() => {}}
          /> */}
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#94a3b8]" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            {
              key: 'newLeadNotify',
              label: 'New lead notifications',
              description: 'Get notified when a new lead comes in',
            },
            {
              key: 'newMessageReplyNotify',
              label: 'Message replies',
              description: 'Get notified when a lead replies',
            },
            {
              key: 'weeklySummaryNotify',
              label: 'Weekly summary',
              description: 'Receive a weekly performance summary',
            },
          ].map(({ key, label, description }) => {
            const value = preferences[key as keyof Preferences]

            return (
              <div
                key={key}
                className="flex items-center justify-between py-2 border-b border-[#f1f5f9]"
              >
                <div>
                  <p className="text-sm font-medium text-[#0f172a]">{label}</p>
                  <p className="text-xs text-[#94a3b8]">{description}</p>
                </div>

                <select
                  value={value}
                  onChange={(e) =>
                    setPreferences((prev) => ({
                      ...prev,
                      [key]: e.target.value as ContactType,
                    }))
                  }
                  className="text-sm border rounded px-2 py-1"
                >
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              loading={saving}
              onClick={handleSave}
              icon={saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : undefined}
            >
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account / Danger zone */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Shield className="w-4 h-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#0f172a]">Sign out</p>
              <p className="text-xs text-[#94a3b8]">Sign out of your RealCRM account</p>
            </div>
            <Button variant="danger" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </CardContent>

        {user?.source === 'manual' && (
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#0f172a]">Change Password</p>
                <p className="text-xs text-[#94a3b8]">Change your password</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleChangePassword}>
                Change Password
              </Button>
            </div>
            {sentEmail && (
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <CheckCircle2 size={18} />
                Email successfully sent! Please check your inbox or spam.
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
