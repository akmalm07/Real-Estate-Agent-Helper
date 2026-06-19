import { Menu, Bell, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'

interface TopNavProps {
  onMenuClick: () => void
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

export function TopNav({ onMenuClick }: TopNavProps) {
  const location = useLocation()
  const title = getTitle(location.pathname)

  return (
    <header className="h-14 bg-white border-b border-[#e5e7eb] flex items-center px-4 gap-4 flex-shrink-0">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-[#475569] hover:bg-[#f9fafb] hover:text-[#0f172a] transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      <h1 className="text-sm font-semibold text-[#0f172a]">{title}</h1>

      <div className="flex-1" />

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-lg px-3 py-1.5 w-56">
        <Search className="w-3.5 h-3.5 text-[#94a3b8] flex-shrink-0" />
        <input
          type="text"
          placeholder="Search..."
          className="bg-transparent text-sm text-[#0f172a] placeholder-[#94a3b8] outline-none w-full"
        />
      </div>

    </header>
  )
}
