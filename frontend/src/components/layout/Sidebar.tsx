import { useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Building2, MessageSquare, Settings, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { cn, getInitials } from '../../lib/utils'
import { FocusScope } from '../leads/LeadFormShared'

interface SidebarProps {
  open: boolean
  onClose: () => void
  desktop?: boolean
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/properties', icon: Building2, label: 'Properties' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar({ open, onClose, desktop = false }: SidebarProps) {
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const ref = useRef<HTMLElement>(null)
  const identity = user?.name?.trim() || user?.email || 'Account'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside id="crm-navigation" ref={ref} tabIndex={-1} inert={!open && !desktop}
      aria-label="Workspace navigation" role={open && !desktop ? 'dialog' : undefined}
      aria-modal={open && !desktop ? true : undefined}
      className={cn(
        'crm-sidebar fixed inset-y-0 left-0 z-30 w-60 bg-card border-r border-border flex flex-col transition-transform duration-200',
        'lg:relative lg:translate-x-0 lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
       )}>
      <FocusScope scopeRef={ref} active={open && !desktop} onClose={onClose} />
      <div className="flex items-center justify-between h-14 px-5 border-b border-border flex-shrink-0">
        <span className="font-semibold text-primary tracking-tight text-lg">RealCRM<span className="text-muted-foreground font-normal"> /</span></span>
        <button onClick={onClose} aria-label="Close navigation"
          className="lg:hidden min-w-11 min-h-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
          <X aria-hidden="true" className="w-5 h-5" />
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex-1 px-3 py-5 space-y-1 overflow-y-auto scrollbar-thin">
        <p className="px-3 mb-3 text-xs text-muted-foreground uppercase tracking-widest">Workspace</p>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={onClose} end={to === '/dashboard'}
            className={({ isActive }) => cn(
              'flex min-h-11 items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors border-l-2',
              isActive ? 'bg-accent text-primary border-primary' : 'border-transparent text-muted-foreground hover:bg-background hover:text-foreground'
            )}>
            <Icon aria-hidden="true" className="w-4 h-4 flex-shrink-0" />{label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="w-8 h-8 rounded-md bg-accent text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{getInitials(identity)}</span>
          <div className="min-w-0 text-xs break-words [overflow-wrap:anywhere]">
            <p className="font-semibold">{identity}</p>
            {user?.email && <p className="text-muted-foreground mt-1">{user.email}</p>}
          </div>
        </div>
        <button onClick={handleLogout} className="mt-2 min-h-11 text-sm text-primary underline underline-offset-4 hover:text-destructive">Logout</button>
      </div>
    </aside>
  )
}
