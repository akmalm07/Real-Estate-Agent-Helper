import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  MessageSquare,
  Settings,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/properties', icon: Building2, label: 'Properties' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
]

export function Sidebar({ open, onClose }: SidebarProps) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 w-60 bg-white border-r border-[#e5e7eb] flex flex-col transition-transform duration-200 ease-in-out',
        'lg:relative lg:translate-x-0 lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-14 px-5 border-b border-[#e5e7eb] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#4f46e5] rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-[#0f172a] text-sm tracking-tight">RealCRM</span>
        </div>
        <button
          onClick={onClose}
          className="lg:hidden p-1 rounded-md text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f9fafb]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        <p className="px-2 mb-2 text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">
          Main
        </p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#eef2ff] text-[#4f46e5]'
                  : 'text-[#475569] hover:bg-[#f9fafb] hover:text-[#0f172a]'
              )
            }
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        <div className="pt-4">
          <p className="px-2 mb-2 text-[10px] font-semibold text-[#94a3b8] uppercase tracking-wider">
            Account
          </p>
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-[#eef2ff] text-[#4f46e5]'
                  : 'text-[#475569] hover:bg-[#f9fafb] hover:text-[#0f172a]'
              )
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            Settings
          </NavLink>
        </div>
      </nav>

      {/* User footer */}
      <div className="px-3 py-3 border-t border-[#e5e7eb] flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-[#f9fafb] cursor-pointer group">
          <div className="w-7 h-7 rounded-full bg-[#4f46e5] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">AJ</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[#0f172a] truncate">{user?.name}</p>
            <p className="text-[11px] text-[#94a3b8] truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[11px] text-[#94a3b8] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
  )
}
