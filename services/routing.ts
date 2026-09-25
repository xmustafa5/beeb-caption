import { api } from '@/lib/api'
import type { LatLng } from '@/hooks/use-current-location'

export interface RouteResult {
  coords: LatLng[]
  distanceM: number
  durationS: number
}

/**
 * Wire shape of `GET /api/routes/driving`. The backend asks its own OSRM (the same router the
 * fare is priced on) and returns the road line as GeoJSON — so every pair is **[lng, lat]**,
 * longitude first.
 */
interface RouteGeometryResponse {
  distance_m: number
  duration_s: number
  geometry: {
    type: 'LineString'
    coordinates: [number, number][]
  }
}

/**
 * Longer than the backend's own 5 s OSRM budget, so a slow router comes back as its clean 503
 * rather than a client-side abort, but well under the api instance's 30 s default: a route line
 * nobody sees for half a minute is worse than the caller's straight-line fallback.
 */
const ROUTE_TIMEOUT_MS = 8000

/**
 * Most distinct routes kept in memory. The captain's live-trip screen asks for a new route on
 * every GPS fix, and each answer is a few hundred points, so an unbounded map would grow for the
 * whole shift. The oldest entry goes first (a Map iterates in insertion order).
 */
const CACHE_MAX_ENTRIES = 64

const cache = new Map<string, RouteResult>()

function cacheKey(a: LatLng, b: LatLng): string {
  return `${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}|${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}`
}

function isPoint(pair: unknown): pair is [number, number] {
  return (
    Array.isArray(pair) &&
    pair.length >= 2 &&
    Number.isFinite(pair[0]) &&
    Number.isFinite(pair[1])
  )
}

/** The road line as app coordinates, or null when it is not a drawable line (fewer than 2 points). */
function toRouteResult(data: RouteGeometryResponse | undefined): RouteResult | null {
  const pairs: unknown = data?.geometry?.coordinates
  if (!Array.isArray(pairs) || pairs.length < 2 || !pairs.every(isPoint)) return null
  return {
    coords: pairs.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
    distanceM: data?.distance_m ?? 0,
    durationS: data?.duration_s ?? 0,
  }
}

/**
 * Road route from `a` to `b`, from our backend's routing endpoint.
 *
 * Returns null on ANY failure — no route between the points (404), router down (503), offline,
 * timeout, rate limit, or a malformed body — and every caller falls back to its straight line.
 * Only successes are cached, so a failed pair is asked for again on the next call.
 *
 * A 401 here goes through the api interceptor like any other authenticated call: the token was
 * sent and is dead, so the user is signed out. Every screen that draws a route is behind login.
 */
export async function getRoute(a: LatLng, b: LatLng): Promise<RouteResult | null> {
  const key = cacheKey(a, b)
  const cached = cache.get(key)
  if (cached) return cached

  try {
    const { data } = await api.get<RouteGeometryResponse>('/api/routes/driving', {
      params: {
        from_lat: a.latitude,
        from_lng: a.longitude,
        to_lat: b.latitude,
        to_lng: b.longitude,
      },
      timeout: ROUTE_TIMEOUT_MS,
    })
    const result = toRouteResult(data)
    if (!result) return null
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, result)
    return result
  } catch {
    return null
  }
}

/**
 * Walk along a polyline by parameter t∈[0,1] using segment-length weighting.
 * Returns the lat/lng at the given fraction of total distance.
 */
export function lerpAlongRoute(route: LatLng[], t: number): LatLng {
  if (route.length === 0) return { latitude: 0, longitude: 0 }
  if (route.length === 1 || t <= 0) return route[0]
  if (t >= 1) return route[route.length - 1]

  const segLengths: number[] = []
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]
    const b = route[i + 1]
    const dLat = b.latitude - a.latitude
    const dLng = b.longitude - a.longitude
    // Use squared euclidean — fine for short segments and proportional weighting
    const seg = Math.sqrt(dLat * dLat + dLng * dLng)
    segLengths.push(seg)
    total += seg
  }
  if (total === 0) return route[0]

  const target = total * t
  let acc = 0
  for (let i = 0; i < segLengths.length; i++) {
    if (acc + segLengths[i] >= target) {
      const localT = (target - acc) / segLengths[i]
      const a = route[i]
      const b = route[i + 1]
      return {
        latitude: a.latitude + (b.latitude - a.latitude) * localT,
        longitude: a.longitude + (b.longitude - a.longitude) * localT,
      }
    }
    acc += segLengths[i]
  }
  return route[route.length - 1]
}
