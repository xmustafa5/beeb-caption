import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { reverseGeocode } from '@/services/places'
import type { LatLng } from '@/hooks/use-current-location'

/**
 * Reverse-geocodes a coordinate to a human place name, cached for the session.
 * Keyed by rounded coord + language so the same spot resolves once. Returns
 * { name: null, isLoading: true } until it resolves; name stays null on failure.
 */
export function usePlaceName(coord: LatLng | null): { name: string | null; isLoading: boolean } {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  // ~11 m precision — enough to dedupe pickups/dropoffs without losing distinct places.
  const key = coord ? `${coord.latitude.toFixed(4)},${coord.longitude.toFixed(4)}` : null

  const query = useQuery({
    queryKey: ['place-name', key, lang],
    queryFn: () => reverseGeocode(coord as LatLng, lang),
    enabled: coord != null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })

  return { name: query.data ?? null, isLoading: query.isLoading && coord != null }
}
