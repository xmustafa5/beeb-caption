import { api } from '@/lib/api'

export type RoomStatus = 'open' | 'locked' | 'dispatched' | 'expired'

export interface Room {
  id: string
  status: RoomStatus
  maxRiders: number
  riderCount: number
  expiresAt: string
  dispatchedAt: string | null
}

interface BackendRoom {
  id: string
  status: string
  max_riders: number
  rider_count: number
  expires_at: string
  dispatched_at?: string | null
}

/** The room a captain is driving (status/counts/expiry). Any authed user may read a room id. */
export async function getRoom(roomId: string): Promise<Room> {
  const { data } = await api.get<BackendRoom>(`/api/abriyah/rooms/${roomId}`)
  return {
    id: data.id,
    status: (data.status as RoomStatus) ?? 'open',
    maxRiders: data.max_riders,
    riderCount: data.rider_count,
    expiresAt: data.expires_at,
    dispatchedAt: data.dispatched_at ?? null,
  }
}
