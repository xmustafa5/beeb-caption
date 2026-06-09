import type { LatLng } from '@/hooks/use-current-location'

export interface RouteResult {
  coords: LatLng[]
  distanceM: number
  durationS: number
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

const cache = new Map<string, RouteResult>()

function cacheKey(a: LatLng, b: LatLng): string {
  return `${a.latitude.toFixed(5)},${a.longitude.toFixed(5)}|${b.latitude.toFixed(5)},${b.longitude.toFixed(5)}`
}

export async function getRoute(a: LatLng, b: LatLng): Promise<RouteResult | null> {
  const key = cacheKey(a, b)
  const cached = cache.get(key)
  if (cached) return cached

  const url = `${OSRM_BASE}/${a.longitude},${a.latitude};${b.longitude},${b.latitude}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const route = data.routes?.[0]
    if (!route?.geometry?.coordinates) return null
    const coords: LatLng[] = route.geometry.coordinates.map(
      (pair: number[]) => ({ latitude: pair[1], longitude: pair[0] }),
    )
    const result: RouteResult = {
      coords,
      distanceM: route.distance ?? 0,
      durationS: route.duration ?? 0,
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
