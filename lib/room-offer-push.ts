// lib/room-offer-push.ts
// Reading the backend's "Nafarat room ready" push (push-provider). Pure, so it
// can be unit tested without expo-notifications.
import { toFiniteNumber } from '@/lib/to-number'

/** Set on a notification this app presented itself, so the handler shows it as is. */
export const LOCAL_PUSH_FLAG = 'beep_local'

/** The push kind from the FCM `data` block (`notification_type`, with a `type` fallback). */
export function pushNotificationType(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const t = d.notification_type ?? d.type
  return typeof t === 'string' ? t : null
}

export interface RoomOfferPush {
  riderCount?: number
  totalFareIqd?: number
}

/**
 * A backend "Nafarat room ready" push that carries the room's size and total
 * fare. FCM data values arrive as strings ('3', '10500'), APNs data as
 * numbers; both are read. Null for anything else, for a push without those
 * fields, and for the copy this app re-presents (flagged `LOCAL_PUSH_FLAG`).
 */
export function roomOfferFromPush(data: unknown): RoomOfferPush | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d[LOCAL_PUSH_FLAG] || pushNotificationType(d) !== 'new_trip_in_queue' || typeof d.room_id !== 'string') return null
  const riderCount = toFiniteNumber(d.rider_count)
  const totalFareIqd = toFiniteNumber(d.total_fare_iqd)
  if (riderCount == null && totalFareIqd == null) return null
  return { riderCount, totalFareIqd }
}
