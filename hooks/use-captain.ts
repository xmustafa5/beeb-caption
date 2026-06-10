// hooks/use-captain.ts
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCaptain } from '@/services/captain-auth'
import { useAuthStore } from '@/store/auth-store'

/**
 * Fetches the captain profile and syncs it into the persisted store. Runs only
 * when authenticated (token + captain id present). Refreshes on app open.
 */
export function useCaptain() {
  const token = useAuthStore((s) => s.token)
  const id = useAuthStore((s) => s.captain?.id)

  const query = useQuery({
    queryKey: ['captain', id],
    queryFn: () => getCaptain(id as string),
    enabled: !!token && !!id,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (query.data) useAuthStore.getState().updateCaptain(query.data)
  }, [query.data])

  return query
}
