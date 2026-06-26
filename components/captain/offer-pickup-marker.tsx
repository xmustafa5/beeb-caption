import { View } from 'react-native'
import { Marker } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import type { LatLng } from '@/hooks/use-current-location'

interface OfferPickupMarkerProps {
  coord: LatLng
  active: boolean
}

/** A pickup pin on the queue map. Active = larger filled tint; inactive = small muted dot.
 *  Non-interactive — selection happens in the carousel, not by tapping the map. */
export function OfferPickupMarker({ coord, active }: OfferPickupMarkerProps) {
  const colors = useThemeColors()
  const size = active ? 22 : 14
  return (
    <Marker lngLat={[coord.longitude, coord.latitude]} anchor="center">
      <View
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active ? colors.tint : colors.muted,
          borderWidth: active ? 3 : 2,
          borderColor: '#FFFFFF',
          opacity: active ? 1 : 0.85,
          boxShadow: active ? '0px 2px 8px rgba(0,0,0,0.35)' : '0px 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </Marker>
  )
}
