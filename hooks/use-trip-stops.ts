// hooks/use-trip-stops.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getStops, reachStop } from '@/services/captain-stops'

/**
 * A regular trip's intermediate stops (assigned-captain view) + a "reach" action.
 * Enabled only for a real trip id; the list refetches after a stop is marked
 * reached so the panel reflects progress. Abriyah trips have no stops.
 */
export function useTripStops(tripId: string | undefined, enabled: boolean) {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['captain', 'trip-stops', tripId],
    queryFn: () => getStops(tripId as string),
    enabled: !!tripId && enabled,
    staleTime: 1000 * 30,
  })

  const reach = useMutation({
    mutationFn: (stopId: string) => reachStop(tripId as string, stopId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['captain', 'trip-stops', tripId] })
    },
  })

  return {
    stops: query.data ?? [],
    isLoading: query.isLoading,
    reachStop: (stopId: string) => reach.mutate(stopId),
    reachingId: reach.isPending ? reach.variables : undefined,
  }
}
