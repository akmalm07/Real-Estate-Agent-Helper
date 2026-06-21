import { CircleDot } from 'lucide-react'
import type { Lead } from './types'

export function LeadReadyIndicator({ lead }: { lead: Lead }) {
  const isReady = lead.status === 'active' || lead.status === 'converted'
  const color   = isReady ? 'text-green-500' : 'text-red-500'
  const tooltip = isReady ? 'Lead is ready' : 'Lead is not ready'
  return (
    <div className={`flex items-center gap-1 ${color}`} title={tooltip}>
      <CircleDot className="w-3 h-3 fill-current" />
    </div>
  )
}
