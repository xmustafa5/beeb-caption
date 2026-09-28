import { api } from '@/lib/api'

export type RoomStatus = 'open' | 'locked' | 'dispatched' | 'expired'
export type RoomType = 'mixed' | 'women_only'

export interface Room {
  id: string
  status: RoomStatus
  /** `women_only` = every rider in the car is a woman. The captain can be anyone. */
  roomType: RoomType
  maxRiders: number
  riderCount: number
  captainId: string | null
  expiresAt: string
  dispatchedAt: string | null
}

/** One seat of the room: which rider holds it and which trip carries that rider. */
export interface RoomSeat {
  riderId: string
  /** Null only for the instant between the seat insert and the trip link. */
  tripId: string | null
  fareIqd: number
  distanceKm: number
}

export interface RoomDetail {
  room: Room
  /** Seats in join order. */
  seats: RoomSeat[]
}

interface BackendRoom {
  id: string
  status: string
  room_type?: string | null
  max_riders: number
  rider_count: number
  captain_id?: string | null
  expires_at: string
  dispatched_at?: string | null
}

interface BackendRoomMember {
  rider_id: string
  trip_id?: string | null
  fare_iqd: number
  distance_km: number
}

/** `GET /api/abriyah/rooms/{id}` answers `{room, members}` — never a bare room. */
interface BackendRoomDetail {
  room: BackendRoom
  members?: BackendRoomMember[] | null
}

const ROOM_STATUSES: readonly RoomStatus[] = ['open', 'locked', 'dispatched', 'expired']

function toRoomStatus(v: string): RoomStatus {
  return (ROOM_STATUSES as readonly string[]).includes(v) ? (v as RoomStatus) : 'open'
}

/**
 * The room a captain is driving: its status and type, plus each seat's trip id.
 * Readable by the room's riders and by the captain assigned to it (403 for any
 * other captain, 404 for an unknown id).
 */
export async function getRoom(roomId: string): Promise<RoomDetail> {
  const { data } = await api.get<BackendRoomDetail>(`/api/abriyah/rooms/${roomId}`)
  const r = data.room
  return {
    room: {
      id: r.id,
      status: toRoomStatus(r.status),
      roomType: r.room_type === 'women_only' ? 'women_only' : 'mixed',
      maxRiders: r.max_riders,
      riderCount: r.rider_count,
      captainId: r.captain_id ?? null,
      expiresAt: r.expires_at,
      dispatchedAt: r.dispatched_at ?? null,
    },
    seats: (data.members ?? []).map((m) => ({
      riderId: m.rider_id,
      tripId: m.trip_id ?? null,
      fareIqd: m.fare_iqd,
      distanceKm: m.distance_km,
    })),
  }
}
