import * as Location from 'expo-location'
import { BAGHDAD_PLACES, type Place } from '@/constants/places'
import { haversineKm } from '@/hooks/use-distance'
import type { LatLng } from '@/hooks/use-current-location'

export interface PlaceResult {
  id: string
  title: string
  subtitle: string
  coord: LatLng
  source: 'curated' | 'geocoded'
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[ً-ْ]/g, '') // strip Arabic diacritics
    .trim()
}

function placeToResult(place: Place, lang: 'en' | 'ar'): PlaceResult {
  return {
    id: `curated:${place.id}`,
    title: place.name[lang],
    subtitle: place.area[lang],
    coord: place.coord,
    source: 'curated',
  }
}

export function getPopularPlaces(here: LatLng | null, lang: 'en' | 'ar', limit = 8): PlaceResult[] {
  const sorted = [...BAGHDAD_PLACES]
  if (here) {
    sorted.sort((a, b) => haversineKm(a.coord, here) - haversineKm(b.coord, here))
  }
  return sorted.slice(0, limit).map((p) => placeToResult(p, lang))
}

function searchCurated(query: string, lang: 'en' | 'ar'): PlaceResult[] {
  const q = normalize(query)
  if (q.length === 0) return []
  return BAGHDAD_PLACES
    .map((p) => {
      const inEn = normalize(p.name.en).includes(q) || normalize(p.area.en).includes(q)
      const inAr = normalize(p.name.ar).includes(q) || normalize(p.area.ar).includes(q)
      const score = inEn || inAr ? 1 : 0
      return { p, score }
    })
    .filter((x) => x.score > 0)
    .map((x) => placeToResult(x.p, lang))
    .slice(0, 6)
}

async function searchGeocoded(query: string): Promise<PlaceResult[]> {
  if (query.trim().length < 4) return []
  try {
    const results = await Location.geocodeAsync(query)
    return results.slice(0, 5).map((r, i) => ({
      id: `geo:${r.latitude},${r.longitude}:${i}`,
      title: query,
      subtitle: 'Suggested location',
      coord: { latitude: r.latitude, longitude: r.longitude },
      source: 'geocoded' as const,
    }))
  } catch {
    return []
  }
}

export async function searchPlaces(query: string, lang: 'en' | 'ar'): Promise<PlaceResult[]> {
  const curated = searchCurated(query, lang)
  if (curated.length >= 4) return curated
  const geocoded = await searchGeocoded(query)
  // de-duplicate by curated coord proximity
  const merged = [...curated]
  for (const g of geocoded) {
    if (!merged.some((m) => Math.abs(m.coord.latitude - g.coord.latitude) < 0.0005 && Math.abs(m.coord.longitude - g.coord.longitude) < 0.0005)) {
      merged.push(g)
    }
  }
  return merged.slice(0, 8)
}

export async function reverseGeocode(coord: LatLng): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync(coord)
    const r = results[0]
    if (!r) return null
    const parts = [r.name, r.street, r.district, r.city].filter(Boolean) as string[]
    if (parts.length === 0) return null
    return parts.slice(0, 2).join(', ')
  } catch {
    return null
  }
}
