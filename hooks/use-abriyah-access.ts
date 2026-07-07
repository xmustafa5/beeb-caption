// hooks/use-abriyah-access.ts
import { useMutation, useQuery } from '@tanstack/react-query'
import { requestAbriyahAccess, refreshCaptain } from '@/services/abriyah-access'
import { useAuthStore } from '@/store/auth-store'
import type { AbriyahStatus } from '@/lib/captain-mappers'

/**
 * Captain Abriyah access: current status (from the auth store), a one-button
 * request, and a background refresh so an out-of-band admin approve/reject is
 * reflected. Both the request result and the refresh write back into the store
 * so the whole app (queue gating, this UI) sees the new status.
 */
export function useAbriyahAccess() {
  const captain = useAuthStore((s) => s.captain)
  const captainId = captain?.id
  const status: AbriyahStatus = captain?.abriyahStatus ?? 'none'
  const rejectionReason = captain?.abriyahRejectionReason ?? null

  // Poll the captain record while a request is pending review so the app picks up
  // the admin decision without a manual reload. Idle otherwise.
  const refresh = useQuery({
    queryKey: ['captain', 'abriyah-refresh', captainId],
    queryFn: async () => {
      const fresh = await refreshCaptain(captainId as string)
      useAuthStore.getState().updateCaptain(fresh)
      return fresh
    },
    enabled: !!captainId && status === 'requested',
    refetchInterval: status === 'requested' ? 15000 : false,
    staleTime: 0,
  })

  const request = useMutation({
    mutationFn: requestAbriyahAccess,
    onSuccess: (updated) => {
      useAuthStore.getState().updateCaptain(updated)
    },
  })

  return {
    status,
    rejectionReason,
    // The captain must be approved before requesting (server 403s otherwise).
    canRequest: captain?.status === 'approved',
    request: () => request.mutate(),
    isRequesting: request.isPending,
    requestError: request.isError,
    refetch: refresh.refetch,
  }
}
