import { Menu } from 'lucide-react'
import { useLocation } from 'react-router-dom'

interface TopNavProps {
  onMenuClick: () => void
  sidebarOpen: boolean
}

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/properties': 'Properties',
  '/messages': 'Messages',
  '/settings': 'Settings',
}

function getTitle(pathname: string): string {
  if (pathname.startsWith('/leads/')) return 'Lead Detail'
  return pageTitles[pathname] ?? 'RealCRM'
}

export function TopNav({ onMenuClick, sidebarOpen }: TopNavProps) {
  const location = useLocation()
  const title = getTitle(location.pathname)

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 flex-shrink-0">
      <button
        onClick={onMenuClick}
        aria-label="Open navigation"
        aria-controls="crm-navigation"
        aria-expanded={sidebarOpen}
        className="lg:hidden min-w-11 min-h-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <p className="text-sm font-semibold text-foreground">{title}</p>

      <div className="flex-1" />

      <span className="text-xs text-muted-foreground">RealCRM / Workspace</span>

    </header>
  )
}
