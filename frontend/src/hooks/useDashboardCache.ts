import { useContext } from 'react'
import { DashboardCacheContext } from '../context/dashboard-cache-context'

export function useDashboardCache() {
  return useContext(DashboardCacheContext)
}
