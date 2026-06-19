import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'indigo'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#f9fafb] text-[#475569] border border-[#e5e7eb]',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  warning: 'bg-amber-50 text-amber-700 border border-amber-100',
  danger: 'bg-red-50 text-red-600 border border-red-100',
  muted: 'bg-[#f9fafb] text-[#94a3b8] border border-[#e5e7eb]',
  indigo: 'bg-[#eef2ff] text-[#4f46e5] border border-indigo-100',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

export function LeadStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: BadgeVariant }> = {
    new: { label: 'New', variant: 'indigo' },
    active: { label: 'Active', variant: 'success' },
    cold: { label: 'Cold', variant: 'muted' },
    converted: { label: 'Converted', variant: 'success' },
    opted_out: { label: 'Opted Out', variant: 'danger' },
  }
  const { label, variant } = config[status] ?? { label: status, variant: 'default' }
  return <Badge variant={variant}>{label}</Badge>
}
