/**
 * tableSortUtils.ts
 *
 * Reusable table sorting utilities for all CRM pages.
 *
 * Rules:
 *  - Clicking a header toggles: asc → desc → asc
 *  - Sorting is applied AFTER search filtering
 *  - All sort logic lives here — pages just call sortItems()
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = 'asc' | 'desc'

export interface SortState<TKey extends string> {
  key: TKey
  direction: SortDirection
}

// ---------------------------------------------------------------------------
// Toggle helper
// ---------------------------------------------------------------------------

/**
 * Returns the next sort state when a header is clicked.
 * If clicking the same key: toggles direction.
 * If clicking a new key: defaults to 'asc'.
 */
export function toggleSort<TKey extends string>(
  current: SortState<TKey>,
  clickedKey: TKey
): SortState<TKey> {
  if (current.key === clickedKey) {
    return { key: clickedKey, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  }
  return { key: clickedKey, direction: 'asc' }
}

// ---------------------------------------------------------------------------
// Core sort function
// ---------------------------------------------------------------------------

/**
 * Sorts an array of items by a given key and direction.
 *
 * @param items     - array to sort (not mutated)
 * @param key       - the sort key
 * @param direction - 'asc' or 'desc'
 * @param getValue  - function that extracts a comparable value from an item
 */
export function sortItems<T, TKey extends string>(
  items: T[],
  sort: SortState<TKey>,
  getValue: (item: T, key: TKey) => string | number | null | undefined
): T[] {
  return [...items].sort((a, b) => {
    const aVal = getValue(a, sort.key) ?? ''
    const bVal = getValue(b, sort.key) ?? ''

    let cmp: number
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      cmp = aVal - bVal
    } else {
      cmp = String(aVal).toLowerCase().localeCompare(String(bVal).toLowerCase())
    }

    return sort.direction === 'asc' ? cmp : -cmp
  })
}

// ---------------------------------------------------------------------------
// Sort indicator component helper
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate sort indicator character for a column header.
 */
export function getSortIndicator<TKey extends string>(
  sort: SortState<TKey>,
  key: TKey
): '↑' | '↓' | '↕' {
  if (sort.key !== key) return '↕'
  return sort.direction === 'asc' ? '↑' : '↓'
}
