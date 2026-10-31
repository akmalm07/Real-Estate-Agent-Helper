import { cn } from '../../lib/utils'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary-hover border border-primary',
  secondary: 'bg-card text-foreground hover:bg-secondary border border-input',
  ghost: 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent',
  danger: 'bg-destructive-subtle text-destructive hover:bg-destructive hover:text-white border border-destructive',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-sm gap-2',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  type = 'button', // Default to 'button' to prevent accidental form submissions.
  // Without this, browsers treat an untyped <button> as type="submit",
  // which can trigger unintended form submissions anywhere in the tree.
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex min-h-11 items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:border-input',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
      aria-busy={loading || props['aria-busy']}
    >
      {loading ? (
        <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
      ) : (
        icon && <span aria-hidden="true" className="flex-shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
