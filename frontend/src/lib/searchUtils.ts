/**
 * searchUtils.ts
 *
 * Reusable search utility for all CRM pages.
 *
 * Behavior:
 *  - Case-insensitive
 *  - Partial substring matching
 *  - Lightweight ranking: exact > startsWith > substring
 *  - Debounce hook included
 */

import { useState, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchRank = 0 | 1 | 2 | 3 // 0 = no match, 3 = exact, 2 = startsWith, 1 = substring

export interface RankedItem<T> {
  item: T
  rank: SearchRank
}

// ---------------------------------------------------------------------------
// Core ranking function
// ---------------------------------------------------------------------------

/**
 * Returns a rank score for a single field against the query.
 * 3 = exact match
 * 2 = startsWith
 * 1 = substring
 * 0 = no match
 */
export function rankField(field: string | null | undefined, query: string): SearchRank {
  if (!field) return 0
  const f = field.toLowerCase()
  const q = query.toLowerCase()
  if (f === q)           return 3
  if (f.startsWith(q))   return 2
  if (f.includes(q))     return 1
  return 0
}

/**
 * Returns the best rank across multiple fields.
 */
export function rankItem(fields: (string | null | undefined)[], query: string): SearchRank {
  if (!query.trim()) return 1 // empty query — everything passes with rank 1
  return fields.reduce<SearchRank>((best, field) => {
    const r = rankField(field, query)
    return r > best ? r : best
  }, 0) as SearchRank
}

/**
 * Filters and ranks an array of items.
 * Items with rank 0 are excluded.
 * Items are sorted by rank descending (best match first).
 */
export function searchAndRank<T>(
  items: T[],
  query: string,
  getFields: (item: T) => (string | null | undefined)[]
): T[] {
  if (!query.trim()) return items

  const ranked: RankedItem<T>[] = items
    .map((item) => ({ item, rank: rankItem(getFields(item), query) }))
    .filter((r) => r.rank > 0)

  ranked.sort((a, b) => b.rank - a.rank)
  return ranked.map((r) => r.item)
}

// ---------------------------------------------------------------------------
// Highlight helper
// ---------------------------------------------------------------------------

/**
 * Splits a string into parts: matched and unmatched segments.
 * Use this to render highlighted text in the UI.
 *
 * Returns an array of { text, highlight } segments.
 */
export function getHighlightSegments(
  text: string,
  query: string
): { text: string; highlight: boolean }[] {
  if (!query.trim()) return [{ text, highlight: false }]

  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return [{ text, highlight: false }]

  const before = text.slice(0, idx)
  const match  = text.slice(idx, idx + query.length)
  const after  = text.slice(idx + query.length)

  return [
    ...(before ? [{ text: before, highlight: false }] : []),
    { text: match, highlight: true },
    ...(after  ? [{ text: after,  highlight: false }] : []),
  ]
}

// ---------------------------------------------------------------------------
// Debounce hook
// ---------------------------------------------------------------------------

/**
 * Returns a debounced version of the value.
 * Use this to avoid recomputing search results on every keystroke.
 */
export function useDebounce<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
