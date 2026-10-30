import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { getHighlightSegments } from '../../lib/searchUtils'
import { getSortIndicator } from '../../lib/tableSortUtils'
import type { SortState } from '../../lib/tableSortUtils'

export type LeadSortKey = 'name' | 'source' | 'status' | 'propertyId' | 'createdAt'

// DOM work stays in effects so server rendering and renderer-only tests are safe.
function useFocusScope(ref: RefObject<HTMLElement | null>, active: boolean, onClose: () => void, busy = false) {
  const options = useRef({ onClose, busy })
  useEffect(() => { options.current = { onClose, busy } }, [onClose, busy])
  useEffect(() => {
    if (!active || typeof document === 'undefined' || !ref.current) return
    const scope = ref.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(scope.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
    )).filter((node) => !node.closest('[inert]') && node.getClientRects().length > 0)
    const focusFirst = () => (focusable()[0] ?? scope).focus()
    const inerted: { node: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement = scope
    while (branch.parentElement && branch !== document.body) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inerted.push({ node: sibling, inert: sibling.hasAttribute('inert') })
          sibling.setAttribute('inert', '')
        }
      }
      branch = branch.parentElement
    }
    focusFirst()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!options.current.busy) options.current.onClose()
      }
      if (event.key !== 'Tab') return
      const nodes = focusable()
      const first = nodes[0]
      const last = nodes.at(-1)
      if (!first) { event.preventDefault(); scope.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    const focusin = (event: FocusEvent) => {
      if (!scope.contains(event.target as Node)) focusFirst()
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      inerted.forEach(({ node, inert }) => { if (!inert) node.removeAttribute('inert') })
      // A menu action may have disappeared; its disclosure restores focus first.
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus()
    }
  }, [active, ref])
}

export function FocusScope({ scopeRef, active, onClose }: {
  scopeRef: RefObject<HTMLElement | null>; active: boolean; onClose: () => void
}) {
  useFocusScope(scopeRef, active, onClose)
  return null
}

export function ModalFrame({ titleId, onClose, busy = false, children }: {
  titleId: string; onClose: () => void; busy?: boolean; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusScope(ref, true, onClose, busy)
  return (
    <div className="crm-modal-backdrop">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-busy={busy || undefined} tabIndex={-1} className="crm-modal">
        {children}
      </div>
    </div>
  )
}

export function SortableHeader({ label, sortKey, sort, onSort }: {
  label: string
  sortKey: LeadSortKey
  sort: SortState<LeadSortKey>
  onSort: (key: LeadSortKey) => void
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      aria-label={`${label}: ${sort.key === sortKey ? `${sort.direction}ending; reverse sort` : 'sort ascending'}`}
      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-primary transition-colors group"
    >
      {label}
      <span aria-hidden="true" className="text-xs text-primary">
        {getSortIndicator(sort, sortKey)}
      </span>
    </button>
  )
}

export function HighlightedText({ text, query }: { text: string; query: string }) {
  const segments = getHighlightSegments(text, query)
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight
          ? <mark key={i} className="bg-caution-subtle text-caution rounded px-0.5">{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </>
  )
}

export function SectionHeader({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-6 h-6 rounded-sm bg-accent text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
