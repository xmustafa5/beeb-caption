// lib/trip-next-point.ts
// Where a captain on a live trip goes next. Pure, so the order can be unit tested.
import type { LatLng } from '@/hooks/use-current-location'
import type { TripStop } from '@/services/captain-stops'

export type NextPoint =
  | { kind: 'pickup' }
  | { kind: 'stop'; stop: TripStop; total: number }
  | { kind: 'dropoff' }

/**
 * The pickup until the rider is aboard, then the stops in the order the rider
 * booked them (that order is what the fare covers), then the dropoff.
 */
export function nextPoint(riderAboard: boolean, stops: TripStop[]): NextPoint {
  if (!riderAboard) return { kind: 'pickup' }
  const pending = stops
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.seq - b.seq)
  return pending[0] ? { kind: 'stop', stop: pending[0], total: stops.length } : { kind: 'dropoff' }
}

/** About 400 m: the tightest the map frames a leg, so the streets stay readable. */
const MIN_LEG_SPAN_DEG = 0.004

/**
 * The two corners the map frames for one leg. A captain already at the target
 * would otherwise zoom in until a single building fills the screen.
 */
export function legFrame(from: LatLng, to: LatLng): LatLng[] {
  const midLat = (from.latitude + to.latitude) / 2
  const midLng = (from.longitude + to.longitude) / 2
  const halfLat = Math.max(Math.abs(from.latitude - to.latitude), MIN_LEG_SPAN_DEG) / 2
  const halfLng = Math.max(Math.abs(from.longitude - to.longitude), MIN_LEG_SPAN_DEG) / 2
  return [
    { latitude: midLat - halfLat, longitude: midLng - halfLng },
    { latitude: midLat + halfLat, longitude: midLng + halfLng },
  ]
}
