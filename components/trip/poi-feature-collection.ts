import { categoryStyle, poiCircleColor } from '@/lib/poi-categories'
import { poiLabel, type Poi } from '@/services/places-nearby'
import type { PoiFeatureProps } from '@/lib/map-style'
import type { ThemeColors } from '@/constants/Colors'

/**
 * `Poi[]` → GeoJSON FeatureCollection for the POI source. Each feature carries the scalar props
 * the data-driven layers read: `glyph` (icon-image name), `color` (resolved theme hex for the
 * chip), `label` (coalesced per `lang` at build time so a language switch re-labels without a
 * refetch), plus `category`/`tier`. Coordinates are `[lng, lat]` (GeoJSON order).
 */
export function buildPoiFeatureCollection(
  pois: Poi[],
  lang: 'en' | 'ar',
  colors: ThemeColors,
): GeoJSON.FeatureCollection<GeoJSON.Point, PoiFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => {
      const style = categoryStyle(p.category)
      return {
        type: 'Feature',
        id: p.id,
        properties: {
          id: p.id,
          label: poiLabel(p, lang),
          category: p.category,
          tier: style.tier,
          glyph: style.icon,
          color: poiCircleColor(style.colorKey, colors),
        },
        geometry: { type: 'Point', coordinates: [p.coord.longitude, p.coord.latitude] },
      }
    }),
  }
}
