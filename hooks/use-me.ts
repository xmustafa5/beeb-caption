import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMe } from '@/services/auth'
import { useAuthStore } from '@/store/auth-store'

/**
 * Fetches the rider profile from the backend and syncs it into the persisted
 * auth store. Runs only when authenticated. Use on Home so the locally-cached
 * profile is refreshed against the server on each app open.
 */
export function useMe() {
  const token = useAuthStore((s) => s.token)

  const query = useQuery({
    queryKey: ['riders', 'me'],
    queryFn: getMe,
    enabled: !!token,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (query.data) useAuthStore.getState().updateUser(query.data)
  }, [query.data])

  return query
}
