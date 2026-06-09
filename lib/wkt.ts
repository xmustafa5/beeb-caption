import type { LatLng } from '@/hooks/use-current-location'

/**
 * Parse a backend WKT polygon ring into the app's `LatLng[]`.
 *
 * The backend exchanges polygons as WKT, **longitude-first**, SRID 4326:
 *   `POLYGON((lng lat, lng lat, ..., first-point-repeated))`
 *
 * The closing point (== first) is dropped — the app's ray-casting and map
 * rendering treat the ring as implicitly closed. Returns `[]` on anything that
 * isn't a parseable polygon (callers treat an empty ring as "no polygon").
 */
export function parsePolygonWkt(wkt: string): LatLng[] {
  if (!wkt) return []
  // Grab the inner-most ring: the content between the first "((" and the last "))".
  const open = wkt.indexOf('((')
  const close = wkt.lastIndexOf('))')
  if (open === -1 || close === -1 || close <= open) return []
  const body = wkt.slice(open + 2, close)

  const points: LatLng[] = []
  for (const pair of body.split(',')) {
    const parts = pair.trim().split(/\s+/)
    if (parts.length < 2) continue
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    points.push({ latitude: lat, longitude: lng })
  }

  // Drop the repeated closing vertex if present.
  if (points.length > 1) {
    const a = points[0]
    const b = points[points.length - 1]
    if (a.latitude === b.latitude && a.longitude === b.longitude) points.pop()
  }
  return points
}

/** Centroid of a polygon ring's bounding box — used to center the map on a zone. */
export function polygonCenter(polygon: LatLng[]): LatLng {
  if (polygon.length === 0) return { latitude: 0, longitude: 0 }
  const lats = polygon.map((p) => p.latitude)
  const lngs = polygon.map((p) => p.longitude)
  return {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  }
}
