import { useQueries, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { describePlace } from '@/services/place-label'
import type { LatLng } from '@/hooks/use-current-location'
import type { AppLanguage } from '@/i18n/languages'

const placeNameKey = (coord: LatLng, lang: AppLanguage) => [
  'place-name',
  // ~11 m precision — enough to dedupe pickups/dropoffs without losing distinct places.
  `${coord.latitude.toFixed(4)},${coord.longitude.toFixed(4)}`,
  lang,
]

/**
 * Describes a coordinate as a rich place label (area، mahalla، street، nearest
 * landmark), cached for the session. Keyed by rounded coord + language so the
 * same spot resolves once. Returns { name: null, isLoading: true } until it
 * resolves; name stays null on failure.
 */
export function usePlaceName(coord: LatLng | null): { name: string | null; isLoading: boolean } {
  const { i18n } = useTranslation()
  const lang = i18n.language as AppLanguage
  const query = useQuery({
    queryKey: coord ? placeNameKey(coord, lang) : ['place-name', null, lang],
    queryFn: () => describePlace(coord as LatLng, lang),
    enabled: coord != null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })

  return { name: query.data ?? null, isLoading: query.isLoading && coord != null }
}

/** The same lookup for a list of places, in order, for when the list's length isn't fixed. */
export function usePlaceNames(coords: LatLng[]): (string | null)[] {
  const { i18n } = useTranslation()
  const lang = i18n.language as AppLanguage
  return useQueries({
    queries: coords.map((coord) => ({
      queryKey: placeNameKey(coord, lang),
      queryFn: () => describePlace(coord, lang),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: 1,
    })),
  }).map((q) => q.data ?? null)
}
