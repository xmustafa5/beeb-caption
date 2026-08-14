/**
 * Rich place descriptions for from/to rows: the Nominatim address chain
 * ("حي الصدر الثاني، محلة 544، شارع الحمزة") plus the nearest landmark from the
 * backend POI dataset ("، قرب مصرف الرافدين"). Kept separate from
 * `services/places.ts` (pure geocoding/label logic, unit-tested offline) because
 * this file pulls in the axios-backed POI service.
 */
import { reverseGeocode, combinePlaceLabel } from '@/services/places'
import { getRadiusPois } from '@/services/places-nearby'
import type { LatLng } from '@/hooks/use-current-location'

/** A landmark only "locates" a point when it is genuinely next to it (~150 m). */
const LANDMARK_RADIUS_M = 150

/** Nearest named POI within LANDMARK_RADIUS_M, or null. Best-effort — never throws. */
async function nearestLandmark(coord: LatLng, lang: 'en' | 'ar'): Promise<string | null> {
  try {
    // Radius mode returns distance-sorted results; one page is plenty for 150 m.
    const pois = await getRadiusPois(coord, LANDMARK_RADIUS_M, { maxPages: 1 })
    const named = pois.find((p) => (lang === 'ar' ? p.nameAr ?? p.name : p.name ?? p.nameAr))
    if (!named) return null
    return (lang === 'ar' ? named.nameAr ?? named.name : named.name ?? named.nameAr) ?? null
  } catch {
    return null
  }
}

/**
 * Full human description of a coordinate for from/to rows:
 * geocoded address chain + nearest landmark. Either half is best-effort;
 * returns null only when both fail.
 */
export async function describePlace(coord: LatLng, lang: 'en' | 'ar' = 'ar'): Promise<string | null> {
  const [address, landmark] = await Promise.all([
    reverseGeocode(coord, lang),
    nearestLandmark(coord, lang),
  ])
  return combinePlaceLabel(address, landmark, lang)
}
