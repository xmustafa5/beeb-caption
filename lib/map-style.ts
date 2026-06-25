/**
 * MapLibre keyless basemap styles + react-native-maps ⇆ MapLibre conversions.
 *
 * We render maps with @maplibre/maplibre-react-native (native MapLibre GL, no
 * Google Maps SDK, no API key). CARTO serves complete vector styles — including
 * the TILES — with NO token and no usage limits, so they load on-device, not
 * just in a browser. "Positron" (clean light) and "Dark Matter" (clean dark)
 * have a muted grey-blue palette that keeps the basemap calm so our Royal Navy
 * pins/routes stay the focal point.
 *
 * NOTE: Stadia/MapTiler "keyless" styles only work from a browser on localhost —
 * their tiles return HTTP 401 from the native app. CARTO has no such restriction.
 *
 * MapLibre coordinates are [longitude, latitude] tuples (GeoJSON order), the
 * opposite of react-native-maps' { latitude, longitude }. Convert at the boundary.
 */
import type { LngLat } from '@maplibre/maplibre-react-native'
import type { LatLng } from '@/hooks/use-current-location'

/** Fully keyless CARTO GL styles — tiles included, no token, no limits, works on-device. */
const MAP_STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const MAP_STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

export function mapStyleFor(scheme: 'light' | 'dark'): string {
  return scheme === 'dark' ? MAP_STYLE_DARK : MAP_STYLE_LIGHT
}

/** react-native-maps {latitude,longitude} → MapLibre [lng,lat]. */
export function toLngLat(c: LatLng): LngLat {
  return [c.longitude, c.latitude]
}

/** A closed GeoJSON Polygon ring from LatLng[] (first point repeated to close). */
export function toPolygonFeature(points: LatLng[]): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring = points.map(toLngLat)
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    ring.push(ring[0]) // close the ring
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

/** A GeoJSON LineString from LatLng[]. */
export function toLineFeature(points: LatLng[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.map(toLngLat) } }
}

/**
 * Approximate a react-native-maps latitudeDelta (degrees of latitude visible)
 * to a MapLibre zoom level, so the initial framing matches the old map.
 * Web-mercator: worldHeight(deg) ≈ 360 / 2^zoom for the tile span → invert.
 * Tuned against the two deltas the app uses (0.012 ≈ z15.3, 0.03 ≈ z14).
 */
export function deltaToZoom(latitudeDelta: number): number {
  return Math.log2(360 / latitudeDelta)
}

/**
 * Bounding box [west, south, east, north] enclosing all the given points, for
 * MapLibre's Camera.fitBounds (frames pickup + dropoff + route with padding).
 * Returns null for fewer than 1 point.
 */
export function boundsFor(points: LatLng[]): [number, number, number, number] | null {
  if (points.length === 0) return null
  let west = points[0].longitude
  let east = points[0].longitude
  let south = points[0].latitude
  let north = points[0].latitude
  for (const p of points) {
    if (p.longitude < west) west = p.longitude
    if (p.longitude > east) east = p.longitude
    if (p.latitude < south) south = p.latitude
    if (p.latitude > north) north = p.latitude
  }
  return [west, south, east, north]
}

// ── POI overlay helpers ──────────────────────────────────────────────────────

/**
 * Zoom at/above which POI pins render (the layer `minzoom`) and the POI fetch is enabled.
 * Set to 12 (city/district zoom) so pins appear early and the map feels fuller without the
 * rider having to zoom right in — both pickers open well above this, so pins are visible on open.
 *
 * NOTE: this is the RENDER/FETCH-enable threshold. To avoid flicker, the fetch is NOT torn down
 * the moment zoom dips just below it (see POI_FETCH_DISABLE_ZOOM); the layer `minzoom` quietly
 * hides the pins instead, so a small pinch wobble never unmounts and re-mounts the source.
 */
export const POI_MIN_ZOOM = 12

/**
 * Central-Baghdad anchor for the location-picker's SEARCH-RECALL fetch — a FIXED constant, NOT the
 * user's GPS or the map center — so the on-open prefetch and the picker share ONE cache entry, and a
 * GPS-denied user still gets a usable search set. This is NOT the map overlay's source: the overlay
 * windows the visible bbox on pan (true viewport mode). The dataset is ~285,000 POIs nationwide (see
 * BACKEND_ISSUES.md) — 1000 is a per-viewport server `total` cap, NOT the dataset size — so a radius
 * fetch here is itself ≤1000-capped (a known search-recall limit until a server search endpoint lands).
 */
export const CITY_CENTROID: LatLng = { latitude: 33.3152, longitude: 44.3661 }

/**
 * Radius (m) for the search-recall fetch around CITY_CENTROID. Clamped to the 50 km backend max by
 * getRadiusPois (this equals it). The radius mode's `total` is server-capped at 1000 per query, so
 * this pulls the ≤1000 nearest city POIs into the in-memory search set — enough for in-picker
 * search at today's density, NOT a full-city dump (the 285k dataset can't be fetched client-side).
 */
export const POI_CITY_RADIUS_M = 50000

/**
 * The fetch (and the overlay mount) is only torn down once zoom drops a full level BELOW the
 * render gate. This hysteresis gap means a momentary zoom wobble around POI_MIN_ZOOM keeps the
 * source mounted and the data cached — the layer's own `minzoom` handles the visual hide — so
 * pins don't flicker on/off at the boundary.
 */
export const POI_FETCH_DISABLE_ZOOM = POI_MIN_ZOOM - 1

