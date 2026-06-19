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

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-[#eef2ff] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-[#4f46e5]" />
      </div>
      <h3 className="text-sm font-semibold text-[#0f172a] mb-1">{title}</h3>
      <p className="text-sm text-[#94a3b8] max-w-xs mb-4">{description}</p>
      {action && (
        <Button size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
