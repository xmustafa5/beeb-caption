import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { getNearbyPois, getRadiusPois, type Poi, type PoiCategory } from '@/services/places-nearby'
import {
  roundBbox,
  CITY_CENTROID,
  POI_CITY_RADIUS_M,
  POI_MIN_ZOOM,
  POI_FETCH_DISABLE_ZOOM,
  type Bbox,
} from '@/lib/map-style'

/** Stable empty reference so the overlay's GeoJSON memo doesn't churn on the no-data case. */
const EMPTY_POIS: Poi[] = []

interface UseNearbyPoisOpts {
  category?: PoiCategory
}

/**
 * POIs for the current map viewport (bbox mode) — the map overlay's PRIMARY source.
 *
 * The caller hands us the visible rectangle on pan-settle. The anti-thrash seam lives entirely in
 * the query config: the key is the GRID-SNAPPED bbox (`roundBbox`, 2dp ≈ 1.1 km), so a small pan
 * inside the same cell reuses the cache and never refetches (the original viewport impl re-keyed to
 * the LIVE center on every settle and re-downloaded/replaced the whole set — that thrash is what
 * "made the map go to hell"; the grid-snapped key is what makes per-pan-settle safe). `placeholderData`
 * keeps the prior cell's pins on screen during a cross-cell refetch (no blank flash), and we NEVER
 * retry a 400 (a bad bbox is a deterministic code bug, not transient).
 *
 * Disabled until enabled & a bbox exists — zero requests fire below the zoom gate or before the
 * first pan-settle seeds a bbox. Returns `pois` always-defined (stable `EMPTY_POIS` when empty).
 */
export function useNearbyPois(bbox: Bbox | null, enabled: boolean, opts: UseNearbyPoisOpts = {}) {
  const key = bbox ? roundBbox(bbox) : null
  const query = useQuery<Poi[]>({
    queryKey: ['pois', key, opts.category ?? null],
    queryFn: ({ signal }) => getNearbyPois(bbox!, { category: opts.category, signal }),
    enabled: enabled && bbox !== null,
    staleTime: 5 * 60 * 1000, // POIs are effectively immutable per session; re-panning a seen cell is instant
    placeholderData: (prev) => prev, // keep prior cell's pins on screen during refetch — no blank flash
    retry: (n, err) => {
      // Retry only network/5xx; NEVER a 400 (a bad bbox is a deterministic code bug, not transient).
      const status = axios.isAxiosError(err) ? err.response?.status : undefined
      return (status === undefined || status >= 500) && n < 2
    },
  })
  return { ...query, pois: query.data ?? EMPTY_POIS }
}

/**
 * The map overlay's POI source: the visible viewport's POIs, with a zoom gate that has hysteresis.
 *
 * `bbox`/`zoom` come from the map's `onRegionDidChange` (`e.nativeEvent.bounds` / `.zoom`). We only
 * fetch once zoom ≥ POI_MIN_ZOOM (pins would be off-screen-dense below it); the gate is STICKY down
 * to POI_FETCH_DISABLE_ZOOM so a pinch wobble around the threshold doesn't tear the source down and
 * re-mount it (flicker). The sticky value lives in state + an effect — NOT a render-phase ref write,
 * which React 18 / Expo SDK 54 StrictMode double-invoke would flip twice and defeat the dead-band.
 */
export function useViewportPois(
  bbox: Bbox | null,
  zoom: number | null,
  opts: { enabled?: boolean; category?: PoiCategory } = {},
) {
  const optedIn = opts.enabled ?? true
  const z = zoom ?? 0
  const [sticky, setSticky] = useState(false)
  const enabled = optedIn && (sticky ? z >= POI_FETCH_DISABLE_ZOOM : z >= POI_MIN_ZOOM)
  useEffect(() => {
    setSticky(enabled)
  }, [enabled])
  return useNearbyPois(bbox, enabled, { category: opts.category })
}

/**
 * The location-picker's SEARCH-RECALL feed (NOT the map overlay — that's `useViewportPois`/bbox).
 *
 * Fetches the ≤1000 nearest city POIs around the fixed CITY_CENTROID and holds them for the session
 * (`staleTime: Infinity`) as the in-memory set the picker's text search filters over, so search recall
 * isn't narrowed to the visible rectangle. Fetched LAZILY — the picker passes `enabled = searchActive`,
 * so the (paged, ~10-request) city fetch fires only when the rider opens the search overlay, not on app
 * open or picker mount; once loaded it's cached for the rest of the session. Recall is bounded to ≤1000
 * city POIs (the radius mode's per-query `total` cap); full-text over the ~285k dataset needs a server
 * search endpoint (filed in BACKEND_ISSUES.md). Returns a stable `EMPTY_POIS` when empty/disabled.
 */
export function useCityPois(enabled = true) {
  const query = useQuery<Poi[]>({
    queryKey: ['pois', 'city'],
    queryFn: ({ signal }) => getRadiusPois(CITY_CENTROID, POI_CITY_RADIUS_M, { signal }),
    enabled,
    staleTime: Infinity,
  })
  return { ...query, pois: query.data ?? EMPTY_POIS }
}
