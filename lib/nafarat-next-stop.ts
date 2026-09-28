import type { LatLng } from '@/hooks/use-current-location'
import { nearestOf } from '@/lib/nav-links'

/** What the next-stop rule needs from a room seat (see `RiderSeat`). */
export interface SeatForRoute {
  riderId: string
  name: string
  pickup: LatLng
  dropoff: LatLng
  tripStatus: string | null
}

export interface NextStop extends LatLng {
  /** Whose stop this is, so the screen can put that rider's card first. */
  riderId: string
  name: string
  kind: 'pickup' | 'dropoff'
}

/**
 * Where a Nafarat captain drives next: every rider is picked up first — always
 * the closest one still waiting — and only then dropped off, closest first.
 * Riders who cancelled or were already dropped off are skipped. Call it again
 * after each pickup / drop-off, from wherever the car is by then; `from = null`
 * (no GPS fix yet) falls back to the first rider in the list.
 */
export function nextNafaratStop(seats: SeatForRoute[], from: LatLng | null): NextStop | null {
  const live = seats.filter((s) => s.tripStatus !== 'cancelled' && s.tripStatus !== 'completed')
  const waiting = live.filter((s) => s.tripStatus !== 'in_progress')
  const stops: NextStop[] =
    waiting.length > 0
      ? waiting.map((s) => ({ ...s.pickup, riderId: s.riderId, name: s.name, kind: 'pickup' }))
      : live.map((s) => ({ ...s.dropoff, riderId: s.riderId, name: s.name, kind: 'dropoff' }))
  return (from && nearestOf(from, stops)) || stops[0] || null
}
