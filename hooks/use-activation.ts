// hooks/use-activation.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTodayActivation, activateToday } from '@/services/activation'
import { useAuthStore } from '@/store/auth-store'

const KEY = ['captain', 'activation', 'today'] as const

/**
 * Reads today's activation gate state and exposes an `activate` mutation.
 * The query runs only when authenticated; activate invalidates it on success
 * so the home screen re-renders the activated state.
 */
export function useActivation() {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: KEY,
    queryFn: getTodayActivation,
    enabled: !!token,
    staleTime: 1000 * 60, // 1 min — daily rollover is at Baghdad midnight
  })

  const activate = useMutation({
    mutationFn: activateToday,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return { query, activate }
}
