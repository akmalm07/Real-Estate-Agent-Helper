import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { GoogleCallbackPage } from './pages/GoogleCallbackPage'
import { DashboardPage } from './pages/DashboardPage'
import { LeadsPage } from './pages/LeadsPage'
import { LeadDetailPage } from './pages/LeadDetailPage'
import { PropertiesPage } from './pages/PropertiesPage'
import { MessagesPage } from './pages/MessagesPage'
import { SettingsPage } from './pages/SettingsPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { useAuth } from './hooks/useAuth'

function App() {
  const { isAuthenticated, user, initializing } = useAuth()
  const location = useLocation()

  // Always let the Google OAuth callback page mount first so it can
  // run the /exchange fetch and set the session cookie before App.tsx
  // makes any auth-based routing decisions. Without this guard the
  // initializing → unauthenticated transition races the exchange call
  // and redirects the user to /login before the cookie is set.
  if (location.pathname === '/google/callback') {
    return (
      <Routes>
        <Route path="/google/callback" element={<GoogleCallbackPage />} />
      </Routes>
    )
  }

  // The change-password page must be accessible without authentication
  // since the user is arriving from an email link and may not be logged in.
  if (location.pathname === '/change-password') {
    return (
      <Routes>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Routes>
    )
  }

  // Show loading spinner while checking auth status
  if (initializing) {
    return (
      <div className="min-h-screen bg-[#f9fafb] flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-[#4f46e5]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/google/callback" element={<GoogleCallbackPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Authenticated but onboarding not complete
  if (user && !user.onboardComplete) {
    return (
      <Routes>
        <Route path="/onboard" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboard" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetailPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="/google/callback" element={<GoogleCallbackPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
