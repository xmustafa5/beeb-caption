import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { View, Text, I18nManager } from 'react-native'
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import type { Ref, ReactNode } from 'react'
import type { LatLng } from '@/hooks/use-current-location'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { useThemeStore } from '@/store/theme-store'
import {
  mapStyleFor,
  toLngLat,
  toPolygonFeature,
  toLineFeature,
  deltaToZoom,
  boundsFor,
  bboxFromBounds,
  type Bbox,
} from '@/lib/map-style'
import { useViewportPois } from '@/hooks/use-pois'
import { PoiOverlay } from '@/components/trip/poi-overlay'

/** react-native-maps-style region (kept so callers don't change). */
export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

/** Imperative handle exposed to callers — mirrors the one react-native-maps method we used. */
export interface TripMapHandle {
  animateToRegion: (region: MapRegion, durationMs?: number) => void
}

interface TripMapProps {
  initialRegion?: MapRegion
  showsUserLocation?: boolean
  pickup?: LatLng
  pickups?: LatLng[]
  stops?: LatLng[]
  dropoff?: LatLng
  driver?: LatLng
  zonePolygon?: LatLng[]
  routeCoords?: LatLng[]
  /**
   * Frame the map to enclose ALL these points (pickup + dropoff + route) with
   * padding — shows the whole road instead of a fixed over-zoomed region.
   * Takes precedence over initialRegion when it has ≥2 points.
   */
  fitToCoords?: LatLng[]
  /** Fires after a pan settles, with the new center as a LatLng. */
  onRegionChangeComplete?: (center: LatLng) => void
  /**
   * Opt-in: render non-interactive POI labels (cafés, shops, …) once zoomed past
   * POI_MIN_ZOOM. Default OFF — only calm planning maps opt in; busy/live maps omit it.
   */
  showPois?: boolean
  /** Fires on map tap, with the tapped coordinate as a LatLng. */
  onPress?: (coord: LatLng) => void
  scrollEnabled?: boolean
  zoomEnabled?: boolean
  pointerEvents?: 'auto' | 'none'
  children?: ReactNode
}

/** A round colored pin used for markers (MapLibre needs a child view per Marker). */
function PinDot({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: '#FFFFFF',
        boxShadow: '0px 1px 4px rgba(0,0,0,0.35)',
      }}
    />
  )
}

