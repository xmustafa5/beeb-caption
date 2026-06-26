// hooks/use-nafarat-room.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'
import { getRoomMembers, type DropoffZone, type PickupZoneCount } from '@/services/abriyah-members'
import { getRoom, type Room } from '@/services/abriyah-rooms'
import { getRoomTrips, startTrip, completeTrip, type Trip, type TripStatus } from '@/services/captain-trips'
import type { LatLng } from '@/hooks/use-current-location'

export interface RiderSeat {
  riderId: string
  name: string
  phone: string
  pickup: LatLng
  dropoff: LatLng
  fareIqd: number
  distanceKm: number
  tripId: string | null
  tripStatus: TripStatus | null
}

export interface NafaratRoom {
  room: Room | null
  dropoffZone: DropoffZone | null
  pickupBreakdown: PickupZoneCount[]
  seats: RiderSeat[]
  isLoading: boolean
  isError: boolean
  pickup: (tripId: string) => Promise<void>
  dropoff: (tripId: string) => Promise<void>
  busyTripId: string | null
}

/**
 * Drives one dispatched Abriyah room. Polls the room, the members roster, and the
 * captain's pooled trips; joins members↔trips by rider id into RiderSeat[]; and
 * exposes per-rider pickup/dropoff that advance each trip and refetch.
 */
export function useNafaratRoom(roomId: string): NafaratRoom {
  const captainId = useAuthStore((s) => s.captain?.id)
  const qc = useQueryClient()

  const roomQ = useQuery({
    queryKey: ['nafarat', 'room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
    refetchInterval: 5000,
  })
  const membersQ = useQuery({
    queryKey: ['nafarat', 'members', roomId],
    queryFn: () => getRoomMembers(roomId),
    enabled: !!roomId,
    refetchInterval: 10000,
  })
  const tripsKey = ['nafarat', 'trips', roomId] as const
  const tripsQ = useQuery({
    queryKey: tripsKey,
    queryFn: () => getRoomTrips(captainId as string, roomId),
    enabled: !!roomId && !!captainId,
    refetchInterval: 5000,
  })

  const seats: RiderSeat[] = (membersQ.data?.members ?? []).map((m) => {
    const trip = (tripsQ.data ?? []).find((tp) => tp.riderId === m.riderId)
    return {
      riderId: m.riderId,
      name: m.name,
      phone: m.phone,
      pickup: m.pickup,
      dropoff: m.dropoff,
      fareIqd: m.fareIqd,
      distanceKm: m.distanceKm,
      tripId: trip?.id ?? null,
      tripStatus: trip?.status ?? null,
    }
  })

  const advance = useMutation({
    mutationFn: ({ tripId, action }: { tripId: string; action: 'pickup' | 'dropoff' }) =>
      action === 'pickup' ? startTrip(tripId) : completeTrip(tripId),
    // Optimistically bump the acted-on rider's trip status so the card flips instantly;
    // reconcile (or roll back) on settle.
    onMutate: async ({ tripId, action }) => {
      await qc.cancelQueries({ queryKey: tripsKey })
      const prev = qc.getQueryData<Trip[]>(tripsKey)
      qc.setQueryData<Trip[]>(tripsKey, (old) =>
        (old ?? []).map((tp) =>
          tp.id === tripId ? { ...tp, status: action === 'pickup' ? 'in_progress' : 'completed' } : tp,
        ),
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(tripsKey, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: tripsKey }),
  })

  return {
    room: roomQ.data ?? null,
    dropoffZone: membersQ.data?.dropoffZone ?? null,
    pickupBreakdown: membersQ.data?.pickupBreakdown ?? [],
    seats,
    isLoading: roomQ.isLoading || membersQ.isLoading,
    isError: roomQ.isError || membersQ.isError,
    pickup: (tripId) => advance.mutateAsync({ tripId, action: 'pickup' }).then(() => undefined),
    dropoff: (tripId) => advance.mutateAsync({ tripId, action: 'dropoff' }).then(() => undefined),
    busyTripId: advance.isPending ? (advance.variables?.tripId ?? null) : null,
  }
}
