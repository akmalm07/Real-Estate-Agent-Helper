import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'

export function LeadMenu({ onEdit, onDelete, label = 'Lead actions' }: { onEdit: () => void; onDelete: () => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLButtonElement>('[data-menu-actions] button')?.focus()
  }, [open])

  const close = () => { setOpen(false); trigger.current?.focus() }

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button
        ref={trigger} aria-label={label} aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="min-w-11 min-h-11 flex items-center justify-center gap-1 rounded-md text-primary hover:bg-accent transition-colors px-2 text-xs"
      >
        <MoreVertical aria-hidden="true" className="w-4 h-4" /> Actions
      </button>
      {open && (
        <div data-menu-actions className="absolute right-0 bottom-full mb-1 w-36 bg-card border border-border rounded-lg shadow-dropdown z-30 py-1">
          <button
            onClick={() => { close(); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
          <button
            onClick={() => { close(); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive-subtle transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}
