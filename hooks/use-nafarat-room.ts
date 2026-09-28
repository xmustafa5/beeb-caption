// hooks/use-nafarat-room.ts
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useCaptainPresence } from '@/providers/captain-presence'
import { ACTIVE_TRIP_KEY } from '@/hooks/use-active-trip'
import { claimCancelAnnouncement, releaseCancelAnnouncement } from '@/hooks/use-remote-trip-cancel'
import { getRoomMembers, type DropoffZone, type PickupZoneCount, type RoomMember } from '@/services/abriyah-members'
import { getRoom, type Room } from '@/services/abriyah-rooms'
import {
  getRoomTrips,
  arriveTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  type CancelReason,
  type Trip,
  type TripStatus,
} from '@/services/captain-trips'
import type { LatLng } from '@/hooks/use-current-location'
import { parseApiError } from '@/lib/api'
import {
  mergeRoster,
  nafaratRideState,
  seatTripStatus,
  type NafaratRideState,
  type RosterEntry,
} from '@/lib/nafarat-room-state'

export type { NafaratRideState } from '@/lib/nafarat-room-state'

export interface RiderSeat {
  riderId: string
  /**
   * 1-based join order, fixed for the whole ride: the card's badge, the map pin
   * and the "Rider N" fallback all use it, and it never shifts when another
   * rider leaves the room.
   */
  seatNumber: number
  /** Display name: the rider's own, or a numbered fallback ("Rider 2"). */
  name: string
  phone: string
  pickup: LatLng
  dropoff: LatLng
  fareIqd: number
  distanceKm: number
  tripId: string | null
  tripStatus: TripStatus | null
  /** The captain pressed Arrived for this rider (a cue; the trip stays `accepted`). */
  arrived: boolean
}

export interface NafaratRoom {
  room: Room | null
  dropoffZone: DropoffZone | null
  pickupBreakdown: PickupZoneCount[]
  seats: RiderSeat[]
  state: NafaratRideState
  /** Riders not cancelled, and how many of them were dropped off. */
  riding: number
  done: number
  /** Sum of the dropped-off riders' fares. */
  collectedIqd: number
  arrive: (tripId: string) => Promise<void>
  pickup: (tripId: string) => Promise<void>
  dropoff: (tripId: string) => Promise<void>
  cancel: (tripId: string, reason: CancelReason, comment?: string) => Promise<void>
  /** Trips with a request in flight: their buttons stay busy until it settles. */
  busyTripIds: ReadonlySet<string>
}

type SeatAction =
  | { tripId: string; action: 'arrive' | 'pickup' | 'dropoff' }
  | { tripId: string; action: 'cancel'; reason: CancelReason; comment?: string }

/**
 * What must outlive the screen: leaving it for Home and coming back through the
 * banner or the launch resume remounts the hook.
 * - `roster`: every rider seen, numbered in join order. After dispatch (the
 *   only state this screen shows) a rider who cancels stays on `/members` and
 *   shows as cancelled from the trips list, so the numbers hold on their own;
 *   the roster is kept only as a guard, so the others would not be renumbered
 *   mid-ride (pin 3 turning into pin 2) if a backend ever removed a member
 *   after dispatch.
 * - `arrived`: trips the captain pressed Arrived for. The backend keeps no
 *   such state, so forgetting it would hide Pick up again and make the captain
 *   send each rider a second "your captain is here" push.
 */
interface RoomMemory {
  roster: readonly RosterEntry<RoomMember>[]
  arrived: ReadonlySet<string>
}
const memory = new Map<string, RoomMemory>()

function remember(roomId: string, patch: Partial<RoomMemory>) {
  const prev = memory.get(roomId) ?? { roster: [], arrived: new Set<string>() }
  // A captain drives a handful of rooms per launch; this only bounds a pathological session.
  if (!memory.has(roomId) && memory.size >= 20) memory.clear()
  memory.set(roomId, { ...prev, ...patch })
}

/** 403/404: the server answered "not yours / not there" — asking again won't change it. */
function isRefusal(err: unknown): boolean {
  const status = parseApiError(err).status
  return status === 403 || status === 404
}

function runAction(a: SeatAction): Promise<void> {
  switch (a.action) {
    case 'arrive':
      return arriveTrip(a.tripId)
    case 'pickup':
      return startTrip(a.tripId)
    case 'dropoff':
      return completeTrip(a.tripId)
    case 'cancel':
      return cancelTrip(a.tripId, a.reason, a.comment)
  }
}

