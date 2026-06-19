import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from './Button'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center mb-4">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h3 className="text-sm font-semibold text-[#0f172a] mb-1">Failed to load</h3>
      <p className="text-sm text-[#94a3b8] max-w-xs mb-4">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
