// lib/trip-route.ts
// Which screen drives a trip the captain has taken. Kept free of React so the
// launch resume, the home banner and the accept flow agree on one answer.

/** What picking the screen needs from a trip (see `Trip`). */
export interface TripRouteRef {
  id: string
  tripType?: string | null
  roomId?: string | null
}

/** What picking the screen needs from a queue offer (see `CaptainOffer`). */
export interface OfferRouteRef {
  id: string
  offerType: 'trip' | 'room'
}

export type TripScreenHref = `/(trip)/room/${string}` | `/(trip)/${string}`

/** The room screen for a Nafarat seat, the live-trip screen for anything else. */
export function tripScreenHref(trip: TripRouteRef): TripScreenHref {
  return trip.tripType === 'abriyah' && trip.roomId ? `/(trip)/room/${trip.roomId}` : `/(trip)/${trip.id}`
}

/**
 * The screen an accepted offer opens. A room offer's id IS the room id (the
 * queue lists the room, and accepting it takes every seat), so it lands on the
 * same room screen that `tripScreenHref` picks for any of that room's seats —
 * which is what lets the launch resume see the captain is already there.
 */
export function offerScreenHref(offer: OfferRouteRef): TripScreenHref {
  return offer.offerType === 'room' ? `/(trip)/room/${offer.id}` : `/(trip)/${offer.id}`
}

/**
 * True when the captain is already on the screen that drives `trip`.
 * `pathname` is expo-router's `usePathname`, which drops groups, so
 * `(chat)/[tripId]` and `(trip)/[id]` both read `/<tripId>`; `segments`
 * (`useSegments`) keeps the group and tells them apart.
 */
export function isOnTripScreen(pathname: string, segments: readonly string[], trip: TripRouteRef): boolean {
  return segments[0] === '(trip)' && pathname === tripScreenHref(trip).replace('/(trip)', '')
}

/** What the launch resume does on this render. */
export interface LaunchResume {
  /** Mark the launch check as done for this captain. */
  spend: boolean
  /** Where to send the captain, if anywhere. */
  href: TripScreenHref | null
}

const WAIT: LaunchResume = { spend: false, href: null }

/**
 * The launch resume's one decision (see useResumeActiveTrip). The check is
 * spent on the FIRST answer, trip or not: only a trip that was already live at
 * launch is resumed. Accepting an offer opens its screen itself, and the same
 * query later returning that new trip must not push the screen a second time.
 *
 * - `checkedFor`: the captain the check was last spent for, or null. A
 *   different captain (logout → login) checks again.
 * - `trip`: `undefined` = no answer yet (loading, or failed so far), `null` =
 *   no live trip.
 */
export function launchResume(
  checkedFor: string | null,
  captainId: string | undefined,
  trip: TripRouteRef | null | undefined,
  pathname: string,
  segments: readonly string[],
): LaunchResume {
  if (!captainId || trip === undefined || checkedFor === captainId) return WAIT
  if (!trip || isOnTripScreen(pathname, segments, trip)) return { spend: true, href: null }
  return { spend: true, href: tripScreenHref(trip) }
}
