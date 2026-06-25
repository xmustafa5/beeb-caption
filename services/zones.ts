import { api } from '@/lib/api'
import { parsePolygonWkt, polygonCenter } from '@/lib/wkt'
import { isPointInPolygon } from '@/lib/point-in-polygon'
import type { LatLng } from '@/hooks/use-current-location'

export type ZoneType = 'regular_only' | 'abriyah_enabled'

/** A serviceable zone, with its WKT polygon parsed to `LatLng[]` for the app. */
export interface Zone {
  id: string
  cityId: string
  name: string
  nameAr: string
  polygon: LatLng[]
  zoneType: ZoneType
  /** Abriyah per-km price; null on regular_only zones. */
  perKmIqd: number | null
  baseFareIqd: number
  allowWomenOnly: boolean
  roomMaxRiders: number
  roomMaxWaitSeconds: number
}

interface BackendZone {
  id: string
  city_id: string
  name: string
  name_ar: string
  polygon_wkt: string
  zone_type: ZoneType
  abriyah_per_km_iqd: number | null
  abriyah_base_fare_iqd: number
  allow_women_only: boolean
  room_max_riders: number
  room_max_wait_seconds: number
}

function toZone(b: BackendZone): Zone {
  return {
    id: b.id,
    cityId: b.city_id,
    name: b.name,
    nameAr: b.name_ar,
    polygon: parsePolygonWkt(b.polygon_wkt),
    zoneType: b.zone_type,
    perKmIqd: b.abriyah_per_km_iqd,
    baseFareIqd: b.abriyah_base_fare_iqd,
    allowWomenOnly: b.allow_women_only,
    roomMaxRiders: b.room_max_riders,
    roomMaxWaitSeconds: b.room_max_wait_seconds,
  }
}

/** Active serviceable zones (public, no auth). */
export async function getZones(): Promise<Zone[]> {
  const { data } = await api.get<BackendZone[]>('/api/zones')
  return data.map(toZone)
}

export async function getZone(id: string): Promise<Zone> {
  const { data } = await api.get<BackendZone>(`/api/zones/${id}`)
  return toZone(data)
}

/** Localized zone display name. */
export function zoneName(zone: Zone, lang: 'en' | 'ar'): string {
  return lang === 'ar' ? zone.nameAr || zone.name : zone.name
}

/** Map center for a zone, derived from its polygon bounding box. */
export function zoneCenter(zone: Zone): LatLng {
  return polygonCenter(zone.polygon)
}

/** First Abriyah-enabled zone whose polygon contains the point, else null. */
export function findContainingAbriyahZone(point: LatLng, zones: Zone[]): Zone | null {
  for (const z of zones) {
    if (z.zoneType !== 'abriyah_enabled') continue
    if (z.polygon.length >= 3 && isPointInPolygon(point, z.polygon)) return z
  }
  return null
}

export interface ValidatePinsResult {
  valid: boolean
  /** Abriyah dropoff zone the room is keyed by; undefined when dropoff isn't in an Abriyah zone. */
  dropoffZoneId?: string
  /** Active pickup zone; undefined when the pickup is outside all active zones. */
  pickupZoneId?: string
  message: string
}

/**
 * Server-side pin validation (public — call freely during pin drag). Never an
 * HTTP error; `valid:false` carries a human message when a pin is out of zone.
 *
 * Cross-zone model: the dropoff must be in an Abriyah-enabled zone (which keys
 * the room) and the pickup in any active zone — they need not be the same zone.
 * The two ends are resolved independently into `dropoffZoneId` / `pickupZoneId`.
 */
export async function validatePins(
  pickup: LatLng,
  dropoff: LatLng,
): Promise<ValidatePinsResult> {
  const { data } = await api.post<{
    valid: boolean
    dropoff_zone_id?: string | null
    pickup_zone_id?: string | null
    message: string
  }>('/api/abriyah/validate-pins', {
    pickup_lat: pickup.latitude,
    pickup_lng: pickup.longitude,
    dropoff_lat: dropoff.latitude,
    dropoff_lng: dropoff.longitude,
  })
  return {
    valid: data.valid,
    dropoffZoneId: data.dropoff_zone_id ?? undefined,
    pickupZoneId: data.pickup_zone_id ?? undefined,
    message: data.message,
  }
}
