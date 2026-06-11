// hooks/use-earnings.ts
import { useQuery } from '@tanstack/react-query'
import { getEarnings, getEarningsHistory, type EarningsPeriod } from '@/services/earnings'
import { useAuthStore } from '@/store/auth-store'

/**
 * Earnings summary + trip history for a period. Reads the captain id from the
 * auth store; both queries are keyed on the period so switching periods refetches.
 */
export function useEarnings(period: EarningsPeriod) {
  const token = useAuthStore((s) => s.token)
  const captainId = useAuthStore((s) => s.captain?.id)
  const enabled = !!token && !!captainId

  const summary = useQuery({
    queryKey: ['captain', 'earnings', captainId, period],
    queryFn: () => getEarnings(captainId as string, period),
    enabled,
    staleTime: 1000 * 60,
  })

  const history = useQuery({
    queryKey: ['captain', 'earnings', 'history', captainId, period],
    queryFn: () => getEarningsHistory(captainId as string, period),
    enabled,
    staleTime: 1000 * 60,
  })

  return {
    earnings: summary.data,
    history: history.data ?? [],
    isLoading: summary.isLoading || history.isLoading,
    isRefetching: summary.isRefetching || history.isRefetching,
    refetch: () => { summary.refetch(); history.refetch() },
  }
}