/**
 * Drives one dispatched Nafarat room.
 *
 * Three reads, joined by rider id into RiderSeat[]:
 * - `GET /api/abriyah/rooms/{id}` → `{room, members}`: the room status/type and
 *   each seat's trip id (assigned captain may read it).
 * - `GET /api/abriyah/rooms/{id}/members`: names, phones, pins, zones.
 * - the captain's own trips of this room (`/api/trips?captain_id=me`): each
 *   rider's live trip status, which neither room read carries. It also backs up
 *   the seat → trip link when the room read is refused (older backends let only
 *   riders read a room).
 *
 * Every rider is a separate trip: Arrived → Pick up (start) → Drop off
 * (complete), or a per-rider cancel for a no-show. Polling stops once the ride
 * is over.
 */
export function useNafaratRoom(roomId: string): NafaratRoom {
  const { t } = useTranslation()
  const captainId = useAuthStore((s) => s.captain?.id)
  const { lastTripUpdate } = useCaptainPresence()
  const qc = useQueryClient()
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(() => memory.get(roomId)?.arrived ?? new Set())
  const [roster, setRoster] = useState<readonly RosterEntry<RoomMember>[]>(() => memory.get(roomId)?.roster ?? [])
  // Every trip with a leg / cancel request in flight. One mutation serves all
  // the seats, so its own `variables` only know the latest call.
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  // Once the ride is over nothing changes any more — stop polling.
  const [over, setOver] = useState(false)

  const roomKey = ['nafarat', 'room', roomId] as const
  const membersKey = ['nafarat', 'members', roomId] as const
  const tripsKey = ['nafarat', 'trips', roomId] as const

  const roomQ = useQuery({
    queryKey: roomKey,
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
    // A 403/404 here is an answer, not a blip (an older backend let only riders
    // read a room): the screen runs on the roster and the trips without it, so
    // stop asking instead of hammering the refusal.
    refetchInterval: (q) => (over || isRefusal(q.state.error) ? false : 10_000),
    retry: (count, err) => !isRefusal(err) && count < 2,
  })
  const membersQ = useQuery({
    queryKey: membersKey,
    queryFn: () => getRoomMembers(roomId),
    enabled: !!roomId,
    refetchInterval: over ? false : 10_000,
  })
  const tripsQ = useQuery({
    queryKey: tripsKey,
    queryFn: () => getRoomTrips(captainId as string, roomId),
    enabled: !!roomId && !!captainId,
    refetchInterval: over ? false : 5_000,
  })

  // A trip frame over the captain socket (a rider cancelling mid-ride, say)
  // lands on the seat at once instead of on the next poll. Only frames that
  // arrive while the screen is mounted: on a remount the provider still holds
  // the last frame, which may be minutes old (a socket that was down since
  // would make it write back a status the trip has long left).
  const trips = tripsQ.data
  const seenUpdate = useRef(lastTripUpdate)
  useEffect(() => {
    if (lastTripUpdate === seenUpdate.current) return
    seenUpdate.current = lastTripUpdate
    if (!lastTripUpdate || !trips?.some((tp) => tp.id === lastTripUpdate.id)) return
    qc.setQueryData<Trip[]>(tripsKey, (old) =>
      (old ?? []).map((tp) =>
        tp.id === lastTripUpdate.id ? { ...tp, status: lastTripUpdate.status as TripStatus } : tp,
      ),
    )
    void qc.invalidateQueries({ queryKey: tripsKey })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTripUpdate])

  // Seat numbers are handed out once, in join order, and kept (see RoomMemory).
  // The merge runs in render so a new rider shows at once; the effect stores it.
  const members = membersQ.data?.members
  const seen = members ? mergeRoster(roster, members) : roster
  useEffect(() => {
    if (!members) return
    setRoster((prev) => {
      const next = mergeRoster(prev, members)
      remember(roomId, { roster: next })
      return next
    })
  }, [members, roomId])

  const present = members ? new Set(members.map((m) => m.riderId)) : null
  const roomSeats = roomQ.data?.seats ?? []
  const seats: RiderSeat[] = seen.map(({ member: m, seatNumber }) => {
    const tripId =
      roomSeats.find((rs) => rs.riderId === m.riderId)?.tripId ??
      (trips ?? []).find((tp) => tp.riderId === m.riderId)?.id ??
      null
    const trip = tripId ? (trips ?? []).find((tp) => tp.id === tripId) : undefined
    // After dispatch a rider who cancels stays on `/members` and the trips list
    // says `cancelled`. A rider gone from `/members` is only a guard for a
    // backend that removes members after dispatch (see `seatTripStatus`).
    const left = present != null && !present.has(m.riderId)
    const tripStatus = seatTripStatus(left, trip?.status)
    return {
      riderId: m.riderId,
      seatNumber,
      name: m.name ?? t('captain.nafarat.riderN', { n: seatNumber }),
      phone: m.phone,
      pickup: m.pickup,
      dropoff: m.dropoff,
      fareIqd: m.fareIqd,
      distanceKm: m.distanceKm,
      tripId,
      tripStatus,
      arrived: tripId != null && arrivedIds.has(tripId),
    }
  })

  const ridingSeats = seats.filter((s) => s.tripStatus !== 'cancelled')
  const doneSeats = ridingSeats.filter((s) => s.tripStatus === 'completed')
  const collectedIqd = doneSeats.reduce((sum, s) => sum + s.fareIqd, 0)
  // A failed first read counts as known-but-empty: the seats then show without
  // a status (buttons still work off the room's trip ids) while polling retries.
  const state: NafaratRideState = nafaratRideState({
    membersLoaded: !!membersQ.data,
    membersError: membersQ.isError,
    roomStatus: roomQ.data?.room.status,
    tripsKnown: trips !== undefined || tripsQ.isError,
    seatStatuses: seats.map((s) => s.tripStatus),
  })

  const finished = state === 'done' || state === 'ended'
  useEffect(() => {
    setOver(finished)
  }, [finished])

  const act = useMutation({
    mutationFn: runAction,
    // Flip the card as soon as the captain taps; reconcile (or roll back) on settle.
    onMutate: async (a) => {
      setPending((prev) => new Set(prev).add(a.tripId))
      if (a.action === 'cancel') {
        // Our own cancel must not come back as a "the rider cancelled" alert.
        claimCancelAnnouncement(a.tripId)
        return { prev: undefined }
      }
      if (a.action === 'arrive') return { prev: undefined }
      await qc.cancelQueries({ queryKey: tripsKey })
      const prev = qc.getQueryData<Trip[]>(tripsKey)
      const status: TripStatus = a.action === 'pickup' ? 'in_progress' : 'completed'
      qc.setQueryData<Trip[]>(tripsKey, (old) =>
        (old ?? []).map((tp) => (tp.id === a.tripId ? { ...tp, status } : tp)),
      )
      return { prev }
    },
    onSuccess: (_data, a) => {
      if (a.action === 'arrive') {
        setArrivedIds((prev) => {
          const next = new Set(prev).add(a.tripId)
          remember(roomId, { arrived: next })
          return next
        })
      } else if (a.action === 'cancel') {
        qc.setQueryData<Trip[]>(tripsKey, (old) =>
          (old ?? []).map((tp) => (tp.id === a.tripId ? { ...tp, status: 'cancelled' } : tp)),
        )
      }
    },
    onError: (_err, a, ctx) => {
      if (ctx?.prev) qc.setQueryData(tripsKey, ctx.prev)
      // The cancel did not happen: a later real cancel of this rider (by them,
      // or by support) must still be announced.
      if (a.action === 'cancel') releaseCancelAnnouncement(a.tripId)
    },
    onSettled: (_data, _err, a) => {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(a.tripId)
        return next
      })
      void qc.invalidateQueries({ queryKey: tripsKey })
      if (a.action === 'cancel') {
        void qc.invalidateQueries({ queryKey: membersKey })
        void qc.invalidateQueries({ queryKey: roomKey })
      }
      // The home "resume trip" banner reads the captain's active trip; a drop-off
      // or cancel may have been the last one.
      if (a.action !== 'arrive') void qc.invalidateQueries({ queryKey: ACTIVE_TRIP_KEY })
    },
  })

  return {
    room: roomQ.data?.room ?? null,
    dropoffZone: membersQ.data?.dropoffZone ?? null,
    pickupBreakdown: membersQ.data?.pickupBreakdown ?? [],
    seats,
    state,
    riding: ridingSeats.length,
    done: doneSeats.length,
    collectedIqd,
    arrive: (tripId) => act.mutateAsync({ tripId, action: 'arrive' }),
    pickup: (tripId) => act.mutateAsync({ tripId, action: 'pickup' }),
    dropoff: (tripId) => act.mutateAsync({ tripId, action: 'dropoff' }),
    cancel: (tripId, reason, comment) => act.mutateAsync({ tripId, action: 'cancel', reason, comment }),
    busyTripIds: pending,
  }
}
