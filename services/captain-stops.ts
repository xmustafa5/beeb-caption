// services/captain-stops.ts
import { api } from '@/lib/api'

export interface TripStop {
  id: string
  lat: number
  lng: number
  seq: number
  status: string
  reachedAt?: string | null
}

/**
 * List a trip's stops. GATED: there is no captain-facing stops-list endpoint
 * yet (BACKEND_ISSUES #7 — the rider stops endpoint 403s for a captain token,
 * and the Trip object embeds no stops). Returns [] until the backend ships a
 * captain stops-list; then this becomes one `api.get` call and the stops panel
 * activates.
 */
export async function getStops(_tripId: string): Promise<TripStop[]> {
  return []
}

/** Mark a stop reached (captain on the trip). Already supported by the backend. */
export async function reachStop(tripId: string, stopId: string): Promise<void> {
  await api.post(`/api/captain/trips/${tripId}/stops/${stopId}/reach`, {})
}
