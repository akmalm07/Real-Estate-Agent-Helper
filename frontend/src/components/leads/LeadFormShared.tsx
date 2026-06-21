import { getHighlightSegments } from '../../lib/searchUtils'
import { getSortIndicator } from '../../lib/tableSortUtils'
import type { SortState } from '../../lib/tableSortUtils'

export type LeadSortKey = 'name' | 'source' | 'status' | 'propertyId' | 'createdAt'

export function SortableHeader({ label, sortKey, sort, onSort }: {
  label: string
  sortKey: LeadSortKey
  sort: SortState<LeadSortKey>
  onSort: (key: LeadSortKey) => void
}) {
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-xs font-semibold text-[#94a3b8] uppercase tracking-wide hover:text-[#4f46e5] transition-colors group"
    >
      {label}
      <span className={`text-xs ${sort.key === sortKey ? 'text-[#4f46e5]' : 'text-[#cbd5e1] group-hover:text-[#4f46e5]'}`}>
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
          ? <mark key={i} className="bg-yellow-100 text-yellow-900 rounded px-0.5">{seg.text}</mark>
          : <span key={i}>{seg.text}</span>
      )}
    </>
  )
}

export function SectionHeader({ number, title, subtitle }: { number: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-[#4f46e5] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#0f172a]">{title}</h4>
        {subtitle && <p className="text-xs text-[#94a3b8] mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
