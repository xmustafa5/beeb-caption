/**
 * Road and place names for the zoomed-out map, drawn from the base map's own vector tiles.
 *
 * The CARTO style only names highways from zoom 13, main roads from 14 and secondary roads from
 * 15. It has no layer at all for `macrohood` (Baghdad's quarters), and below zoom 13 it shows
 * places in English whatever the app's language.
 *
 * A road layer stops at the zoom where the style's own label for that road starts, so a road is
 * never named twice. A place label sits on top of the style's label at the same point, and
 * MapLibre's collision check drops the style's one. The tiles carry no road names below zoom 11
 * and only those of highways at zoom 11, so these zooms can't go any lower.
 *
 * If CARTO renames its source, these layers silently stop drawing and the base map is unaffected.
 */
import type { ExpressionSpecification, FilterSpecification } from '@maplibre/maplibre-gl-style-spec'

/** The vector source id inside the CARTO styles in `lib/map-style.ts`. */
export const BASE_MAP_SOURCE = 'protomaps'

export type MapLabelTone = 'strong' | 'muted'

export interface MapLabelLayer {
  id: string
  sourceLayer: 'roads' | 'places'
  minzoom: number
  maxzoom: number
  filter: FilterSpecification
  /** Text size at `minzoom` and at `maxzoom`. */
  size: [number, number]
  tone: MapLabelTone
}

function roadLayer(
  id: string,
  kinds: string[],
  minzoom: number,
  maxzoom: number,
  size: [number, number],
): MapLabelLayer {
  return {
    id,
    sourceLayer: 'roads',
    minzoom,
    maxzoom,
    filter: ['all', ['has', 'name'], ['in', ['get', 'kind_detail'], ['literal', kinds]]],
    size,
    tone: 'strong',
  }
}

function placeLayer(
  id: string,
  kind: string,
  details: string[] | null,
  minzoom: number,
  maxzoom: number,
  size: [number, number],
  tone: MapLabelTone,
): MapLabelLayer {
  const isKind: ExpressionSpecification = ['==', ['get', 'kind'], kind]
  return {
    id,
    sourceLayer: 'places',
    minzoom,
    maxzoom,
    filter: details
      ? ['all', ['has', 'name'], isKind, ['in', ['get', 'kind_detail'], ['literal', details]]]
      : ['all', ['has', 'name'], isKind],
    size,
    tone,
  }
}

/** Bottom to top. MapLibre places the top layer first, so later entries win a collision. */
export const MAP_LABEL_LAYERS: readonly MapLabelLayer[] = [
  roadLayer('beeb-label-road-secondary', ['secondary'], 12.5, 15, [10, 11]),
  roadLayer('beeb-label-road-primary', ['primary'], 12, 14, [10, 11]),
  placeLayer('beeb-label-village', 'locality', ['town', 'village', 'hamlet', 'locality'], 10, 13, [10, 12], 'muted'),
  placeLayer('beeb-label-neighbourhood', 'neighbourhood', null, 12, 14, [10, 12], 'muted'),
  placeLayer('beeb-label-quarter', 'macrohood', null, 10, 15, [11, 13], 'strong'),
  roadLayer('beeb-label-road-highway', ['motorway', 'trunk'], 11, 13, [11, 12]),
  placeLayer('beeb-label-city', 'locality', ['city'], 8, 13, [13, 16], 'strong'),
]

/** The name in the map's language, or the local name when the tiles have no translation. */
export function mapLabelText(lang: string): ExpressionSpecification {
  return ['coalesce', ['get', lang === 'ar' ? 'name:ar' : 'name:en'], ['get', 'name']]
}
