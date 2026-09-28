// services/captain-queue.ts
import { api } from '@/lib/api'
import { toAsciiDigits } from '@/lib/digits'
import { roomDeadlineMs } from '@/lib/room-countdown'
import { toFiniteNumber } from '@/lib/to-number'

export type OfferType = 'trip' | 'room'
/** `women_only` = every rider in the room is a woman. Any captain may take it. */
export type RoomType = 'mixed' | 'women_only'
/** What a trip offer carries. Rooms have no trip type (`null`). */
export type OfferTripType = 'regular' | 'box'

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
  /**
   * Already includes the Box fee for a Box offer — the app never adds it. For a
   * room this is ONE rider's fare (the oldest member's); see `totalFareIqd`.
   */
  fareIqd: number
  /** Room offers: riders in the room right now. Undefined for trips (and older backends). */
  riderCount?: number
  /** Room offers: every rider's fare added up — what the captain earns for the room. */
  totalFareIqd?: number
  /**
   * Room offers: the room's deadline (RFC3339). After it the room expires and
   * its riders' trips are cancelled. Undefined for trips (and older backends).
   */
  expiresAt?: string
  /** Room offers: whole seconds left when the backend built this offer. */
  expiresInSeconds?: number
  /**
   * Room offers: the local-clock instant (ms) the room expires — the moment the
   * offer arrived plus `expiresInSeconds` (`expiresAt` only as the fallback), so
   * a wrong phone clock can't skew it. The card counts down to this. Undefined
   * when the backend sent no deadline: the card then shows no countdown.
   */
  deadlineMs?: number
  createdAt: string
  /** `'regular'` or `'box'` for a trip offer, `null` for a room offer. */
  tripType: OfferTripType | null
  /**
   * Box offers only: what the sender is sending (full text, up to 500 chars)
   * and a presigned GET of the FIRST photo. The URL expires after ~5 minutes
   * and is re-signed on every queue poll, so render it with a stable cacheKey.
   * The recipient's phone is never part of an offer.
   */
  boxDescription?: string
  boxPhotoUrl?: string
  /** Number of item photos; 0 for everything that isn't a Box. */
  boxPhotoCount: number
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
  rider_count?: number | null
  total_fare_iqd?: number | null
  expires_at?: string | null
  expires_in_seconds?: number | null
  created_at: string
  trip_type?: string | null
  box_description?: string | null
  box_photo_url?: string | null
  box_photo_count?: number | null
}

/**
 * Explicit narrowing: only a literal `'box'` is a Box. A trip offer from a
 * backend that predates the field (no `trip_type`) is a regular trip.
 */
function toOfferTripType(b: BackendOffer): OfferTripType | null {
  if (b.offer_type === 'room') return null
  return b.trip_type === 'box' ? 'box' : 'regular'
}

function toOffer(b: BackendOffer, receivedAtMs: number): CaptainOffer {
  const tripType = toOfferTripType(b)
  const isBox = tripType === 'box'
  const isRoom = tripType === null
  const expiresAt = isRoom && b.expires_at ? b.expires_at : undefined
  const expiresInSeconds = isRoom ? toFiniteNumber(b.expires_in_seconds) : undefined
  const photoUrl = isBox && b.box_photo_url ? b.box_photo_url : undefined
  const photoCount = isBox && typeof b.box_photo_count === 'number' ? Math.max(0, b.box_photo_count) : 0
  return {
    offerType: b.offer_type === 'room' ? 'room' : 'trip',
    id: b.id,
    zoneId: b.zone_id ?? null,
    roomType: (b.room_type as RoomType | null) ?? null,
    pickupLat: b.pickup_lat,
    pickupLng: b.pickup_lng,
    dropoffLat: b.dropoff_lat,
    dropoffLng: b.dropoff_lng,
    // Western digits in every language (the backend fills these from POI names).
    pickupAddress: b.pickup_address ? toAsciiDigits(b.pickup_address) : undefined,
    dropoffAddress: b.dropoff_address ? toAsciiDigits(b.dropoff_address) : undefined,
    fareIqd: b.fare_iqd,
    riderCount: tripType === null && typeof b.rider_count === 'number' ? b.rider_count : undefined,
    totalFareIqd: tripType === null && typeof b.total_fare_iqd === 'number' ? b.total_fare_iqd : undefined,
    expiresAt,
    expiresInSeconds,
    deadlineMs: isRoom ? roomDeadlineMs({ expiresInSeconds, expiresAt }, receivedAtMs) : undefined,
    createdAt: b.created_at,
    tripType,
    boxDescription: isBox && b.box_description ? toAsciiDigits(b.box_description) : undefined,
    boxPhotoUrl: photoUrl,
    // A URL with a zero count would hide the "+N" math; trust the URL.
    boxPhotoCount: photoUrl ? Math.max(1, photoCount) : photoCount,
  }
}

/** Pending regular + Box trips and open rooms that are ready for a captain (women-only rooms included). */
export async function getTripQueue(): Promise<CaptainOffer[]> {
  const { data } = await api.get<{ offers: BackendOffer[] }>('/api/captain/trip-queue')
  // A room's countdown runs from the moment this response arrived.
  const receivedAtMs = Date.now()
  return (data.offers ?? []).map((b) => toOffer(b, receivedAtMs))
}

/** Accept a regular or Box trip. 409 if already taken or the captain has an active trip. */
export async function acceptTrip(tripId: string): Promise<void> {
  await api.post(`/api/trips/${tripId}/accept`)
}

/**
 * Accept (dispatch) an Abriyah room: every rider's trip becomes this captain's.
 * 400 not open any more / 403 no Nafarat access / 409 already on a trip or the room is not ready.
 */
export async function acceptRoom(roomId: string): Promise<void> {
  await api.post(`/api/abriyah/rooms/${roomId}/accept`)
}
