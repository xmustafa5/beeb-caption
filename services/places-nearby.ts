/**
 * POI ("places nearby") service for the map overlay.
 *
 * Backed by the public `GET /api/places/nearby` endpoint (same auth tier as
 * `/api/zones` — no token). The map overlay uses BBOX/VIEWPORT mode (`getNearbyPois`):
 * it hands us the visible rectangle and we page the places inside it, refetching on
 * pan-settle. This is the supported path at the live dataset size (~285k POIs across
 * Iraq; a single radius/"fetch-all" call is capped at 1000 and would silently drop the
 * rest). RADIUS mode (`getRadiusPois`) is retained for the location-picker's client-side
 * search recall (a warm city-set) and the on-open prefetch — NOT for the map overlay.
 *
 * Kept SEPARATE from `services/places.ts` (which owns geocoding/search and its own
 * `Place`/`PlaceResult` types) to avoid clobbering — these are unrelated concerns.
 */
import axios from 'axios'
import { api } from '@/lib/api'
import type { LatLng } from '@/hooks/use-current-location'
import { roundBbox, assertBboxOrder, type Bbox } from '@/lib/map-style'

/** OSM POI category. Open string — the backend can add categories without a client change. */
export type PoiCategory = 'cafe' | 'restaurant' | 'shop' | 'company' | (string & {})

/** A nearby place, camelCase. Both names are carried; the display language is chosen at render (like `Zone`). */
export interface Poi {
  /** OSM id, e.g. `node/123` | `way/456` | `sample/baghdad-1`. Stable & unique → GeoJSON feature id + cache dedup. */
  id: string
  category: PoiCategory
  /** Primary (Latin/local) name; null when OSM has no `name` tag. */
  name: string | null
  /** Arabic name; null for ~half of Iraqi POIs (OSM coverage). */
  nameAr: string | null
  coord: LatLng
  /** Metres from the query point in radius mode; ALWAYS null in viewport/bbox mode. */
  distanceM: number | null
}

interface BackendPlace {
  id: string
  name: string | null
  name_ar: string | null
  category: string
  lat: number
  lng: number
  address: string | null
  address_ar: string | null
  distance_m: number | null
}

/** The standard `{ items, total, page, per_page }` list envelope (same as trips/zones). */
interface NearbyResponse {
  items: BackendPlace[]
  total: number
  page: number
  per_page: number
}

function toPoi(b: BackendPlace): Poi {
  return {
    id: b.id,
    category: b.category,
    name: b.name,
    nameAr: b.name_ar,
    coord: { latitude: b.lat, longitude: b.lng },
    distanceM: b.distance_m,
  }
}

/**
 * RTL-aware display label. coalesce(name_ar, name) for AR; coalesce(name, name_ar) for EN.
 * TOTAL — falls back to `category` so every pin gets a non-null string (a `properties.label`
 * of `undefined` would vanish across the native bridge). Some AR pins will show a Latin/
 * transliterated label — that's an OSM data limit, not fixable here.
 */
export function poiLabel(poi: Poi, lang: 'en' | 'ar'): string {
  const primary = lang === 'ar' ? poi.nameAr ?? poi.name : poi.name ?? poi.nameAr
  return primary ?? poi.category
}

/** Per-page max (server clamps to 1..100). A dense viewport exceeds one page, so `getNearbyPois` pages. */
const POI_PER_PAGE = 100

interface GetPoisOpts {
  category?: PoiCategory
  /** React Query's AbortSignal — forwarded to axios so a superseded pan cancels its request. */
  signal?: AbortSignal
  /** Safety cap on pages for one viewport (default 4 ⇒ ≤400 features over the bridge per cell). */
  maxPages?: number
}

