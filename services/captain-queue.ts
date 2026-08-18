// services/captain-queue.ts
import { api } from '@/lib/api'

export type OfferType = 'trip' | 'room'
export type RoomType = 'mixed' | 'women_only'

export interface CaptainOffer {
  offerType: OfferType
  id: string
  zoneId?: string | null
  roomType?: RoomType | null
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  /**
   * Human-readable place names carried by the offer itself — the name the rider
   * picked, or the POI the backend resolved from the coordinates at trip
   * creation. Undefined on older trips; the card reverse-geocodes only then.
   */
  pickupAddress?: string
  dropoffAddress?: string
  fareIqd: number
  createdAt: string
}

interface BackendOffer {
  offer_type: string
  id: string
  zone_id?: string | null
  room_type?: string | null
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  pickup_address?: string | null
  dropoff_address?: string | null
  fare_iqd: number
  created_at: string
}

function toOffer(b: BackendOffer): CaptainOffer {
  return {
    offerType: b.offer_type === 'room' ? 'room' : 'trip',
    id: b.id,
    zoneId: b.zone_id ?? null,
    roomType: (b.room_type as RoomType | null) ?? null,
    pickupLat: b.pickup_lat,
    pickupLng: b.pickup_lng,
    dropoffLat: b.dropoff_lat,
    dropoffLng: b.dropoff_lng,
    pickupAddress: b.pickup_address ?? undefined,
    dropoffAddress: b.dropoff_address ?? undefined,
    fareIqd: b.fare_iqd,
    createdAt: b.created_at,
  }
}

/** Pending regular trips + open rooms (women-only pre-filtered server-side for non-female). */
export async function getTripQueue(): Promise<CaptainOffer[]> {
  const { data } = await api.get<{ offers: BackendOffer[] }>('/api/captain/trip-queue')
  return (data.offers ?? []).map(toOffer)
}

/** Accept a regular trip. 409 if already taken or the captain has an active trip. */
export async function acceptTrip(tripId: string): Promise<void> {
  await api.post(`/api/trips/${tripId}/accept`)
}

/** Accept (dispatch) an Abriyah room. 400 not-open / 403 women-only mismatch / 409 already in a room. */
export async function acceptRoom(roomId: string): Promise<void> {
  await api.post(`/api/abriyah/rooms/${roomId}/accept`)
}