/** Viewport bbox `[minLng, minLat, maxLng, maxLat]` = `[west, south, east, north]` (same order as `boundsFor`). */
export type Bbox = [number, number, number, number]

/**
 * Minimum span (degrees) each bbox axis is padded to. Must be STRICTLY GREATER than one rounding
 * step (`10^-POI_BBOX_DP` = 0.01°) so that after `roundBbox` snaps both ends to 2dp they still land
 * on DIFFERENT grid cells — otherwise a thin high-zoom viewport (or a zero-area initial `bounds`
 * before the map has measured) rounds to `min === max` and the backend 400s it as "degenerate".
 * 0.02° ≈ ~2 km, a hair above one grid cell — invisible at the zoom levels POIs render at.
 */
const MIN_BBOX_SPAN = 0.02

/** Pad a [min,max] pair to at least `MIN_BBOX_SPAN`, growing symmetrically about its midpoint. */
function padSpan(min: number, max: number): [number, number] {
  const span = max - min
  if (span >= MIN_BBOX_SPAN) return [min, max]
  const mid = (min + max) / 2
  const half = MIN_BBOX_SPAN / 2
  return [mid - half, mid + half]
}

/**
 * Convert MapLibre's pan-settle bounds to a backend bbox: normalize each axis with Math.min/Math.max,
 * then pad any too-thin axis to `MIN_BBOX_SPAN`.
 *
 * In `@maplibre/maplibre-react-native@11.3.4`, `e.nativeEvent.bounds` is a flat `LngLatBounds`
 * `[west, south, east, north]` — already byte-identical to the backend's `[minLng, minLat, maxLng,
 * maxLat]`. The min/max sort is structural insurance against a swapped/inverted pair (the only
 * client-side defense against the server's silent-empty-200). The pad is the load-bearing fix for the
 * observed degenerate-bbox 400: a zero-area initial `bounds` (map not yet measured) or a viewport
 * thinner than the 2dp grid would otherwise round to `min === max` and be rejected. Padding here — at
 * the single seam where bounds become a bbox — keeps every downstream consumer (request + cache key) safe.
 */
export function bboxFromBounds(bounds: readonly [number, number, number, number]): Bbox {
  const [aLng, aLat, bLng, bLat] = bounds
  const [minLng, maxLng] = padSpan(Math.min(aLng, bLng), Math.max(aLng, bLng))
  const [minLat, maxLat] = padSpan(Math.min(aLat, bLat), Math.max(aLat, bLat))
  return [minLng, minLat, maxLng, maxLat]
}

/** Iraq's rough WGS84 envelope — used only by the dev-only axis guard to sniff a lat-first bbox. */
const IRAQ_LNG = [38, 49] as const
const IRAQ_LAT = [29, 38] as const

/**
 * DEV-ONLY guard that warns (never throws) when a bbox looks wrong before it's sent. Two checks,
 * run against the ROUNDED bbox (what actually hits the wire — a bbox can be fine raw but collapse to
 * `min === max` after the 2dp snap, which is the real-world degenerate 400 we observed):
 *  - degenerate/inverted (min not strictly < max on an axis) → the backend returns a structured 400;
 *  - axis-swapped (lat-first) → the backend returns a SILENT empty 200 (indistinguishable from "no
 *    POIs here"), so this is the only place a swap can be caught. We flag it when the bbox sits
 *    outside Iraq's lng band AND outside its lat band — the signature of transposed lat/lng numbers.
 * Zero production cost (compiles out under `!__DEV__`); a warn, not a throw, so it never breaks a pan.
 */
export function assertBboxOrder(b: Bbox): void {
  if (!__DEV__) return
  // Check the rounded values — that's the bbox the request sends and the server validates.
  const [minLng, minLat, maxLng, maxLat] = roundBbox(b)
    .split(',')
    .map(Number) as [number, number, number, number]
  if (!(minLng < maxLng) || !(minLat < maxLat)) {
    console.warn(
      `[pois] degenerate bbox after 2dp rounding (${roundBbox(b)}) — backend will 400. bboxFromBounds should pad thin axes.`,
    )
    return
  }
  const lngOutside = minLng < IRAQ_LNG[0] || maxLng > IRAQ_LNG[1]
  const latOutside = minLat > IRAQ_LAT[1] || maxLat < IRAQ_LAT[0]
  if (lngOutside && latOutside) {
    console.warn(
      `[pois] bbox ${roundBbox(b)} looks AXIS-SWAPPED (lat-first); backend returns a silent empty 200. Send minLng,minLat,maxLng,maxLat.`,
    )
  }
}

/** Rounding precision (decimal places) for the POI query-key bbox. 2dp ≈ 0.01° ≈ 1.1 km grid at Baghdad's latitude. */
const POI_BBOX_DP = 2

/**
 * Snap a bbox to the POI grid and serialize it to `"w,s,e,n"`. This string is used as BOTH
 * the React Query key fragment AND the `?bbox=` request param, so the fetched data is valid
 * for the whole grid cell. Fixed precision means small pans that don't cross a grid step
 * reuse the same key/cache entry (no refetch) — the anti-thrash mechanism.
 */
export function roundBbox(b: Bbox, dp = POI_BBOX_DP): string {
  return b.map((n) => n.toFixed(dp)).join(',')
}

/** Scalar-only feature props (MapLibre serializes props across the native bridge — no nulls/undefined). */
export interface PoiFeatureProps {
  id: string
  label: string
  category: string
  tier: number
  /** Ionicon glyph name → the symbol layer's `icon-image`. */
  glyph: string
  /** Resolved circle color hex (theme color; literal because paint can't read the theme). */
  color: string
}
