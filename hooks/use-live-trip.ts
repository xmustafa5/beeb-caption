// hooks/use-live-trip.ts
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getTrip,
  arriveTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  type Trip,
  type TripStatus,
  type CancelReason,
} from '@/services/captain-trips'
import { useCaptainPresence } from '@/providers/captain-presence'
import { ACTIVE_TRIP_KEY } from '@/hooks/use-active-trip'

/**
 * Live trip state for the driving screen. GET on mount is the source of truth;
 * Area 3's lastTripUpdate WS frame patches the status live (covers a rider/admin
 * cancel). Leg mutations call the service, patch status where deterministic, and
 * refetch on settle. `arrived` is a local cue flag (arrive has no status change).
 */
export function useLiveTrip(id: string) {
  const { lastTripUpdate } = useCaptainPresence()
  const queryClient = useQueryClient()
  const [arrived, setArrived] = useState(false)

  const key = ['trip', id] as const
  const query = useQuery({ queryKey: key, queryFn: () => getTrip(id), enabled: !!id })

  // Live status from the WS frame (only when it's THIS trip).
  useEffect(() => {
    if (lastTripUpdate && lastTripUpdate.id === id) {
      queryClient.setQueryData<Trip | undefined>(key, (prev) =>
        prev ? { ...prev, status: lastTripUpdate.status as TripStatus } : prev,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTripUpdate, id])

  function patchStatus(status: TripStatus) {
    queryClient.setQueryData<Trip | undefined>(key, (prev) => (prev ? { ...prev, status } : prev))
  }

  const arriveM = useMutation({
    mutationFn: () => arriveTrip(id),
    onSuccess: () => setArrived(true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const startM = useMutation({
    mutationFn: () => startTrip(id),
    onSuccess: () => patchStatus('in_progress'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  // Ending the trip also clears the home-screen "resume trip" banner immediately
  // (otherwise it lingers until the active-trip poll catches up).
  const endTrip = (status: TripStatus) => {
    patchStatus(status)
    queryClient.invalidateQueries({ queryKey: ACTIVE_TRIP_KEY })
  }
  const completeM = useMutation({
    mutationFn: () => completeTrip(id),
    onSuccess: () => endTrip('completed'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const cancelM = useMutation({
    mutationFn: ({ reason, comment }: { reason: CancelReason; comment?: string }) =>
      cancelTrip(id, reason, comment),
    onSuccess: () => endTrip('cancelled'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  return {
    trip: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    arrived,
    arrive: () => arriveM.mutateAsync(),
    start: () => startM.mutateAsync(),
    complete: () => completeM.mutateAsync(),
    cancel: (reason: CancelReason, comment?: string) => cancelM.mutateAsync({ reason, comment }),
    busy: arriveM.isPending || startM.isPending || completeM.isPending || cancelM.isPending,
  }
}
