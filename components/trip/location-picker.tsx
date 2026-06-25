import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Map, Camera, GeoJSONSource, Layer, UserLocation, type CameraRef } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { useThemeStore } from '@/store/theme-store'
import {
  mapStyleFor,
  toLngLat,
  toPolygonFeature,
  deltaToZoom,
  bboxFromBounds,
  POI_MIN_ZOOM,
  type Bbox,
} from '@/lib/map-style'
import { useCityPois, useViewportPois } from '@/hooks/use-pois'
import { PoiOverlay } from '@/components/trip/poi-overlay'
import { poiLabel, type Poi } from '@/services/places-nearby'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { useCurrentLocation, type LatLng } from '@/hooks/use-current-location'
import { RecenterButton } from '@/components/trip/recenter-button'
import {
  getPopularPlaces,
  reverseGeocode,
  searchPlaces,
  type PlaceResult,
} from '@/services/places'
import { isPointInPolygon } from '@/lib/point-in-polygon'

export interface LocationPickerResult {
  coord: LatLng
  address: string | null
}

interface LocationPickerProps {
  title: string
  ctaLabel: string
  initialCenter: LatLng
  /** Optional polygon — pin must stay inside this. Used for Abriyah zones. */
  zonePolygon?: LatLng[]
  /** Optional second pin to display on the map (e.g. show pickup while choosing dropoff). */
  otherPin?: { coord: LatLng; type: 'pickup' | 'dropoff' }
  pinKind?: 'pickup' | 'dropoff'
  onCancel: () => void
  onConfirm: (result: LocationPickerResult) => void
}

