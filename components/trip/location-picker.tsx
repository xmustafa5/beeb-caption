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
import { useTranslation } from 'react-i18next'
import MapView, { Polygon, type Region } from 'react-native-maps'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type { LatLng } from '@/hooks/use-current-location'
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
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView>(null)
  const lang = i18n.language as 'en' | 'ar'

  const [center, setCenter] = useState<LatLng>(initialCenter)
  const [address, setAddress] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const [query, setQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)

  const popular = useRef<PlaceResult[] | null>(null)
  if (popular.current === null) {
    popular.current = getPopularPlaces(initialCenter, lang, 8)
  }

  // If the parent passes a new initialCenter (e.g. GPS resolved after mount,
  // or user revisits with a different prop), fly to it.
  const initialCenterKey = `${initialCenter.latitude.toFixed(5)},${initialCenter.longitude.toFixed(5)}`
  const lastInitialCenterRef = useRef(initialCenterKey)
  useEffect(() => {
    if (initialCenterKey === lastInitialCenterRef.current) return
    lastInitialCenterRef.current = initialCenterKey
    setCenter(initialCenter)
    mapRef.current?.animateToRegion(
      {
        latitude: initialCenter.latitude,
        longitude: initialCenter.longitude,
        latitudeDelta: zonePolygon ? 0.03 : 0.012,
        longitudeDelta: zonePolygon ? 0.03 : 0.012,
      },
      500,
    )
  }, [initialCenterKey])

  const inZone = !zonePolygon || isPointInPolygon(center, zonePolygon)
  const canConfirm = inZone && !resolving

  // Debounced reverse geocoding when the map settles.
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (reverseTimer.current) clearTimeout(reverseTimer.current)
    setResolving(true)
    reverseTimer.current = setTimeout(async () => {
      const a = await reverseGeocode(center)
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
      const r = await searchPlaces(query, lang)
      setResults(r)
      setSearching(false)
    }, 250)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query, lang])

  const flyTo = (coord: LatLng) => {
    mapRef.current?.animateToRegion(
      {
        latitude: coord.latitude,
        longitude: coord.longitude,
        latitudeDelta: zonePolygon ? 0.03 : 0.012,
        longitudeDelta: zonePolygon ? 0.03 : 0.012,
      },
      450,
    )
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

  const initialRegion: Region = {
    latitude: initialCenter.latitude,
    longitude: initialCenter.longitude,
    latitudeDelta: zonePolygon ? 0.03 : 0.012,
    longitudeDelta: zonePolygon ? 0.03 : 0.012,
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Map (always rendered, hides behind search overlay) */}
      <View style={{ ...StyleAbsoluteFill }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          showsCompass={false}
          showsPointsOfInterest={false}
          toolbarEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onRegionChangeComplete={(r) => {
            setCenter({ latitude: r.latitude, longitude: r.longitude })
          }}
        >
          {zonePolygon && zonePolygon.length >= 3 && (
            <Polygon
              coordinates={zonePolygon}
              strokeColor={colors.tint}
              fillColor={colors.tint + '22'}
              strokeWidth={2}
            />
          )}
          {otherPin && (
            <Polygon
              coordinates={[]}
            />
          )}
        </MapView>

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
      </View>

      {/* Top bar with title + search */}
      <View style={{
        paddingTop: insets.top + Spacing.sm,
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
      }}>
        <View style={{
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: 16,
          borderCurve: 'continuous',
          paddingHorizontal: Spacing.md,
          height: 56,
          gap: Spacing.md,
          boxShadow: '0px 2px 12px rgba(0,0,0,0.10)',
        }}>
          <TouchableOpacity onPress={onCancel} hitSlop={8}>
            <Icon
              name={I18nManager.isRTL ? 'arrow-forward' : 'arrow-back'}
              size={22}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text
            style={{ ...Typography['heading-sm'], color: colors.text, flex: 1 }}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        {/* Search input */}
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
          <Icon name="search" size={18} color={colors.subtle} />
          <TextInput
            value={query}
            onChangeText={(s) => {
              setQuery(s)
              setSearchActive(true)
            }}
            onFocus={() => setSearchActive(true)}
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
          {(query.length > 0 || searchActive) && (
            <TouchableOpacity
              onPress={() => {
                setQuery('')
                setSearchActive(false)
                Keyboard.dismiss()
              }}
              hitSlop={8}
            >
              <Icon name={query.length > 0 ? 'close-circle' : 'close'} size={18} color={colors.subtle} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search results overlay (covers map when active) */}
      {searchActive && (
        <View style={{
          flex: 1,
          backgroundColor: colors.background,
          marginTop: Spacing.sm,
        }}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingTop: Spacing.md,
              paddingBottom: insets.bottom + Spacing.xl,
            }}
          >
            {searching && (
              <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator color={colors.tint} />
              </View>
            )}

            {!searching && query.trim().length > 0 && results.length === 0 && (
              <View style={{
                paddingHorizontal: Spacing.xl,
                paddingVertical: Spacing.xl,
                alignItems: 'center',
                gap: Spacing.md,
              }}>
                <Icon name="search-outline" size={32} color={colors.subtle} />
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

            {(query.trim().length === 0 ? popular.current ?? [] : results).map((p) => (
              <PlaceRow key={p.id} place={p} colors={colors} onPress={() => onPickResult(p)} />
            ))}
          </ScrollView>
        </View>
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