/**
 * POIs inside a viewport bbox `[minLng, minLat, maxLng, maxLat]` (WGS84, lng-first), paginated.
 *
 * This is the map overlay's PRIMARY source — the caller hands us the visible rectangle on
 * pan-settle and we window the POIs to it. Public, no auth. `distance_m` is null in this mode
 * (bbox has no query point to measure from). We only ever send `bbox` (never `lat`/`lng`
 * alongside it), so the "both modes supplied" 400 is structurally impossible. The bbox sent is
 * the ROUNDED one, so the response matches the React-Query cache cell exactly.
 *
 * Pages up to `maxPages` (default 4) of `per_page=100`, stopping early on a short page or once
 * the running count reaches `total` — a dense central-Baghdad cell hits the server's 1000-per-
 * viewport `total` cap, so without the page cap we'd pull 1000 features over the native bridge;
 * 4 pages (≤400) is plenty once the zoom-tier filter + native collision thin what's drawn.
 * De-duped by exact `id` across pages.
 *
 * Lng-first ordering is load-bearing: the server returns a silent empty list (200, not 400) for an
 * axis-swapped bbox, so a wrong order would surface as an empty map with no error. `bboxFromBounds`
 * (a Math.min/Math.max normalizer) + the lng-first `e.nativeEvent.bounds` from MapLibre guarantee
 * the order at the source; `assertBboxOrder` warns in dev if a bbox still looks lat-first/degenerate.
 */
export async function getNearbyPois(bbox: Bbox, opts: GetPoisOpts = {}): Promise<Poi[]> {
  assertBboxOrder(bbox)
  const maxPages = opts.maxPages ?? 4
  const seen = new Set<string>()
  const out: Poi[] = []
  try {
    for (let page = 1; page <= maxPages; page++) {
      const { data } = await api.get<NearbyResponse>('/api/places/nearby', {
        params: {
          bbox: roundBbox(bbox),
          per_page: POI_PER_PAGE,
          page,
          ...(opts.category ? { category: opts.category } : {}),
        },
        signal: opts.signal,
      })
      const items = data.items.filter(
        (b) => typeof b.lat === 'number' && typeof b.lng === 'number' && !!b.category,
      )
      for (const b of items) {
        if (seen.has(b.id)) continue
        seen.add(b.id)
        out.push(toPoi(b))
      }
      const lastPage = data.items.length < POI_PER_PAGE || page * POI_PER_PAGE >= data.total
      if (lastPage) break
    }
  } catch (err) {
    // A 400 here is a deterministic bad-bbox bug (degenerate/inverted), not transient — the backend
    // returns a structured `{ error, expected_order }` body. Surface it in dev, then re-throw so the
    // hook's retry-never-on-400 + placeholderData own the UX (it never silently shows a blank map).
    if (__DEV__ && axios.isAxiosError(err) && err.response?.status === 400) {
      console.warn('[pois] bbox rejected (400):', err.response.data)
    }
    throw err
  }
  return out
}

interface GetRadiusPoisOpts {
  signal?: AbortSignal
  /** Safety cap on pages. The server caps `total` at 1000 PER VIEWPORT (not the dataset — ~285k
   *  nationwide), so a wide-radius city fetch is bounded to ≤1000 ⇒ ~10 pages; +2 absorbs a bump. */
  maxPages?: number
}

/** Backend cap on radius_m (radius mode). Documented in the OpenAPI spec. */
const RADIUS_MAX_M = 50000

/**
 * POIs within `radiusM` metres of `center`, paginated. Uses the backend's RADIUS mode
 * (`lat`/`lng`/`radius_m`) — NOT bbox — so there's no axis-order to get wrong (a swapped bbox
 * returns a silent empty 200; a degenerate one returns a structured 400). Results come back sorted
 * by `distance_m` ascending. per_page clamps to 100, so a dense area is fetched as up to `maxPages`
 * sequential pages, stopping early when a page is short or the running count reaches `total`.
 * De-duped by exact `id`. Backs the location-picker's client-side search recall (a warm city-set,
 * itself ≤1000-capped) and the on-open prefetch — NOT the map overlay (that's bbox mode above).
 */
export async function getRadiusPois(
  center: LatLng,
  radiusM: number,
  opts: GetRadiusPoisOpts = {},
): Promise<Poi[]> {
  const maxPages = opts.maxPages ?? 12
  const radius = Math.min(radiusM, RADIUS_MAX_M)
  const seen = new Set<string>()
  const out: Poi[] = []
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await api.get<NearbyResponse>('/api/places/nearby', {
      params: { lat: center.latitude, lng: center.longitude, radius_m: radius, per_page: POI_PER_PAGE, page },
      signal: opts.signal,
    })
    const items = data.items.filter((b) => typeof b.lat === 'number' && typeof b.lng === 'number' && !!b.category)
    for (const b of items) {
      if (seen.has(b.id)) continue
      seen.add(b.id)
      out.push(toPoi(b))
    }
    const lastPage = data.items.length < POI_PER_PAGE || page * POI_PER_PAGE >= data.total
    if (lastPage) break
  }
  return out
}
