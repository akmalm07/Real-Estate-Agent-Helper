import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon
  error?: string
}

export function Input({ icon: Icon, error, className, ...props }: InputProps) {
  return (
    <div className="relative">
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Icon className="w-4 h-4 text-[#94a3b8]" />
        </div>
      )}
      <input
        className={cn(
          'w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8]',
          'px-3 py-2 outline-none transition-colors',
          'focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]',
          'disabled:bg-[#f9fafb] disabled:cursor-not-allowed',
          Icon && 'pl-9',
          error && 'border-red-400 focus:border-red-400 focus:ring-red-50',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
        'w-full bg-white border border-[#e5e7eb] rounded-lg text-sm text-[#0f172a] placeholder-[#94a3b8]',
        'px-3 py-2 outline-none transition-colors resize-none',
        'focus:border-[#4f46e5] focus:ring-2 focus:ring-[#eef2ff]',
        className
      )}
      {...props}
    />
  )
}
