import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Layer } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { contentLanguage } from '@/i18n/languages'
import { BASE_MAP_SOURCE, MAP_LABEL_LAYERS, mapLabelText } from '@/lib/map-labels'

/**
 * Names of highways, main roads, quarters and neighbourhoods when the map is zoomed out. Mount it
 * inside <Map>, above the route and below the POIs, so a POI wins a label collision.
 */
export function MapLabels() {
  const colors = useThemeColors()
  const { i18n } = useTranslation()
  const textField = useMemo(() => mapLabelText(contentLanguage(i18n.language)), [i18n.language])

  return (
    <>
      {MAP_LABEL_LAYERS.map((label) => (
        <Layer
          key={label.id}
          id={label.id}
          type="symbol"
          source={BASE_MAP_SOURCE}
          source-layer={label.sourceLayer}
          minzoom={label.minzoom}
          maxzoom={label.maxzoom}
          filter={label.filter}
          layout={{
            'text-field': textField,
            'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              label.minzoom,
              label.size[0],
              label.maxzoom,
              label.size[1],
            ],
            ...(label.sourceLayer === 'roads'
              ? ({ 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-max-angle': 30 } as const)
              : ({ 'text-max-width': 8 } as const)),
          }}
          paint={{
            'text-color': label.tone === 'strong' ? colors.secondary : colors.subtle,
            'text-halo-color': colors.background,
            'text-halo-width': 1.4,
          }}
        />
      ))}
    </>
  )
}
