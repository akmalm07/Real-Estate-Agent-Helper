import { useId } from 'react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon
  error?: string
}

export function Input({ icon: Icon, error, className, id, 'aria-describedby': describedBy, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const description = [describedBy, error ? errorId : undefined].filter(Boolean).join(' ') || undefined

  return (
    <div className="relative">
      {Icon && (
        <div aria-hidden="true" className="absolute left-3 top-[22px] -translate-y-1/2 pointer-events-none">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
      <input
        className={cn(
          'w-full min-h-11 bg-card border border-input rounded-md text-base sm:text-sm text-foreground placeholder:text-muted-foreground',
          'px-3 py-2 outline-none transition-colors',
          'focus:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-1',
          'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
          Icon && 'pl-9',
          error && 'border-destructive focus:border-destructive focus:ring-destructive',
          className
        )}
        {...props}
        id={inputId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description}
      />
      {error && <p id={errorId} className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full min-h-11 bg-card border border-input rounded-md text-base sm:text-sm text-foreground placeholder:text-muted-foreground',
        'px-3 py-2 outline-none transition-colors resize-none',
        'focus:border-primary focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed',
        className
      )}
      {...props}
    />
  )
}
