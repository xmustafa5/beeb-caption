import { View, Text } from 'react-native'
import { Marker } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import type { LatLng } from '@/hooks/use-current-location'

/** Numbered tint pickup pins + small destructive dropoff dots. Non-interactive. */
export function NafaratMarkers({ pickups, dropoffs }: { pickups: LatLng[]; dropoffs: LatLng[] }) {
  const colors = useThemeColors()
  return (
    <>
      {pickups.map((p, i) => (
        <Marker key={`pk-${i}`} lngLat={[p.longitude, p.latitude]} anchor="center">
          <View
            pointerEvents="none"
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.tint, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 4px rgba(0,0,0,0.35)' }}
          >
            <Text style={{ color: colors.onTint, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>{i + 1}</Text>
          </View>
        </Marker>
      ))}
      {dropoffs.map((d, i) => (
        <Marker key={`dp-${i}`} lngLat={[d.longitude, d.latitude]} anchor="center">
          <View
            pointerEvents="none"
            style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.destructive, borderWidth: 2, borderColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0,0,0,0.25)' }}
          />
        </Marker>
      ))}
    </>
  )
}
