// hooks/use-live-trip.ts
import { useEffect, useRef, useState } from 'react'
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
import {
  announceRemoteCancel,
  claimCancelAnnouncement,
  TRIP_QUEUE_KEY,
} from '@/hooks/use-remote-trip-cancel'

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
  const query = useQuery({
    queryKey: key,
    queryFn: () => getTrip(id),
    enabled: !!id,
    // Backstop for the WS. A rider/admin cancel used to reach the captain only
    // when a leg button came back 400 — meanwhile they kept driving to a dead
    // pickup. Poll only while the trip is actually live, and never in the
    // background: the OS suspends the screen the captain is not looking at, and
    // a cancel that lands then is handled by the WS frame / push on resume.
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === 'accepted' || s === 'in_progress' ? 10_000 : false
    },
    refetchIntervalInBackground: false,
  })

  // Our own cancel already walks the captain to the cancelled screen; only a
  // remote one (rider / admin / dispatch sweep) is news worth an alert.
  const ownCancel = useRef(false)

  // Live status from the WS frame (only when it's THIS trip).
  useEffect(() => {
    if (lastTripUpdate && lastTripUpdate.id === id) {
      queryClient.setQueryData<Trip | undefined>(key, (prev) =>
        prev
          ? {
              ...prev,
              status: lastTripUpdate.status as TripStatus,
              // Only ever ADD the actor: a later frame that omits it must not erase
              // the one the cancel frame brought, or the alert falls back to the
              // neutral copy after correctly naming support a moment earlier.
              ...(lastTripUpdate.cancelledBy ? { cancelledBy: lastTripUpdate.cancelledBy } : {}),
            }
          : prev,
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
    // Claim the announcement up front so neither the effect below nor the
    // tabs-level useRemoteTripCancel alerts about a cancel the captain just made
    // themselves — the server echoes it back over the WS like any other.
    onMutate: () => {
      ownCancel.current = true
      claimCancelAnnouncement(id)
    },
    onSuccess: () => endTrip('cancelled'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  // Remote cancel: tell the captain once, and clear the caches that still think
  // there is a trip. The screen's own `status === 'cancelled'` branch renders the
  // rest. announceRemoteCancel is a no-op if the tabs-level hook got there first.
  const status = query.data?.status
  const cancelledBy = query.data?.cancelledBy
  useEffect(() => {
    if (status !== 'cancelled' || ownCancel.current) return
    announceRemoteCancel(id, cancelledBy)
    queryClient.invalidateQueries({ queryKey: ACTIVE_TRIP_KEY })
    queryClient.invalidateQueries({ queryKey: TRIP_QUEUE_KEY })
  }, [status, cancelledBy, id, queryClient])

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
