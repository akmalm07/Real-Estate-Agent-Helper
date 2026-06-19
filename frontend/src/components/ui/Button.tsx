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
  primary: 'bg-[#4f46e5] text-white hover:bg-[#4338ca] border border-[#4f46e5]',
  secondary: 'bg-white text-[#0f172a] hover:bg-[#f9fafb] border border-[#e5e7eb]',
  ghost: 'bg-transparent text-[#475569] hover:bg-[#f9fafb] hover:text-[#0f172a] border border-transparent',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
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
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#4f46e5] focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        icon && <span className="flex-shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