export function LocationPicker({
  title,
  ctaLabel,
  initialCenter,
  zonePolygon,
  otherPin,
  pinKind = 'dropoff',
  onCancel,
  onConfirm,
}: LocationPickerProps) {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const scheme = useThemeStore((s) => s.scheme)
  const insets = useSafeAreaInsets()
  const cameraRef = useRef<CameraRef>(null)
  const lang = i18n.language as 'en' | 'ar'
  const { location } = useCurrentLocation()

  // react-native-maps used latitudeDelta; MapLibre uses a zoom level.
  const zoomLevel = deltaToZoom(zonePolygon ? 0.03 : 0.012)

  const [center, setCenter] = useState<LatLng>(initialCenter)
  const [address, setAddress] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [searchActive, setSearchActive] = useState(false)

  // Two POI sources, deliberately split:
  //  - `pois` (VIEWPORT): the overlay's pins, windowed to the visible bbox and refetched on pan-settle.
  //    Re-keying is SAFE here — the grid-snapped key + keep-prev mean a casual pan hits cache and pins
  //    don't pop (the old design re-keyed to the live center every settle and re-fetched/replaced the
  //    whole set; that thrash is what made the map fall apart while moving — the grid key fixes it).
  //  - `cityPois` (SEARCH): the ≤1000-city set the text search filters over, so search recall isn't
  //    narrowed to the visible rectangle. Fetched LAZILY — only once the rider opens the search overlay
  //    (`searchActive`), not on app open or picker mount, since most picker sessions just drop a pin and
  //    never search. `staleTime: Infinity` caches it for the rest of the session after the first search.
  const [bbox, setBbox] = useState<Bbox | null>(null)
  const [zoom, setZoom] = useState<number | null>(null)
  const { pois } = useViewportPois(bbox, zoom)
  const { pois: cityPois } = useCityPois(searchActive)

  // When the rider taps a POI we set its name as the address; the reverse-geocoder must NOT
  // overwrite it. A one-shot token doesn't work: easeTo settles a few sub-metres off poi.coord
  // and fires onRegionDidChange again, re-running the geocode effect after the token is consumed.
  // Instead we remember the picked coord and suppress geocoding while the map center is still ~at
  // it (covers the settle echo and a re-tap on the current center); a genuine pan away clears it.
  const pickedCoordRef = useRef<LatLng | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)

  const popular = useRef<PlaceResult[] | null>(null)
  if (popular.current === null) {
    popular.current = getPopularPlaces(initialCenter, lang, 8)
  }

  // Recenter on the rider's location the FIRST time a real fix arrives after mount
  // (GPS resolves async, so initialCenter starts as the fallback Baghdad center).
  // We fly exactly once — later GPS watch updates must NOT yank the map while the
  // user is panning to choose a spot. A retry covers the case where the MapLibre
  // camera ref isn't attached yet on the first effect run.
  const initialCenterKey = `${initialCenter.latitude.toFixed(5)},${initialCenter.longitude.toFixed(5)}`
  const flewToGpsRef = useRef(false)
  const mountKeyRef = useRef(initialCenterKey)
  useEffect(() => {
    if (flewToGpsRef.current) return
    // Only act once initialCenter actually differs from the mount value (= a real fix).
    if (initialCenterKey === mountKeyRef.current) return
    flewToGpsRef.current = true
    setCenter(initialCenter)
    const target = { center: toLngLat(initialCenter), zoom: zoomLevel, duration: 500 }
    const fly = () => cameraRef.current?.easeTo(target)
    fly()
    // Ref may not be attached on the first paint — retry next frame.
    requestAnimationFrame(fly)
  }, [initialCenterKey])

  const inZone = !zonePolygon || isPointInPolygon(center, zonePolygon)
  const canConfirm = inZone && !resolving

  // Debounced reverse geocoding when the map settles.
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // A POI tap already set a precise name — skip geocoding while the center is still ~at the
    // picked coord (~33 m). This survives the easeTo settle echo (sub-metre drift) and a re-tap on
    // the current center; a genuine pan moves outside the epsilon and geocodes normally.
    const picked = pickedCoordRef.current
    if (
      picked &&
      Math.abs(center.latitude - picked.latitude) < 3e-4 &&
      Math.abs(center.longitude - picked.longitude) < 3e-4
    ) {
      return
    }
    pickedCoordRef.current = null // moved away from the pick → resume normal geocoding
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    setResolving(true)
    reverseTimer.current = setTimeout(async () => {
      const a = await reverseGeocode(center, lang)
      setAddress(a)
      setResolving(false)
    }, 400)
    return () => {
      if (reverseTimer.current) clearTimeout(reverseTimer.current)
    }
  }, [center.latitude, center.longitude])

  // Debounced search.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length === 0) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const r = await searchPlaces(query, lang, cityPois, center)
      setResults(r)
      setSearching(false)
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query, lang])

  const flyTo = (coord: LatLng) => {
    cameraRef.current?.easeTo({ center: toLngLat(coord), zoom: zoomLevel, duration: 450 })
  }

  const onPickResult = (place: PlaceResult) => {
    if (zonePolygon && !isPointInPolygon(place.coord, zonePolygon)) {
      // Reject silently — the user will see the result is "outside zone" via no fly-to
      return
    }
    setQuery('')
    setSearchActive(false)
    Keyboard.dismiss()
    setCenter(place.coord)
    flyTo(place.coord)
  }

  // Tapping a POI snaps the crosshair onto it and uses its name as the chosen address.
  const onSelectPoi = (poi: Poi) => {
    if (zonePolygon && !isPointInPolygon(poi.coord, zonePolygon)) return // reject silently (like onPickResult)
    pickedCoordRef.current = poi.coord // suppress geocoding around this coord (set BEFORE setCenter)
    setAddress(poiLabel(poi, lang))
    setCenter(poi.coord)
    // Ease IN past the gate so the zone-constrained picker (opens below it) keeps pins alive after a pick.
    cameraRef.current?.easeTo({
      center: toLngLat(poi.coord),
      zoom: Math.max(zoomLevel, POI_MIN_ZOOM),
      duration: 450,
    })
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Map (always rendered, hides behind search overlay) */}
      <View style={{ ...StyleAbsoluteFill }}>
        <Map
          mapStyle={mapStyleFor(scheme)}
          style={{ flex: 1 }}
          logo={false}
          attribution={false}
          compass={false}
          touchRotate={false}
          touchPitch={false}
          onRegionDidChange={(e) => {
            const { center: c, zoom: z, bounds } = e.nativeEvent
            if (c) setCenter({ latitude: c[1], longitude: c[0] })
            // Capture the visible bbox + zoom for the viewport overlay. Use the event's own zoom —
            // not deltaToZoom/zoomLevel. The first settle seeds the initial bbox; the picker opens at
            // z≈13.4 (zone) / z≈14.9 (no-zone), both ≥ POI_MIN_ZOOM, so pins appear after one frame.
            if (typeof z === 'number') setZoom(z)
            if (bounds) setBbox(bboxFromBounds(bounds))
          }}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{ center: toLngLat(initialCenter), zoom: zoomLevel }}
          />
          <UserLocation />
          {zonePolygon && zonePolygon.length >= 3 && (
            <GeoJSONSource id="picker-zone-src" data={toPolygonFeature(zonePolygon)}>
              <Layer id="picker-zone-fill" type="fill" paint={{ 'fill-color': colors.tint, 'fill-opacity': 0.13 }} />
              <Layer id="picker-zone-line" type="line" paint={{ 'line-color': colors.tint, 'line-width': 2 }} />
            </GeoJSONSource>
          )}
          {/* Mounted whenever we have pins — the layer's minzoom hides them when zoomed out, so the
              source never unmounts on a zoom wobble (no flicker). Empty pois → overlay renders null. */}
          <PoiOverlay pois={pois} onSelectPoi={onSelectPoi} />
        </Map>

        {/* Center crosshair pin */}
        <View
          pointerEvents="none"
          style={{
            ...StyleAbsoluteFill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{
            alignItems: 'center',
            justifyContent: 'flex-end',
            marginBottom: 38, // pin tip points to map center
          }}>
            <View style={{
              backgroundColor: pinKind === 'pickup' ? colors.success : colors.destructive,
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 3,
              borderColor: '#FFFFFF',
              boxShadow: '0px 4px 12px rgba(0,0,0,0.25)',
            }}>
              <Icon
                name={pinKind === 'pickup' ? 'person' : 'flag'}
                size={20}
                color="#FFFFFF"
              />
            </View>
            <View style={{
              width: 2,
              height: 14,
              backgroundColor: pinKind === 'pickup' ? colors.success : colors.destructive,
            }} />
            <View style={{
              width: 12,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(0,0,0,0.18)',
            }} />
          </View>
        </View>

        {/* Recenter button — floats over the map, hidden while search overlay is up */}
        {!searchActive && location && (
          <RecenterButton
            bottomOffset={insets.bottom + 220}
            onPress={() => {
              pickedCoordRef.current = null
              setCenter(location)
              flyTo(location)
            }}
          />
        )}
      </View>

      {/* ── Map overlay chrome (inactive search): back + title, and a search pill ── */}
      {!searchActive && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + Spacing.sm,
            paddingHorizontal: Spacing.lg,
            gap: Spacing.sm,
          }}
        >
          {/* Back + title row */}
          <View style={{
            // native forceRTL mirrors this row in AR — no manual flip
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderRadius: 16,
            borderCurve: 'continuous',
            paddingHorizontal: Spacing.md,
            height: 52,
            gap: Spacing.md,
            boxShadow: '0px 2px 12px rgba(0,0,0,0.10)',
          }}>
            <TouchableOpacity
              onPress={onCancel}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <Icon name={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.text} />
            </TouchableOpacity>
            <Text style={{ ...Typography['heading-sm'], color: colors.text, flex: 1 }} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* Search trigger pill — tapping opens the full-screen search */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSearchActive(true)}
            accessibilityRole="search"
            accessibilityLabel={t('booking.searchPlaceholder')}
            style={{
              // native forceRTL mirrors this row in AR — no manual flip
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderRadius: 16,
              borderCurve: 'continuous',
              paddingHorizontal: Spacing.md,
              height: 50,
              gap: Spacing.md,
              boxShadow: '0px 2px 12px rgba(0,0,0,0.10)',
            }}
          >
            <Icon name="search" size={18} color={colors.subtle} />
            <Text style={{ ...Typography['body-md'], color: colors.subtle, flex: 1 }} numberOfLines={1}>
              {t('booking.searchPlaceholder')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Full-screen search layer ── */}
      {searchActive && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          style={{
            ...StyleAbsoluteFill,
            backgroundColor: colors.background,
            paddingTop: insets.top,
          }}
        >
          {/* Search header: back + input, pinned to top */}
          <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.sm }}>
            <View style={{
              // native forceRTL mirrors this row in AR — no manual flip
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderCurve: 'continuous',
              paddingHorizontal: Spacing.md,
              height: 52,
              gap: Spacing.sm,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <TouchableOpacity
                onPress={() => { setQuery(''); setSearchActive(false); Keyboard.dismiss() }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.back')}
              >
                <Icon name={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'} size={22} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                placeholder={t('booking.searchPlaceholder')}
                placeholderTextColor={colors.subtle}
                returnKeyType="search"
                style={{
                  flex: 1,
                  ...Typography['body-md'],
                  color: colors.text,
                  padding: 0,
                  includeFontPadding: false,
                  textAlign: I18nManager.isRTL ? 'right' : 'left',
                }}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Icon name="close-circle" size={18} color={colors.subtle} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Results fill the rest of the screen */}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingTop: Spacing.sm, paddingBottom: insets.bottom + Spacing.xl }}
          >
            {searching && (
              <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.tint} />
              </View>
            )}

            {!searching && query.trim().length > 0 && results.length === 0 && (
              <View style={{ paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xl * 2, alignItems: 'center', gap: Spacing.md }}>
                <Icon name="search-outline" size={36} color={colors.subtle} />
                <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>
                  {t('booking.noResults')}
                </Text>
              </View>
            )}

            {query.trim().length === 0 && (
              <SectionHeader title={t('booking.popularPlaces')} colors={colors} />
            )}
            {query.trim().length > 0 && !searching && results.length > 0 && (
              <SectionHeader title={t('booking.searchResults')} colors={colors} />
            )}

            {(query.trim().length === 0 ? popular.current ?? [] : results).map((p, i) => (
              <Animated.View key={p.id} entering={FadeInUp.duration(200).delay(Math.min(i, 6) * 30)}>
                <PlaceRow place={p} colors={colors} onPress={() => onPickResult(p)} />
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Bottom address card + CTA */}
      {!searchActive && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: Spacing.lg,
            paddingBottom: insets.bottom + Spacing.lg,
            gap: Spacing.md,
          }}
        >
          {!inZone && zonePolygon && (
            <View style={{
              backgroundColor: colors.destructive + '15',
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 12,
              // native forceRTL mirrors this row in AR — no manual flip
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}>
              <Icon name="alert-circle" size={18} color={colors.destructive} />
              <Text style={{ ...Typography['body-md'], color: colors.destructive, flex: 1 }}>
                {t('abriyah.pinOutsideZone')}
              </Text>
            </View>
          )}
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 18,
            borderCurve: 'continuous',
            padding: Spacing.lg,
            gap: Spacing.md,
            boxShadow: '0px 4px 16px rgba(0,0,0,0.10)',
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <View style={{
              // native forceRTL mirrors this row in AR — no manual flip
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.md,
            }}>
              <View style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                borderCurve: 'continuous',
                backgroundColor: pinKind === 'pickup' ? colors.success + '22' : colors.destructive + '22',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Icon
                  name={pinKind === 'pickup' ? 'person' : 'flag'}
                  size={18}
                  color={pinKind === 'pickup' ? colors.success : colors.destructive}
                />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{
                  ...Typography['caption-sm'],
                  color: colors.subtle,
                  fontStyle: 'normal',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}>
                  {pinKind === 'pickup' ? t('booking.fromLabel') : t('booking.toLabel')}
                </Text>
                {/* native forceRTL mirrors this row in AR — no manual flip */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {resolving && <ActivityIndicator size="small" color={colors.tint} />}
                  <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1 }} numberOfLines={1}>
                    {address ?? t('booking.locating')}
                  </Text>
                </View>
              </View>
            </View>

            <Button
              label={ctaLabel}
              disabled={!canConfirm}
              onPress={() => onConfirm({ coord: center, address })}
            />
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

const StyleAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
}

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <Text style={{
      ...Typography['input-label'],
      color: colors.subtle,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      fontStyle: 'normal',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    }}>
      {title}
    </Text>
  )
}

interface PlaceRowProps {
  place: PlaceResult
  colors: ReturnType<typeof useThemeColors>
  onPress: () => void
}

function PlaceRow({ place, colors, onPress }: PlaceRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: 12,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        borderCurve: 'continuous',
        backgroundColor: place.source === 'curated' ? colors.tint + '22' : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon
          name={place.source === 'curated' ? 'location' : 'pin-outline'}
          size={18}
          color={colors.text}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: colors.text }} numberOfLines={1}>
          {place.title}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }} numberOfLines={1}>
          {place.subtitle}
        </Text>
      </View>
      <Icon
        name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={colors.subtle}
      />
    </TouchableOpacity>
  )
}
