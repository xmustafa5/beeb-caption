// lib/captain-frame.ts
// Routing one /ws/captain frame (services/captain-socket). Pure, so the frame
// shapes can be unit tested without a socket.
import { toFiniteNumber } from '@/lib/to-number'

export interface LocationEcho {
  longitude: number
  latitude: number
  lastPingAt?: string
  online?: boolean
}

export interface TripFrame {
  id: string
  status: string
  [k: string]: unknown
}

export interface OfferFrame {
  tripId: string
  /**
   * Set on a `beep.room.offered` frame: the Nafarat room that became ready, how
   * many riders it holds and all their fares added up. Absent on trip offers.
   */
  roomId?: string
  riderCount?: number
  totalFareIqd?: number
  /**
   * Room offers: the room's deadline — already the fresh wait the readying
   * join started — as RFC3339 and as whole seconds left when the frame was
   * built. The receiver turns them into a local deadline on arrival.
   */
  expiresAt?: string
  expiresInSeconds?: number
  [k: string]: unknown
}

export type CaptainFrame =
  | { kind: 'location'; location: LocationEcho }
  | { kind: 'offer'; offer: OfferFrame }
  | { kind: 'trip'; trip: TripFrame }

/**
 * What a raw text frame is, routed by its additive `event` field (falling back
 * to field-sniffing). Null for non-JSON and for frames the app does not use.
 */
export function parseCaptainFrame(raw: unknown): CaptainFrame | null {
  if (typeof raw !== 'string') return null
  let frame: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    frame = parsed as Record<string, unknown>
  } catch {
    return null // ignore non-JSON
  }
  const event = frame.event as string | undefined

  // Prefer the additive `event`; else field-sniff.
  if (event === 'captain_location' || (frame.longitude !== undefined && frame.latitude !== undefined && frame.status === undefined)) {
    return {
      kind: 'location',
      location: {
        longitude: Number(frame.longitude),
        latitude: Number(frame.latitude),
        lastPingAt: frame.last_ping_at as string | undefined,
        online: frame.online as boolean | undefined,
      },
    }
  }
  if (frame.trip_id !== undefined && frame.pickup_lat !== undefined) {
    const roomId = typeof frame.room_id === 'string' ? frame.room_id : undefined
    return {
      kind: 'offer',
      offer: {
        ...frame,
        tripId: String(frame.trip_id),
        roomId,
        riderCount: roomId ? toFiniteNumber(frame.rider_count) : undefined,
        totalFareIqd: roomId ? toFiniteNumber(frame.total_fare_iqd) : undefined,
        expiresAt: roomId && typeof frame.expires_at === 'string' ? frame.expires_at : undefined,
        expiresInSeconds: roomId ? toFiniteNumber(frame.expires_in_seconds) : undefined,
      },
    }
  }
  if (event === 'trip_update' || (frame.id !== undefined && frame.status !== undefined)) {
    return { kind: 'trip', trip: { ...frame, id: String(frame.id), status: String(frame.status) } }
  }
  // Legacy cancel frame. The cancellation cascade publishes
  // `{id, cancelled_by, reason, cancelled_at}` — no `event`, no `status` — so
  // every branch above drops it and the captain never learns the rider quit.
  // Synthesise the status the app switches on. Deliberately LAST: a backend
  // that already sends the unified `trip_update` frame is handled above, and an
  // offer or a location echo can never reach here.
  if (typeof frame.cancelled_by === 'string' && typeof frame.id === 'string') {
    return { kind: 'trip', trip: { ...frame, id: frame.id, status: 'cancelled' } }
  }
  return null // unknown frame
}
