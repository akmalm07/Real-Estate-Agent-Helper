import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 px-5">
      <div className="max-w-md border-l-2 border-border pl-5">
        <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground mb-4">{description}</p>
        {action && (
          <Button size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
