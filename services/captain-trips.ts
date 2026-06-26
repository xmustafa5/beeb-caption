// services/captain-trips.ts
import { api } from '@/lib/api'

export type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
export type TripType = 'regular' | 'abriyah'
export type CancelReason = 'changed_mind' | 'wait_too_long' | 'wrong_pickup' | 'safety' | 'other'

export interface Trip {
  id: string
  tripType: TripType
  status: TripStatus
  riderId: string
  captainId?: string | null
  roomId?: string | null
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  fareIqd: number
  distanceKm: number
  cancellationReason?: string | null
  completedAt?: string | null
}

export interface ProxySession {
  riderProxyNumber: string
  captainProxyNumber: string
  expiresAt: string
}

interface BackendTrip {
  id: string
  trip_type: string
  status: string
  rider_id: string
  captain_id?: string | null
  room_id?: string | null
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  fare_iqd: number
  distance_km: number
  cancellation_reason?: string | null
  completed_at?: string | null
}

function toTrip(b: BackendTrip): Trip {
  return {
    id: b.id,
    tripType: b.trip_type === 'abriyah' ? 'abriyah' : 'regular',
    status: (b.status as TripStatus) ?? 'accepted',
    riderId: b.rider_id,
    captainId: b.captain_id ?? null,
    roomId: b.room_id ?? null,
    pickupLat: b.pickup_lat,
    pickupLng: b.pickup_lng,
    dropoffLat: b.dropoff_lat,
    dropoffLng: b.dropoff_lng,
    fareIqd: b.fare_iqd,
    distanceKm: b.distance_km,
    cancellationReason: b.cancellation_reason ?? null,
    completedAt: b.completed_at ?? null,
  }
}

export async function getTrip(id: string): Promise<Trip> {
  const { data } = await api.get<BackendTrip>(`/api/trips/${id}`)
  return toTrip(data)
}

/** The captain's in-flight statuses — a trip in either is "on the road right now". */
const ACTIVE_TRIP_STATUSES: TripStatus[] = ['accepted', 'in_progress']

/**
 * The captain's current active trip, or null. Used to resume the live-trip screen
 * after a relaunch. There's no dedicated "my active trip" endpoint, so we filter
 * the trips list by captain + each active status (server is the source of truth:
 * a trip completed/cancelled while the app was closed simply isn't returned).
 */
export async function getActiveCaptainTrip(captainId: string): Promise<Trip | null> {
  for (const status of ACTIVE_TRIP_STATUSES) {
    const { data } = await api.get<{ items: BackendTrip[] }>('/api/trips', {
      params: { captain_id: captainId, status, per_page: 1 },
    })
    const first = data.items?.[0]
    if (first) return toTrip(first)
  }
  return null
}

/** Pool statuses to scan for a room's rider trips (accepted/in_progress/completed). */
const POOL_TRIP_STATUSES: TripStatus[] = ['accepted', 'in_progress', 'completed']

/**
 * All of the captain's trips that belong to one Abriyah room. There is no
 * room→trips endpoint and no room_id filter on /api/trips, so we scan the
 * captain's trips across the pool statuses and keep the ones whose room_id matches.
 */
export async function getRoomTrips(captainId: string, roomId: string): Promise<Trip[]> {
  const out: Trip[] = []
  for (const status of POOL_TRIP_STATUSES) {
    const { data } = await api.get<{ items: BackendTrip[] }>('/api/trips', {
      params: { captain_id: captainId, status, per_page: 50 },
    })
    for (const b of data.items ?? []) {
      const trip = toTrip(b)
      if (trip.roomId === roomId) out.push(trip)
    }
  }
  return out
}

/** Cue at pickup — no status change. */
export async function arriveTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/arrive`)
}

/** accepted → in_progress. */
export async function startTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/start`)
}

/** in_progress → completed (charges rider best-effort). */
export async function completeTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/complete`)
}

/** Captain cancel — allowed from requested/accepted only (else 400). */
export async function cancelTrip(id: string, reason: CancelReason, comment?: string): Promise<void> {
  await api.post(`/api/trips/${id}/cancel`, { reason, ...(comment ? { comment } : {}) })
}

/** Masked call session (lazily allocated; trip must be accepted/in_progress + have a captain). */
export async function getProxy(id: string): Promise<ProxySession> {
  const { data } = await api.get<{
    rider_proxy_number: string
    captain_proxy_number: string
    expires_at: string
  }>(`/api/captain/trips/${id}/proxy`)
  return {
    riderProxyNumber: data.rider_proxy_number,
    captainProxyNumber: data.captain_proxy_number,
    expiresAt: data.expires_at,
  }
}

/** Captain rates the rider after completion (stars 1-5). One per trip (409 repeat). */
export async function rateRider(id: string, stars: number, comment?: string): Promise<void> {
  await api.post(`/api/trips/${id}/ratings`, { stars, ...(comment ? { comment } : {}) })
}
