import { BAGHDAD_PLACES, type Place } from '@/constants/places'
import { haversineKm } from '@/hooks/use-distance'
import type { LatLng } from '@/hooks/use-current-location'
import type { Poi } from '@/services/places-nearby'

export interface PlaceResult {
  id: string
  title: string
  subtitle: string
  coord: LatLng
  source: 'curated' | 'geocoded' | 'poi'
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

// Nominatim (OpenStreetMap) — free, no key, Arabic-capable. Biased to Baghdad/Iraq.
// The OS geocoder (expo-location) was unreliable for Arabic Baghdad queries; OSM
// has good Arabic coverage of Iraqi districts. Their usage policy asks for a
// descriptive User-Agent and ≤1 req/sec (the UI debounces searches).
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse'
// Baghdad bounding box (left,top,right,bottom) — biases ranking toward the city.
const BAGHDAD_VIEWBOX = '44.20,33.45,44.62,33.20'
const GEOCODER_HEADERS = { 'User-Agent': 'BeebRiderApp/1.0 (ride-hailing; Baghdad)' }

// Photon (OpenStreetMap, free, no key) — built for TYPE-AS-YOU-GO autocomplete.
// Nominatim's /search needs a near-complete name (typing "جامعة الفراهي" → 0
// results); Photon matches partial prefixes and returns Arabic names. So Photon
// is the primary search; Nominatim is the fallback when Photon is empty/down.
const PHOTON_URL = 'https://photon.komoot.io/api/'
const BAGHDAD_LAT = 33.31
const BAGHDAD_LON = 44.36

interface PhotonFeature {
  geometry: { coordinates: [number, number] } // [lon, lat]
  properties: {
    osm_id?: number
    name?: string
    district?: string
    city?: string
    state?: string
  }
}

async function searchPhoton(query: string): Promise<PlaceResult[]> {
  if (query.trim().length < 2) return []
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '6',
      lat: String(BAGHDAD_LAT), // bias results toward Baghdad
      lon: String(BAGHDAD_LON),
    })
    const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: GEOCODER_HEADERS })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: PhotonFeature[] }
    return (data.features ?? [])
      .filter((f) => f.properties.name) // skip nameless geometry
      .map((f) => {
        const p = f.properties
        const [lon, lat] = f.geometry.coordinates
        const sub = [p.district || p.city, p.state].filter((x) => x && x !== p.name)
        return {
          id: `photon:${p.osm_id ?? `${lat},${lon}`}`,
          title: p.name as string,
          subtitle: sub.join('، '),
          coord: { latitude: lat, longitude: lon },
          source: 'geocoded' as const,
        }
      })
  } catch {
    return []
  }
}

interface NominatimResult {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
  address?: Record<string, string>
}

/** First meaningful address part to use as a concise title. */
function shortTitle(r: NominatimResult): string {
  if (r.name) return r.name
  const a = r.address ?? {}
  return (
    a.road || a.neighbourhood || a.suburb || a.quarter || a.city_district ||
    a.city || a.town || a.village || r.display_name.split(',')[0]
  )
}

/** A concise area subtitle (district، city). */
function shortSubtitle(r: NominatimResult): string {
  const a = r.address ?? {}
  const parts = [a.suburb || a.neighbourhood || a.city_district, a.city || a.town || a.state]
    .filter(Boolean)
  return parts.join('، ') || r.display_name.split(',').slice(1, 3).join(',').trim()
}

async function searchNominatim(query: string, lang: 'en' | 'ar'): Promise<PlaceResult[]> {
  if (query.trim().length < 2) return []
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '6',
      countrycodes: 'iq',
      viewbox: BAGHDAD_VIEWBOX,
      bounded: '0', // bias to Baghdad but still allow nearby matches
      'accept-language': lang === 'ar' ? 'ar' : 'en',
    })
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers: GEOCODER_HEADERS })
    if (!res.ok) return []
    const data = (await res.json()) as NominatimResult[]
    return data.map((r) => ({
      id: `osm:${r.place_id}`,
      title: shortTitle(r),
      subtitle: shortSubtitle(r),
      coord: { latitude: parseFloat(r.lat), longitude: parseFloat(r.lon) },
      source: 'geocoded' as const,
    }))
  } catch {
    return []
  }
}

// Photon first (handles partial/prefix queries), Nominatim as fallback.
async function searchGeocoded(query: string, lang: 'en' | 'ar'): Promise<PlaceResult[]> {
  const photon = await searchPhoton(query)
  if (photon.length > 0) return photon
  return searchNominatim(query, lang)
}

/** Filter already-loaded viewport POIs by name, nearest-first. Highest-priority search results. */
export function searchLoadedPois(
  query: string,
  lang: 'en' | 'ar',
  pois: Poi[],
  center: LatLng,
): PlaceResult[] {
  const q = normalize(query)
  if (q.length === 0) return []
  return pois
    .map((p) => {
      const display = lang === 'ar' ? p.nameAr ?? p.name : p.name ?? p.nameAr
      const hit = normalize(`${p.name ?? ''} ${p.nameAr ?? ''}`).includes(q)
      return { p, display, hit }
    })
    .filter((x) => x.hit && x.display)
    .sort((a, b) => haversineKm(a.p.coord, center) - haversineKm(b.p.coord, center))
    .slice(0, 6)
    .map((x) => ({
      id: `poi:${x.p.id}`,
      title: x.display as string,
      subtitle: x.p.category,
      coord: x.p.coord,
      source: 'poi' as const,
    }))
}

/** True if `r` sits within ~55m (0.0005°) of any already-merged result — a near-duplicate. */
function isNearDuplicate(r: PlaceResult, existing: PlaceResult[]): boolean {
  return existing.some(
    (m) =>
      Math.abs(m.coord.latitude - r.coord.latitude) < 0.0005 &&
      Math.abs(m.coord.longitude - r.coord.longitude) < 0.0005,
  )
}

export async function searchPlaces(
  query: string,
  lang: 'en' | 'ar',
  nearbyPois?: Poi[],
  center?: LatLng,
): Promise<PlaceResult[]> {
  const poiHits = nearbyPois && center ? searchLoadedPois(query, lang, nearbyPois, center) : []
  // POIs rank first (real local places); curated then geocoded fill in, each deduped against
  // everything already merged so a landmark that is both a POI and a curated place isn't listed twice.
  const merged: PlaceResult[] = [...poiHits]
  for (const c of searchCurated(query, lang)) {
    if (!isNearDuplicate(c, merged)) merged.push(c)
  }
  if (merged.length < 4) {
    for (const g of await searchGeocoded(query, lang)) {
      if (!isNearDuplicate(g, merged)) merged.push(g)
    }
  }
  return merged.slice(0, 8)
}

export async function reverseGeocode(coord: LatLng, lang: 'en' | 'ar' = 'ar'): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      lat: String(coord.latitude),
      lon: String(coord.longitude),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18', // building/street-level detail
      'accept-language': lang === 'ar' ? 'ar' : 'en',
    })
    const res = await fetch(`${REVERSE_URL}?${params.toString()}`, { headers: GEOCODER_HEADERS })
    if (!res.ok) return null
    const r = (await res.json()) as NominatimResult
    const a = r.address ?? {}
    const parts = [
      a.road || a.neighbourhood || a.suburb || r.name,
      a.suburb || a.city_district || a.city || a.town,
    ].filter(Boolean) as string[]
    if (parts.length === 0) return r.display_name?.split(',').slice(0, 2).join(',') ?? null
    return parts.slice(0, 2).join('، ')
  } catch {
    return null
  }
}
