// services/abriyah-members.ts
import { api } from '@/lib/api'

export interface RoomMember {
  riderId: string
  name: string
  fareIqd: number
  distanceKm: number
}

/** The single dropoff (destination) zone every rider in the room shares. */
export interface DropoffZone {
  zoneId: string
  name: string
  nameAr: string
}

/**
 * How many riders are being picked up from one pickup zone. `zoneId`/`name`/
 * `nameAr` are null for the unknown-zone group (pickups outside any active zone).
 */
export interface PickupZoneCount {
  zoneId: string | null
  name: string | null
  nameAr: string | null
  riderCount: number
}

export interface RoomMembersData {
  /** Destination zone the room is keyed by (shared by all members). */
  dropoffZone: DropoffZone
  /** Per-pickup-zone rider counts (cross-zone pools span several pickup zones). */
  pickupBreakdown: PickupZoneCount[]
  members: RoomMember[]
}

interface BackendMember {
  rider_id: string
  name: string
  fare_iqd: number
  distance_km: number
}

interface BackendRoomMembersResponse {
  room_id: string
  dropoff_zone: { zone_id: string; name: string; name_ar: string }
  pickup_breakdown: Array<{
    zone_id: string | null
    name: string | null
    name_ar: string | null
    rider_count: number
  }>
  members: BackendMember[]
}

/**
 * Members of a dispatched Abriyah room (assigned captain only; 403 otherwise).
 * Returns the shared dropoff zone, a per-pickup-zone rider breakdown, and the
 * flat roster. Rooms are keyed by the dropoff zone, but riders may be picked up
 * across several zones, so the breakdown shows where each rider boards.
 */
export async function getRoomMembers(roomId: string): Promise<RoomMembersData> {
  const { data } = await api.get<BackendRoomMembersResponse>(
    `/api/abriyah/rooms/${roomId}/members`,
  )
  return {
    dropoffZone: {
      zoneId: data.dropoff_zone.zone_id,
      name: data.dropoff_zone.name,
      nameAr: data.dropoff_zone.name_ar,
    },
    pickupBreakdown: (data.pickup_breakdown ?? []).map((p) => ({
      zoneId: p.zone_id,
      name: p.name,
      nameAr: p.name_ar,
      riderCount: p.rider_count,
    })),
    members: (data.members ?? []).map((m) => ({
      riderId: m.rider_id,
      name: m.name,
      fareIqd: m.fare_iqd,
      distanceKm: m.distance_km,
    })),
  }
}
