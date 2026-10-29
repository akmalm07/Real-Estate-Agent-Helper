import { Button } from './Button'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div className="py-12 px-5">
      <div className="max-w-md border-l-2 border-destructive pl-5">
        <h3 className="text-base font-semibold text-foreground mb-2">Unable to load this view</h3>
        <p className="text-sm leading-relaxed text-muted-foreground mb-4">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
