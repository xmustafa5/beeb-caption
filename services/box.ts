// services/box.ts
import { api } from '@/lib/api'
import { toAsciiDigits } from '@/lib/digits'

/**
 * The parcel on a Box trip, as the ASSIGNED captain sees it. This is the only
 * place the recipient's phone is served — it is never on the offer or on
 * `GET /api/trips/{id}`.
 */
export interface BoxDetails {
  tripId: string
  description: string
  /** Stored as `9647XXXXXXXXX` (no '+'). Format with `lib/phone.ts` before showing or dialling. */
  recipientPhone: string
  recipientName: string | null
  /**
   * Presigned GETs in the sender's order, valid ~5 minutes and re-signed on
   * every fetch. Render with a cacheKey built from the trip id + index
   * (`boxPhotoCacheKey`), never the URL itself.
   */
  photoUrls: string[]
  surchargeIqd: number
}

interface BackendBoxDetails {
  trip_id: string
  description: string
  recipient_phone: string
  recipient_name?: string | null
  photo_urls?: string[] | null
  surcharge_iqd?: number | null
}

function toBoxDetails(b: BackendBoxDetails): BoxDetails {
  const name = b.recipient_name?.trim()
  return {
    tripId: b.trip_id,
    // Western digits in every language, like every other backend text.
    description: toAsciiDigits(b.description ?? ''),
    recipientPhone: toAsciiDigits(b.recipient_phone ?? ''),
    recipientName: name ? toAsciiDigits(name) : null,
    photoUrls: (b.photo_urls ?? []).filter((u) => typeof u === 'string' && u.length > 0),
    surchargeIqd: b.surcharge_iqd ?? 0,
  }
}

/**
 * `GET /api/trips/{id}/box` → the parcel. The assigned captain may read it only
 * while the trip is `accepted` or `in_progress` (403 otherwise); 404 when the
 * trip is missing or not a Box.
 */
export async function getBoxDetails(tripId: string): Promise<BoxDetails> {
  const { data } = await api.get<BackendBoxDetails>(`/api/trips/${tripId}/box`)
  return toBoxDetails(data)
}

/**
 * Stable expo-image cache key for one Box photo. Presigned URLs change on every
 * fetch, so keying the cache by URL would re-download (and flicker) each poll.
 * The offer card's thumbnail (first photo, offer id = trip id) and the live-trip
 * card share this key, so the photo is already cached after accepting.
 */
export function boxPhotoCacheKey(tripId: string, index: number): string {
  return `box-photo-${tripId}-${index}`
}
