import React, { useEffect, useState } from 'react'
import {
  Mail,
  Building2,
  MapPin,
  Users,
  MessageSquare,
  Target,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Phone,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { BACKEND_URL } from '../consts.ts'
import { useAuth } from '../hooks/useAuth'

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

type LeadsPerMonth = '0_25' | '25_50' | '50_100' | '100_plus'
type ContactMethod = 'sms' | 'email' | 'phone' | 'mix'
type TeamSize = 'just_me' | '2_5' | '6_20' | '20_plus'
type BiggestChallenge =
  | 'following_up'
  | 'too_many_leads'
  | 'leads_go_cold'
  | 'organizing_conversations'
  | 'tracking_appointments'
  | 'converting_leads'

interface OnboardingData {
  brokerage: string
  primaryMarket: string
  leadsPerMonth: LeadsPerMonth | ''
  leadSources: string[]
  leadSourceOther: string
  contactMethod: ContactMethod | ''
  teamSize: TeamSize | ''
  biggestChallenge: BiggestChallenge | ''
}

const INITIAL: OnboardingData = {
  brokerage: '',
  primaryMarket: '',
  leadsPerMonth: '',
  leadSources: [],
  leadSourceOther: '',
  contactMethod: '',
  teamSize: '',
  biggestChallenge: '',
}

// Step 0 = Gmail connect, Steps 1-5 = questions
const TOTAL_STEPS = 6

/*
|--------------------------------------------------------------------------
| Sub-components
|--------------------------------------------------------------------------
*/

function StepHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-gray-500">{subtitle}</p>}
    </div>
  )
}

