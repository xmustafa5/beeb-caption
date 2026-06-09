import { forwardRef } from 'react'
import { View } from 'react-native'
import MapView, { Marker, Polygon, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps'
import type { ComponentProps, Ref, ReactNode } from 'react'
import type { LatLng } from '@/hooks/use-current-location'
import { useThemeColors } from '@/hooks/use-theme-colors'

interface TripMapProps {
  initialRegion?: Region
  showsUserLocation?: boolean
  pickup?: LatLng
  pickups?: LatLng[]
  stops?: LatLng[]
  dropoff?: LatLng
  driver?: LatLng
  zonePolygon?: LatLng[]
  routeCoords?: LatLng[]
  onRegionChangeComplete?: ComponentProps<typeof MapView>['onRegionChangeComplete']
  onPress?: ComponentProps<typeof MapView>['onPress']
  scrollEnabled?: boolean
  zoomEnabled?: boolean
  pointerEvents?: 'auto' | 'none'
  children?: ReactNode
}

export const TripMap = forwardRef<MapView, TripMapProps>(function TripMap(
  {
    initialRegion,
    showsUserLocation = true,
    pickup,
    pickups,
    stops,
    dropoff,
    driver,
    zonePolygon,
    routeCoords,
    onRegionChangeComplete,
    onPress,
    scrollEnabled = true,
    zoomEnabled = true,
    pointerEvents,
    children,
  },
  ref: Ref<MapView>,
) {
  const colors = useThemeColors()

  return (
    <View style={{ flex: 1 }} pointerEvents={pointerEvents}>
      <MapView
        ref={ref}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        toolbarEnabled={false}
        scrollEnabled={scrollEnabled}
        zoomEnabled={zoomEnabled}
        rotateEnabled={false}
        pitchEnabled={false}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onPress}
      >
        {zonePolygon && zonePolygon.length >= 3 && (
          <Polygon
            coordinates={zonePolygon}
            strokeColor={colors.tint}
            fillColor={colors.tint + '33'}
            strokeWidth={2}
          />
        )}
        {routeCoords && routeCoords.length >= 2 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={colors.tint}
            strokeWidth={4}
          />
        )}
        {pickup && (
          <Marker coordinate={pickup} pinColor={colors.tint} title="Pickup" />
        )}
        {pickups?.map((p, i) => (
          <Marker key={`pk-${i}`} coordinate={p} pinColor={colors.tint} title={`Pickup ${i + 1}`} />
        ))}
        {stops?.map((s, i) => (
          <Marker key={`stop-${i}`} coordinate={s} pinColor={colors.info} title={`Stop ${i + 1}`} />
        ))}
        {dropoff && (
          <Marker coordinate={dropoff} pinColor={colors.destructive} title="Drop-off" />
        )}
        {driver && (
          <Marker coordinate={driver} pinColor={colors.info} title="Driver" />
        )}
        {children}
      </MapView>
    </View>
  )
})
