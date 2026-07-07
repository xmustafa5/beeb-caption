/**
 * Turn-by-turn navigation deep links for the captain.
 *
 * Waze is the captain's preferred navigator, but it does NOT accept multiple
 * waypoints via a deep link — one destination per launch. So for a multi-stop /
 * Abriyah trip we open ONE leg at a time (nearest un-visited stop first; see
 * `nearestOf`), and re-open Waze for the next leg after the current one is done.
 *
 * `openNavigation` tries the Waze app first (`waze://`) and falls back to Google
 * Maps directions if Waze isn't installed — so a captain without Waze still gets
 * routed with a single tap, and one with Waze lands straight in it.
 */
import { Linking } from 'react-native'
import type { LatLng } from '@/hooks/use-current-location'

/** Waze app deep link that starts navigation to a single point. */
function wazeAppUrl(dest: LatLng): string {
  return `waze://?ll=${dest.latitude},${dest.longitude}&navigate=yes`
}

/** Google Maps directions URL — the fallback when Waze isn't installed. */
function googleMapsUrl(dest: LatLng): string {
  const ll = `${dest.latitude},${dest.longitude}`
  return process.env.EXPO_OS === 'ios'
    ? `https://maps.google.com/?daddr=${ll}`
    : `https://www.google.com/maps/dir/?api=1&destination=${ll}`
}

/**
 * Start navigation to a single destination, preferring the Waze app and falling
 * back to Google Maps. `canOpenURL('waze://')` needs the scheme allow-listed in
 * app.json's `ios.infoPlist.LSApplicationQueriesSchemes` on iOS; if the check
 * can't run (or Waze is missing) we open Google Maps instead.
 */
export async function openNavigation(dest: LatLng): Promise<void> {
  try {
    const hasWaze = await Linking.canOpenURL('waze://')
    if (hasWaze) {
      await Linking.openURL(wazeAppUrl(dest))
      return
    }
  } catch {
    // canOpenURL threw (scheme not queryable) — fall through to Google Maps.
  }
  await Linking.openURL(googleMapsUrl(dest)).catch(() => {})
}

/** Great-circle distance (km) between two points — haversine. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * The point in `points` physically closest to `from` — the "nearest rider" for
 * nearest-first multi-stop navigation. Returns null for an empty list.
 */
export function nearestOf<T extends LatLng>(from: LatLng, points: T[]): T | null {
  let best: T | null = null
  let bestKm = Infinity
  for (const p of points) {
    const km = distanceKm(from, p)
    if (km < bestKm) {
      bestKm = km
      best = p
    }
  }
  return best
}
