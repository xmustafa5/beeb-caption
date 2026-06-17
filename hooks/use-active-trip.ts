// hooks/use-active-trip.ts
import { useQuery } from '@tanstack/react-query'
import { getActiveCaptainTrip } from '@/services/captain-trips'
import { useAuthStore } from '@/store/auth-store'

export const ACTIVE_TRIP_KEY = ['captain', 'active-trip'] as const

/**
 * The captain's in-flight trip (accepted / in_progress), or null. Backs both the
 * launch resume and the home-screen "resume trip" banner — sharing one cache key
 * so they never double-fetch. Polls periodically so the banner clears on its own
 * once the trip ends (e.g. completed from the live screen, or a remote cancel).
 */
export function useActiveTrip() {
  const captainId = useAuthStore((s) => s.captain?.id)
  const isApproved = useAuthStore((s) => s.captain?.status === 'approved')

  return useQuery({
    queryKey: ACTIVE_TRIP_KEY,
    queryFn: () => getActiveCaptainTrip(captainId as string),
    enabled: !!captainId && isApproved,
    staleTime: 1000 * 15,
    refetchInterval: 1000 * 30,
  })
}
