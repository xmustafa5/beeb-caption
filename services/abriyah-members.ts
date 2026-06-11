// services/abriyah-members.ts
import { api } from '@/lib/api'

export interface RoomMember {
  riderId: string
  name: string
  fareIqd: number
  distanceKm: number
}

interface BackendMember {
  rider_id: string
  name: string
  fare_iqd: number
  distance_km: number
}

/** Members of a dispatched Abriyah room (assigned captain only; 403 otherwise). */
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data } = await api.get<{ members: BackendMember[] }>(
    `/api/abriyah/rooms/${roomId}/members`,
  )
  return (data.members ?? []).map((m) => ({
    riderId: m.rider_id,
    name: m.name,
    fareIqd: m.fare_iqd,
    distanceKm: m.distance_km,
  }))
}