function OptionCard({
  selected,
  onClick,
  children,
  disabled = false,
  className = '',
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium transition-all',
        selected
          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
          : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 hover:bg-indigo-50/40',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / (total - 1)) * 100)
  return (
    <div className="mb-8">
      <div className="mb-1 flex justify-between text-xs text-gray-400">
        <span>
          Step {step + 1} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/*
|--------------------------------------------------------------------------
| Main Page
|--------------------------------------------------------------------------
*/

export function OnboardingPage() {
  const { refreshUser, user } = useAuth()

  const [step, setStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(INITIAL)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine if the user signed up manually (needs Gmail connect prompt)
  const userIsManual = user?.source === 'manual'

  // ── Load Gmail-connected state on mount ──────────────────────────────────
  // We no longer save partial onboarding answers, so there's nothing to
  // restore. We only need to know if Gmail is connected so step 0 can
  // display the right UI.
  useEffect(() => {
    async function loadGmailStatus() {
      try {
        const res = await fetch(`${BACKEND_URL}api/onboarding`, {
          credentials: 'include',
        })
        if (!res.ok) return

        const json = await res.json()
        setGmailConnected(json.gmailConnected ?? false)
      } catch {
        // silently ignore — the user can still complete onboarding
      }
    }
    loadGmailStatus()
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toggleSource(source: string) {
    setData((prev) => ({
      ...prev,
      leadSources: prev.leadSources.includes(source)
        ? prev.leadSources.filter((s) => s !== source)
        : [...prev.leadSources, source],
    }))
  }

  // Submit the entire onboarding bundle at the very end.
  async function submitAll() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        brokerage: data.brokerage,
        primaryMarket: data.primaryMarket,
        leadsPerMonth: data.leadsPerMonth,
        leadSources: data.leadSources,
        leadSourceOther: data.leadSources.includes('other')
          ? data.leadSourceOther
          : null,
        contactMethod: data.contactMethod,
        teamSize: data.teamSize,
        biggestChallenge: data.biggestChallenge,
        completed: true,
      }

      const res = await fetch(`${BACKEND_URL}api/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to save')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function handleNext() {
    try {
      if (step === TOTAL_STEPS - 1) {
        // Final step — submit everything as one bundle, then refresh user
        // so App.tsx routes to /dashboard via onboardComplete=true.
        await submitAll()
        await refreshUser()
        return
      }

      // All other steps just advance locally — no network calls.
      setStep((s) => s + 1)
    } catch {
      // error already surfaced by submitAll()
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1))
  }

  // ── Step 0: Gmail Connect ─────────────────────────────────────────────────
  function renderGmailStep() {
    if (!userIsManual || gmailConnected) {
      return (
        <div className="text-center">
          <StepHeader
            icon={<Mail size={28} />}
            title="Welcome aboard!"
            subtitle="Your Gmail account is already connected. Let's set up your profile."
          />
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 size={18} />
            Gmail connected
          </div>
        </div>
      )
    }

    return (
      <div className="text-center">
        <StepHeader
          icon={<Mail size={28} />}
          title="Connect your Gmail"
          subtitle="We need access to your Gmail inbox to automatically detect and respond to leads."
        />
        <p className="mb-6 text-sm text-gray-500">
          Connecting Gmail lets the AI read incoming lead emails and send replies on your behalf.
          Your data is never shared.
        </p>
        {gmailConnected ? (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 size={18} />
            Gmail connected
          </div>
        ) : (
          <a
            href={`${BACKEND_URL}auth/google/signup`}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-700 transition-colors"
          >
            <Mail size={18} />
            Connect Gmail
          </a>
        )}
        <p className="mt-4 text-xs text-gray-400">
          You can skip this step and connect later in Settings.
        </p>
      </div>
    )
  }

  // ── Step 1: Profile ───────────────────────────────────────────────────────
  function renderProfileStep() {
    return (
      <>
        <StepHeader
          icon={<Building2 size={28} />}
          title="Tell us about yourself"
          subtitle="Help us personalize your experience."
        />

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              What's your brokerage?
            </label>
            <Input
              type="text"
              placeholder="e.g. Keller Williams, RE/MAX…"
              value={data.brokerage}
              onChange={(e) => setData((d) => ({ ...d, brokerage: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <MapPin size={14} className="mr-1 inline" />
              Primary market
            </label>
            <Input
              type="text"
              placeholder="City, state, or ZIP code"
              icon={MapPin}
              value={data.primaryMarket}
              onChange={(e) => setData((d) => ({ ...d, primaryMarket: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              How many leads do you handle per month?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: '0_25', label: '0 – 25' },
                  { value: '25_50', label: '25 – 50' },
                  { value: '50_100', label: '50 – 100' },
                  { value: '100_plus', label: '100+' },
                ] as { value: LeadsPerMonth; label: string }[]
              ).map(({ value, label }) => (
                <OptionCard
                  key={value}
                  selected={data.leadsPerMonth === value}
                  onClick={() => setData((d) => ({ ...d, leadsPerMonth: value }))}
                >
                  {label}
                </OptionCard>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── Step 2: Lead Sources ──────────────────────────────────────────────────
  const LEAD_SOURCE_OPTIONS = [
    { value: 'zillow', label: 'Zillow' },
    { value: 'realtor', label: 'Realtor.com' },
    // { value: 'facebook_ads', label: 'Facebook Ads' },
    // { value: 'google_ads', label: 'Google Ads' },
    { value: 'website_forms', label: 'Website Forms' },
    { value: 'referrals', label: 'Referrals' },
  ]

  function renderLeadSourcesStep() {
    return (
      <>
        <StepHeader
          icon={<Target size={28} />}
          title="Where do your leads come from?"
          subtitle="Select all that apply."
        />

        <div className="space-y-2">
          {LEAD_SOURCE_OPTIONS.map(({ value, label }) => (
            <OptionCard
              key={value}
              selected={data.leadSources.includes(value)}
              onClick={() => toggleSource(value)}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    data.leadSources.includes(value)
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-gray-300 bg-white',
                  )}
                >
                  {data.leadSources.includes(value) && (
                    <CheckCircle2 size={10} className="text-white" />
                  )}
                </span>
                {label}
              </span>
            </OptionCard>
          ))}

          <div>
            <OptionCard
              selected={data.leadSources.includes('other')}
              onClick={() => toggleSource('other')}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    data.leadSources.includes('other')
                      ? 'border-indigo-500 bg-indigo-500'
                      : 'border-gray-300 bg-white',
                  )}
                >
                  {data.leadSources.includes('other') && (
                    <CheckCircle2 size={10} className="text-white" />
                  )}
                </span>
                Other
              </span>
            </OptionCard>
            {data.leadSources.includes('other') && (
              <div className="mt-2">
                <Input
                  type="text"
                  maxLength={50}
                  placeholder="Describe your source (max 50 chars)"
                  value={data.leadSourceOther}
                  onChange={(e) =>
                    setData((d) => ({ ...d, leadSourceOther: e.target.value }))
                  }
                />
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // ── Step 3: Contact Method ────────────────────────────────────────────────
  function renderContactMethodStep() {
    const options: { value: ContactMethod; label: string; note?: string }[] = [
      { value: 'sms', label: 'SMS first' },
      { value: 'email', label: 'Email first' },
      {
        value: 'phone',
        label: 'Phone call first',
        note: '📞 Automated phone calls are coming soon — not yet supported.',
      },
      { value: 'mix', label: 'Mix of all three' },
    ]

    return (
      <>
        <StepHeader
          icon={<MessageSquare size={28} />}
          title="How do you usually contact leads?"
          subtitle="Choose your preferred first-touch channel."
        />

        <div className="space-y-2">
          {options.map(({ value, label, note }) => (
            <div key={value}>
              <OptionCard
                selected={data.contactMethod === value}
                onClick={() => setData((d) => ({ ...d, contactMethod: value }))}
                disabled={value === 'phone'}
              >
                <span className="flex items-center gap-2">
                  {value === 'phone' && (
                    <Phone size={14} className="shrink-0 text-gray-400" />
                  )}
                  {label}
                  {value === 'phone' && (
                    <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Coming soon
                    </span>
                  )}
                </span>
              </OptionCard>
              {note && value === 'phone' && (
                <p className="mt-1 px-1 text-xs text-gray-400">{note}</p>
              )}
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── Step 4: Team Size ─────────────────────────────────────────────────────
  function renderTeamSizeStep() {
    const options: { value: TeamSize; label: string }[] = [
      { value: 'just_me', label: 'Just me' },
      { value: '2_5', label: '2 – 5 agents' },
      { value: '6_20', label: '6 – 20 agents' },
      { value: '20_plus', label: '20+ agents' },
    ]

    return (
      <>
        <StepHeader icon={<Users size={28} />} title="What's your team size?" />

        <div className="space-y-2">
          {options.map(({ value, label }) => (
            <OptionCard
              key={value}
              selected={data.teamSize === value}
              onClick={() => setData((d) => ({ ...d, teamSize: value }))}
            >
              {label}
            </OptionCard>
          ))}
        </div>
      </>
    )
  }

  // ── Step 5: Biggest Challenge ─────────────────────────────────────────────
  function renderChallengeStep() {
    const options: { value: BiggestChallenge; label: string }[] = [
      { value: 'following_up', label: 'Following up fast enough' },
      { value: 'too_many_leads', label: 'Too many leads' },
      { value: 'leads_go_cold', label: 'Leads go cold' },
      { value: 'organizing_conversations', label: 'Organizing conversations' },
      { value: 'tracking_appointments', label: 'Tracking appointments' },
      { value: 'converting_leads', label: 'Converting more leads' },
    ]

    return (
      <>
        <StepHeader
          icon={<Target size={28} />}
          title="What's your biggest challenge today?"
          subtitle="We'll tailor the experience to help you most."
        />

        <div className="space-y-2">
          {options.map(({ value, label }) => (
            <OptionCard
              key={value}
              selected={data.biggestChallenge === value}
              onClick={() => setData((d) => ({ ...d, biggestChallenge: value }))}
            >
              {label}
            </OptionCard>
          ))}
        </div>
      </>
    )
  }

  // ── Advance guard ─────────────────────────────────────────────────────────
  // Every step now requires its answers to be filled in before the user can
  // advance, since we no longer save partial data — the final submit must
  // include everything.
  function canAdvance(): boolean {
    if (step === 0) return true

    if (step === 1) {
      return !!data.brokerage.trim() && !!data.primaryMarket.trim() && !!data.leadsPerMonth
    }

    if (step === 2) {
      if (data.leadSources.length === 0) return false
      // If "other" is chosen, require a description.
      if (data.leadSources.includes('other') && !data.leadSourceOther.trim()) {
        return false
      }
      return true
    }

    if (step === 3) {
      return !!data.contactMethod && data.contactMethod !== 'phone'
    }

    if (step === 4) return !!data.teamSize
    if (step === 5) return !!data.biggestChallenge

    return true
  }

  const isLastStep = step === TOTAL_STEPS - 1

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-gray-100">
          <ProgressBar step={step} total={TOTAL_STEPS} />

          {step === 0 && renderGmailStep()}
          {step === 1 && renderProfileStep()}
          {step === 2 && renderLeadSourcesStep()}
          {step === 3 && renderContactMethodStep()}
          {step === 4 && renderTeamSizeStep()}
          {step === 5 && renderChallengeStep()}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ChevronLeft size={16} />
                Back
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-3">
              {step === 0 && userIsManual && !gmailConnected && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Skip for now
                </button>
              )}

              <Button
                onClick={handleNext}
                loading={saving}
                disabled={!canAdvance() || saving}
                icon={
                  isLastStep
                    ? <CheckCircle2 size={16} />
                    : <ChevronRight size={16} />
                }
              >
                {saving ? 'Saving…' : isLastStep ? 'Finish setup' : 'Continue'}
              </Button>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          You can update these settings anytime in your account settings.
        </p>
      </div>
    </div>
  )
}
