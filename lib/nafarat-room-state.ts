// lib/nafarat-room-state.ts
// The pure rules behind the captain's Nafarat room screen (use-nafarat-room):
// seat numbering, each seat's trip status, and where the ride stands. Kept free
// of React and of the network so they can be unit tested.
import type { TripStatus } from '@/services/captain-trips'

/**
 * Where the ride stands:
 * - `loading` / `error`: the roster has not loaded (or could not be read).
 * - `live`: at least one rider still has to be picked up or dropped off.
 * - `done`: every rider still in the car was dropped off.
 * - `ended`: nobody is left to drive (the room expired, or every rider cancelled).
 */
export type NafaratRideState = 'loading' | 'error' | 'live' | 'done' | 'ended'

/** A rider the screen has seen in this room, with the seat number they got then. */
export interface RosterEntry<M extends { riderId: string }> {
  member: M
  seatNumber: number
}

/**
 * `prev` with each rider's data refreshed from `members`, plus any new rider
 * appended with the next number (1-based, in join order). Riders missing from
 * `members` stay with their number; numbers are never reassigned, so the pins
 * and cards of the other riders never shift.
 */
export function mergeRoster<M extends { riderId: string }>(
  prev: readonly RosterEntry<M>[],
  members: readonly M[],
): RosterEntry<M>[] {
  const current = new Map(members.map((m) => [m.riderId, m]))
  const known = new Set(prev.map((e) => e.member.riderId))
  const merged = prev.map((e) => ({ member: current.get(e.member.riderId) ?? e.member, seatNumber: e.seatNumber }))
  let n = prev.reduce((max, e) => Math.max(max, e.seatNumber), 0)
  for (const m of members) {
    if (!known.has(m.riderId)) {
      known.add(m.riderId)
      merged.push({ member: m, seatNumber: ++n })
    }
  }
  return merged
}

/**
 * One seat's trip status. `goneFromRoster`: the rider was seen before but is no
 * longer on `/members`. The backend removes a member only while the room is
 * still open/locked (a leave, or a rider cancel of a waiting seat); after
 * dispatch a cancelled rider stays on `/members` and the trips list says
 * `cancelled`. So a rider gone from the roster is treated as cancelled (unless
 * their trip already completed) as a guard, in case a backend ever removes a
 * member after dispatch.
 */
export function seatTripStatus(goneFromRoster: boolean, tripStatus: TripStatus | null | undefined): TripStatus | null {
  if (goneFromRoster) return tripStatus === 'completed' ? 'completed' : 'cancelled'
  return tripStatus ?? null
}

const TERMINAL: readonly (TripStatus | null)[] = ['completed', 'cancelled']

export interface RideStateInput {
  /** `/members` answered at least once. */
  membersLoaded: boolean
  /** `/members` failed (and has not answered yet). */
  membersError: boolean
  /** The room's status from the room read, when it was readable. */
  roomStatus: string | null | undefined
  /** The captain's trips of this room answered, or failed (known-but-empty). */
  tripsKnown: boolean
  /** Each seat's trip status (see `seatTripStatus`). */
  seatStatuses: readonly (TripStatus | null)[]
}

/** Where the ride stands (see `NafaratRideState`). */
export function nafaratRideState({
  membersLoaded,
  membersError,
  roomStatus,
  tripsKnown,
  seatStatuses,
}: RideStateInput): NafaratRideState {
  if (!membersLoaded) return membersError ? 'error' : 'loading'
  if (roomStatus === 'expired') return 'ended'
  if (!tripsKnown) return 'loading'
  const everySeatFinal = seatStatuses.every((s) => TERMINAL.includes(s))
  const dropped = seatStatuses.filter((s) => s === 'completed').length
  if (seatStatuses.length === 0 || (everySeatFinal && dropped === 0)) return 'ended'
  if (everySeatFinal) return 'done'
  return 'live'
}

/** What `cancelIsPartOfRide` needs from a trip (see `Trip`). */
export interface TripForRide {
  id: string
  status: TripStatus
  tripType?: string
  roomId?: string | null
}

/**
 * True when the cancelled trip `tripId` is one rider of a Nafarat room the
 * captain is driving and the ride carries on without them, so the alert says
 * "one rider cancelled" instead of "this trip is no longer active".
 * - `roomTripLists`: the room screen's trips caches (use-nafarat-room). A list
 *   holding the trip answers alone: another rider still waiting or on board.
 * - `activeTrip`: the captain's active trip cache, the fallback once the room
 *   cache is gone (a relaunch, or a while on Home). An active Nafarat trip that
 *   is not the cancelled one means the room is still being driven.
 */
export function cancelIsPartOfRide(
  tripId: string,
  roomTripLists: readonly (readonly TripForRide[] | undefined)[],
  activeTrip: TripForRide | null | undefined,
): boolean {
  for (const trips of roomTripLists) {
    if (!trips?.some((tp) => tp.id === tripId)) continue
    return trips.some((tp) => tp.id !== tripId && (tp.status === 'accepted' || tp.status === 'in_progress'))
  }
  return (
    activeTrip != null &&
    activeTrip.id !== tripId &&
    activeTrip.tripType === 'abriyah' &&
    activeTrip.roomId != null &&
    (activeTrip.status === 'accepted' || activeTrip.status === 'in_progress')
  )
}
