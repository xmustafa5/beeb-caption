// hooks/use-abriyah-access.ts
import { useQuery } from '@tanstack/react-query'
import { refreshCaptain } from '@/services/abriyah-access'
import { useAuthStore } from '@/store/auth-store'

/**
 * Captain Abriyah (shared-ride) access — read-only.
 *
 * The scope is an admin decision: it is chosen when the captain's registration
 * is approved and can be granted or revoked from the dashboard afterwards. The
 * captain has no action to take, so this hook only reports the current state
 * and re-reads the record whenever the screen showing it mounts. That refresh
 * is the ONLY way a grant or revoke reaches the app — without it the captain
 * would keep seeing a stale scope until the next sign-in.
 */
export function useAbriyahAccess() {
  const captain = useAuthStore((s) => s.captain)
  const captainId = captain?.id

  useQuery({
    queryKey: ['captain', 'abriyah-refresh', captainId],
    queryFn: async () => {
      const fresh = await refreshCaptain(captainId as string)
      useAuthStore.getState().updateCaptain(fresh)
      return fresh
    },
    enabled: !!captainId,
    // The admin's decision lands out of band, so always re-check on mount rather
    // than serving a cached answer the captain would have no way to correct.
    refetchOnMount: 'always',
    staleTime: 0,
  })

  // Only 'approved' grants shared rides. The legacy 'requested' / 'rejected'
  // values are no longer written by the server (they were normalized away with
  // the request queue), but a store rehydrated from an older build can still
  // carry one — treat anything that is not 'approved' as taxi-only.
  return { enabled: captain?.abriyahStatus === 'approved' }
}