export const TripMap = forwardRef<TripMapHandle, TripMapProps>(function TripMap(
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
    fitToCoords,
    onRegionChangeComplete,
    onPress,
    scrollEnabled = true,
    zoomEnabled = true,
    pointerEvents,
    showPois = false,
    children,
  },
  ref: Ref<TripMapHandle>,
) {
  const colors = useThemeColors()
  const scheme = useThemeStore((s) => s.scheme)
  const cameraRef = useRef<CameraRef>(null)

  // POIs are the VISIBLE VIEWPORT's set, refetched on pan-settle but grid-snapped so casual pans hit
  // the cache (no refetch, no re-serialize) and `placeholderData` avoids blank flashes. `bbox`/`zoom`
  // come from onRegionDidChange below; the first settle seeds them. The hook's zoom gate (with
  // hysteresis) skips fetching when zoomed out, and `enabled: showPois` keeps live/busy maps out.
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [poiZoom, setPoiZoom] = useState<number | null>(null)
  const { pois } = useViewportPois(bbox, poiZoom, { enabled: showPois })

  useImperativeHandle(ref, () => ({
    animateToRegion: (region, durationMs = 450) => {
      cameraRef.current?.easeTo({
        center: toLngLat(region),
        zoom: deltaToZoom(region.latitudeDelta),
        duration: durationMs,
      })
    },
  }), [])

  // Frame all of fitToCoords with padding so the whole route is visible.
  const fitKey = fitToCoords?.map((c) => `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`).join('|')
  const fitToRoute = useCallback((durationMs: number) => {
    const pts = fitToCoords
    if (!pts || pts.length < 2) return
    const bounds = boundsFor(pts)
    if (!bounds) return
    cameraRef.current?.fitBounds(bounds, {
      padding: { top: 56, right: 48, bottom: 56, left: 48 },
      duration: durationMs,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  // Re-fit when the route changes (after the map has loaded).
  useEffect(() => { fitToRoute(400) }, [fitToRoute])

  const center = initialRegion ? toLngLat(initialRegion) : undefined
  const zoom = initialRegion ? deltaToZoom(initialRegion.latitudeDelta) : 14

  return (
    <View style={{ flex: 1 }} pointerEvents={pointerEvents}>
      <Map
        mapStyle={mapStyleFor(scheme)}
        style={{ flex: 1 }}
        logo={false}
        attribution={false}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        dragPan={scrollEnabled}
        touchZoom={zoomEnabled}
        onDidFinishLoadingMap={() => { fitToRoute(0) }}
        onRegionDidChange={
          // Wired whenever we render POIs (to window the viewport) OR a consumer wants the settle
          // center. When showPois, each settle captures the visible bbox + zoom for useViewportPois;
          // the FIRST settle seeds the initial bbox (until then the overlay renders nothing — one frame).
          showPois || onRegionChangeComplete
            ? (e) => {
                const { center, zoom: z, bounds } = e.nativeEvent
                if (showPois) {
                  if (typeof z === 'number') setPoiZoom(z)
                  if (bounds) setBbox(bboxFromBounds(bounds))
                }
                if (onRegionChangeComplete && center) {
                  onRegionChangeComplete({ latitude: center[1], longitude: center[0] })
                }
              }
            : undefined
        }
        onPress={
          onPress
            ? (e) => {
                const [lng, lat] = e.nativeEvent.lngLat
                onPress({ latitude: lat, longitude: lng })
              }
            : undefined
        }
      >
        <Camera ref={cameraRef} initialViewState={center ? { center, zoom } : undefined} />

        {showsUserLocation && <UserLocation />}

        {zonePolygon && zonePolygon.length >= 3 && (
          <GeoJSONSource id="zone-src" data={toPolygonFeature(zonePolygon)}>
            <Layer id="zone-fill" type="fill" paint={{ 'fill-color': colors.tint, 'fill-opacity': 0.2 }} />
            <Layer id="zone-line" type="line" paint={{ 'line-color': colors.tint, 'line-width': 2 }} />
          </GeoJSONSource>
        )}

        {routeCoords && routeCoords.length >= 2 && (
          <GeoJSONSource id="route-src" data={toLineFeature(routeCoords)}>
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': colors.tint, 'line-width': 4 }}
            />
          </GeoJSONSource>
        )}

        {/* POI labels (visual-only) — before the markers so native <Marker> views render on top.
            Mounted whenever opted-in & we have pins; the layer minzoom hides them when zoomed out,
            so the source survives a zoom wobble (no flicker). Empty pois → overlay renders null. */}
        {showPois && <PoiOverlay pois={pois} />}

        {pickup && (
          <Marker lngLat={toLngLat(pickup)} anchor="center"><PinDot color={colors.tint} /></Marker>
        )}
        {pickups?.map((p, i) => (
          <Marker key={`pk-${i}`} lngLat={toLngLat(p)} anchor="center"><PinDot color={colors.tint} /></Marker>
        ))}
        {stops?.map((s, i) => (
          <Marker key={`stop-${i}`} lngLat={toLngLat(s)} anchor="center"><PinDot color={colors.info} /></Marker>
        ))}
        {dropoff && (
          <Marker lngLat={toLngLat(dropoff)} anchor="center"><PinDot color={colors.destructive} /></Marker>
        )}
        {driver && (
          <Marker lngLat={toLngLat(driver)} anchor="center"><PinDot color={colors.info} /></Marker>
        )}
        {children}
      </Map>

      {/* Required OSM/CARTO attribution — subtle, bottom edge. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 4,
          ...(I18nManager.isRTL ? { left: 6 } : { right: 6 }),
          backgroundColor: 'rgba(0,0,0,0.35)',
          borderRadius: 4,
          paddingHorizontal: 5,
          paddingVertical: 1,
        }}
      >
        <Text style={{ fontSize: 9, color: '#FFFFFF' }}>© OpenStreetMap · CARTO</Text>
      </View>
    </View>
  )
})
