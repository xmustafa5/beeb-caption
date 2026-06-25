import { useMemo } from 'react'
import type { NativeSyntheticEvent } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Images, GeoJSONSource, Layer, type FilterSpecification } from '@maplibre/maplibre-react-native'
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { useThemeStore } from '@/store/theme-store'
import { POI_MIN_ZOOM } from '@/lib/map-style'
import { buildTierOpacityExpression, TIER_MIN_ZOOM } from '@/lib/poi-categories'
import { POI_GLYPH_IMAGES } from '@/lib/poi-glyph-images'
import { type Poi } from '@/services/places-nearby'
import { buildPoiFeatureCollection } from './poi-feature-collection'

interface PoiOverlayProps {
  /** POIs for the current viewport (already fetched/filtered by the caller). */
  pois: Poi[]
  /** PRESENT → pins are tappable and select the POI (picker). ABSENT → visual-only. */
  onSelectPoi?: (poi: Poi) => void
}

/**
 * Native POI overlay, Baly-style: flat individual icons, NO clustering. ONE GeoJSON source feeds
 * three thin layers — a small colored chip, the white category glyph on top, and a collision-
 * droppable label. Everything renders on the GPU as native symbol/circle layers (no per-POI RN
 * <Marker> views — those were the cause of the old stutter + vanish-on-zoom).
 *
 * De-cluttering is handled by MapLibre's NATIVE symbol collision (`icon-allow-overlap: false`):
 * as you zoom out, icons that would overlap are dropped automatically and fade back in as you zoom
 * in — the same mechanism the reference app uses, no count-bubbles. The chip is kept small and
 * borderless so a pin reads as part of the map (à la Baly) rather than a chunky floating marker.
 *
 * Tapping a pin selects it (when onSelectPoi is provided). There is no cluster tap.
 */
export function PoiOverlay({ pois, onSelectPoi }: PoiOverlayProps) {
  const colors = useThemeColors()
  const scheme = useThemeStore((s) => s.scheme)
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  const data = useMemo(() => buildPoiFeatureCollection(pois, lang, colors), [pois, lang, colors])

  // Per-tier zoom FADE. Each feature's opacity is driven by its `tier` and the current zoom: a tier is
  // invisible below its fade band, fully opaque above it, linearly interpolated between — so zooming IN
  // fades each tier in and zooming OUT fades it out (the standard map behavior). Landmarks (tier 1) are
  // up early; notable places (tier 2) fade in mid-zoom; fine detail (tier 3, the shop/salon flood) only
  // near max zoom. Built as a SINGLE zoom `interpolate` with a per-stop `match` on tier — MapLibre
  // rejects more than one zoom curve per expression, so the tier branching is folded into the one
  // curve's stops (see buildTierOpacityExpression). lib/poi-categories.ts is the single source of truth.
  // Shared by chip/glyph/label so they fade together as one unit.
  const tierOpacity = useMemo(() => buildTierOpacityExpression() as ExpressionSpecification, [])

  // Cheap cull: don't even draw a feature whose tier hasn't begun fading in at the current zoom (opacity
  // would be 0). Keeps the bridge/GPU load down without affecting the visible result. `step` thresholds
  // mirror each tier's fade-in START (TIER_MIN_ZOOM); the opacity ramp above does the actual fade.
  const cullFilter = useMemo<FilterSpecification>(
    () => ['<=', ['get', 'tier'], ['step', ['zoom'], 1, TIER_MIN_ZOOM[2], 2, TIER_MIN_ZOOM[3], 3]],
    [],
  )

  // Tap: find the pressed feature's POI by id and select it.
  const onPress = (e: NativeSyntheticEvent<{ features: GeoJSON.Feature[] }>) => {
    if (!onSelectPoi) return
    const f = e.nativeEvent.features?.[0]
    if (!f) return
    const id = (f.properties as { id?: string } | null)?.id
    const poi = id ? pois.find((p) => p.id === id) : undefined
    if (poi) onSelectPoi(poi)
  }

  return (
    <>
      <Images images={POI_GLYPH_IMAGES} />
      <GeoJSONSource id="poi-src" data={data} onPress={onPress}>
        {/* Small flat chip behind the glyph — borderless, no shadow, so it reads as part of the
            map (Baly-style) not a floating pin. Color comes from the category (most are subtle). */}
        <Layer
          id="poi-chip"
          type="circle"
          minzoom={POI_MIN_ZOOM}
          filter={cullFilter}
          paint={{
            'circle-color': ['get', 'color'],
            'circle-radius': 9,
            'circle-opacity': tierOpacity, // fade in/out with zoom by tier
            // subtle ring in the basemap's background tone instead of a loud white stroke
            'circle-stroke-color': scheme === 'dark' ? '#000000' : '#FFFFFF',
            'circle-stroke-width': 1,
            'circle-stroke-opacity': tierOpacity, // ring fades with the chip
          }}
        />
        {/* White category glyph on the chip. icon-allow-overlap:true matches the chip (always
            drawn); de-cluttering is handled by the label layer's collision below, so the icons
            stay put while only labels drop in dense areas (the chip+glyph read as one unit). */}
        <Layer
          id="poi-glyph"
          type="symbol"
          minzoom={POI_MIN_ZOOM}
          filter={cullFilter}
          layout={{
            'icon-image': ['get', 'glyph'],
            'icon-size': 0.28,
            'icon-allow-overlap': true,
          }}
          paint={{
            'icon-opacity': tierOpacity, // fade in/out with zoom by tier (matches the chip)
          }}
        />
        {/* Label under the icon — collision-droppable so dense areas stay readable. */}
        <Layer
          id="poi-label"
          type="symbol"
          minzoom={POI_MIN_ZOOM + 1.5}
          filter={cullFilter}
          layout={{
            'text-field': ['get', 'label'],
            'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
            'text-size': 10,
            'text-anchor': 'top',
            'text-offset': [0, 1.1],
            'text-max-width': 8,
            'text-optional': true,
            'text-allow-overlap': false,
          }}
          paint={{
            'text-color': colors.text,
            'text-opacity': tierOpacity, // fade in/out with zoom by tier (collision still thins dense labels)
            'text-halo-color': scheme === 'dark' ? '#000000' : '#FFFFFF',
            'text-halo-width': 1.2,
          }}
        />
      </GeoJSONSource>
    </>
  )
}
