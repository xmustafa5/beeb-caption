// services/captain-stops.ts
import { api } from '@/lib/api'

export type TripStopStatus = 'pending' | 'reached'

export interface TripStop {
  id: string
  lat: number
  lng: number
  seq: number
  status: TripStopStatus
  address?: string | null
  reachedAt?: string | null
}

interface BackendTripStop {
  id: string
  trip_id: string
  seq: number
  lat: number
  lng: number
  status: string
  address?: string | null
  reached_at?: string | null
  created_at: string
}

function toTripStop(b: BackendTripStop): TripStop {
  return {
    id: b.id,
    lat: b.lat,
    lng: b.lng,
    seq: b.seq,
    status: b.status === 'reached' ? 'reached' : 'pending',
    address: b.address ?? null,
    reachedAt: b.reached_at ?? null,
  }
}

/**
 * List a trip's stops for the assigned captain, in visit order (seq 1..3).
 * `GET /api/captain/trips/{trip_id}/stops` → 200 `TripStop[]` (possibly empty).
 * Assigned-captain-only (403 otherwise); 404 if no such trip.
 */
export async function getStops(tripId: string): Promise<TripStop[]> {
  const { data } = await api.get<BackendTripStop[]>(`/api/captain/trips/${tripId}/stops`)
  return (data ?? []).map(toTripStop).sort((a, b) => a.seq - b.seq)
}

/** Mark a stop reached (captain on the trip). Pending stops only (already-reached → 409). */
export async function reachStop(tripId: string, stopId: string): Promise<void> {
  await api.post(`/api/captain/trips/${tripId}/stops/${stopId}/reach`, {})
}
