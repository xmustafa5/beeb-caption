/**
 * Turn-by-turn navigation deep links for the captain.
 *
 * The captain picks the navigator — Google Maps or Waze, one button each (see
 * `NavigateButtons`). Neither app accepts a multi-stop route from a link, so a
 * multi-stop or Nafarat trip is driven ONE leg at a time: the screen works out
 * the next stop (nearest first, see `nearestOf`), the buttons route to it, and
 * once it is done they move on to the one after.
 *
 * Each app is opened through its own URL scheme with no `canOpenURL` pre-check:
 * on Android 11+ that check answers "no" for any app the manifest doesn't list
 * under <queries> (none are), which quietly sent every Android captain to Google
 * Maps even with Waze installed. If the app really is missing, `openURL` rejects
 * and we fall back to the navigator's https link, which opens on the web.
 */
import { Linking } from 'react-native'
import type { LatLng } from '@/hooks/use-current-location'

export type NavApp = 'google' | 'waze'

/** [app deep link, web fallback] that start driving directions to `dest`. */
function navUrls(app: NavApp, dest: LatLng): [string, string] {
  const ll = `${dest.latitude},${dest.longitude}`
  if (app === 'waze') {
    return [`waze://?ll=${ll}&navigate=yes`, `https://waze.com/ul?ll=${ll}&navigate=yes`]
  }
  const web = `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving&dir_action=navigate`
  return process.env.EXPO_OS === 'ios'
    ? [`comgooglemaps://?daddr=${ll}&directionsmode=driving`, web]
    : [`google.navigation:q=${ll}&mode=d`, web] // Android: straight into turn-by-turn
}

/** Start driving directions to one destination in the captain's chosen app. */
export async function openNavigation(dest: LatLng, app: NavApp): Promise<void> {
  const [appUrl, webUrl] = navUrls(app, dest)
  try {
    await Linking.openURL(appUrl)
  } catch {
    await Linking.openURL(webUrl).catch(() => {})
  }
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
