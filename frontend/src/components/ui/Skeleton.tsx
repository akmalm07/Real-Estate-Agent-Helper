import { cn } from '../../lib/utils'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-[#f1f5f9] rounded-lg',
        className
      )}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 py-3 px-5">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-5 w-16 rounded-md" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[#e5e7eb]">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
