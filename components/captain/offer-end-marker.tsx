import { View, Text } from 'react-native'
import { Marker } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import type { LatLng } from '@/hooks/use-current-location'

interface OfferEndMarkerProps {
  coord: LatLng
  /** Which end of the trip this is — decides the colour. */
  kind: 'pickup' | 'dropoff'
  /**
   * The active offer's ends are drawn large and labelled; other offers' pickups
   * stay small muted dots so they read as background, not as this trip.
   */
  active: boolean
  /** "من" / "إلى" — shown only when active. Omit for the background dots. */
  label?: string
}

/**
 * One end of a trip on the queue map. Non-interactive — selection happens in the
 * carousel, not by tapping the map.
 *
 * The label matters: two bare dots on a map dense with POI markers don't read as
 * a trip, and nothing distinguishes start from finish. The chip repeats the
 * card's own wording so the map and the card agree.
 */
export function OfferEndMarker({ coord, kind, active, label }: OfferEndMarkerProps) {
  const colors = useThemeColors()
  const size = active ? 22 : 14
  const fill = !active ? colors.muted : kind === 'pickup' ? colors.tint : colors.destructive

  return (
    <Marker lngLat={[coord.longitude, coord.latitude]} anchor="center">
      <View pointerEvents="none" style={{ alignItems: 'center', gap: 3 }}>
        {active && label && (
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 8,
              borderCurve: 'continuous',
              paddingHorizontal: 6,
              paddingVertical: 2,
              boxShadow: '0px 1px 4px rgba(0,0,0,0.25)',
            }}
          >
            <Text style={{ ...Typography.micro, color: colors.text, fontStyle: 'normal' }}>{label}</Text>
          </View>
        )}
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: fill,
            borderWidth: active ? 3 : 2,
            borderColor: '#FFFFFF',
            opacity: active ? 1 : 0.85,
            boxShadow: active ? '0px 2px 8px rgba(0,0,0,0.35)' : '0px 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </View>
    </Marker>
  )
}
