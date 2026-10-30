import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { useEffect, useState } from 'react'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [drawerRoute, setDrawerRoute] = useState(location.key)
  const [desktop, setDesktop] = useState(false)
  if (drawerRoute !== location.key) {
    setDrawerRoute(location.key)
    setSidebarOpen(false)
  }
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(min-width: 1024px)')
    const sync = () => { setDesktop(media.matches); setSidebarOpen(false) }
    // Subscription callback also establishes the initial desktop accessibility.
    media.addEventListener('change', sync)
    const frame = window.requestAnimationFrame(sync)
    return () => { media.removeEventListener('change', sync); window.cancelAnimationFrame(frame) }
  }, [])

  return (
    <div className="crm-shell flex h-svh bg-background text-foreground overflow-hidden">
      <a href="#crm-main" className="crm-skip" onClick={() => {
        if (typeof document !== 'undefined') document.getElementById('crm-main')?.focus()
      }}>Skip to workspace</a>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-foreground/30 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar open={sidebarOpen} desktop={desktop} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopNav sidebarOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        <main id="crm-main" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
