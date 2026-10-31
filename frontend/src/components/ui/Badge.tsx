import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'muted' | 'indigo'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-muted text-muted-foreground border border-border',
  success: 'bg-accent text-primary border border-primary/20',
  warning: 'bg-caution-subtle text-caution border border-caution/20',
  danger: 'bg-destructive-subtle text-destructive border border-destructive/20',
  muted: 'bg-muted text-muted-foreground border border-border',
  indigo: 'bg-accent text-primary border border-primary/20',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium tabular-nums',
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
