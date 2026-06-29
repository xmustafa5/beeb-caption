import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { TripMap, type TripMapHandle } from '@/components/trip/trip-map'
import { RecenterButton } from '@/components/trip/recenter-button'
import { OfferPickupMarker } from '@/components/captain/offer-pickup-marker'
import { OfferCarousel } from '@/components/captain/offer-carousel'
import { useTripQueue } from '@/hooks/use-trip-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { useActiveTrip } from '@/hooks/use-active-trip'
import { parseApiError } from '@/lib/api'
import type { CaptainOffer } from '@/services/captain-queue'

// Home is the live map: current location + incoming offers carousel. Activation
// and going online moved to the tab bar's center button (ActivateSheet). The map
// always renders — when offline, an overlay pill nudges the captain to activate.
export default function HomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { online } = useCaptainPresence()
  const { offers, isLoading, accept, accepting, refetch } = useTripQueue()
  const { location, fallback } = useCurrentLocation()
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const mapRef = useRef<TripMapHandle>(null)

  // Keep activeIndex in range as offers arrive/expire.
  useEffect(() => {
    if (activeIndex > offers.length - 1) setActiveIndex(Math.max(0, offers.length - 1))
  }, [offers.length, activeIndex])

  // Pan the camera to the active offer's pickup whenever it changes.
  const active = offers[activeIndex]
  useEffect(() => {
    if (!active) return
    mapRef.current?.animateToRegion({
      latitude: active.pickupLat,
      longitude: active.pickupLng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    })
  }, [active?.id, active?.pickupLat, active?.pickupLng])

  // Fly to the captain's real GPS fix the FIRST time one arrives after mount
  // (GPS resolves async, so the map opens on the Baghdad fallback). We fly exactly
  // once — later watch updates must not yank the map while the captain pans to
  // inspect the area. An active offer keeps camera priority: don't fight the
  // offer-pickup pan above. Mirrors the rider picker's fly-to-GPS-on-first-fix.
  const flewToGpsRef = useRef(false)
  useEffect(() => {
    if (flewToGpsRef.current || !location || active) return
    flewToGpsRef.current = true
    mapRef.current?.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      500,
    )
  }, [location, active])

  async function onAccept(offer: CaptainOffer) {
    setError(null)
    try {
      await accept(offer)
      router.push(offer.offerType === 'room' ? `/(trip)/room/${offer.id}` : `/(trip)/${offer.id}`)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 409) setError(t('captain.queue.taken'))
      else if (info.status !== 403 && info.status !== 400) {
        setError(t(info.isNetwork ? 'common.networkError' : 'captain.queue.acceptFailed'))
      }
      refetch()
    }
  }

  const center = location ?? fallback
  const hasOffers = offers.length > 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TripMap
        ref={mapRef}
        initialRegion={{
          latitude: active?.pickupLat ?? center.latitude,
          longitude: active?.pickupLng ?? center.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
        showPois
        // Active offer's dropoff (destructive pin) for trip-direction context. The
        // active pickup is already drawn by OfferPickupMarker below, so only the
        // dropoff is passed here — passing `pickup` too would double-draw it.
        dropoff={active ? { latitude: active.dropoffLat, longitude: active.dropoffLng } : undefined}
      >
        {offers.map((o, i) => (
          <OfferPickupMarker
            key={`${o.offerType}-${o.id}`}
            coord={{ latitude: o.pickupLat, longitude: o.pickupLng }}
            active={i === activeIndex}
          />
        ))}
      </TripMap>

      {/* Persistent "you have a trip in progress" banner, floating over the map. */}
      <ActiveTripBanner topInset={insets.top} />

      {/* Zoom-to-current-location button. Sits above the offer carousel when
          offers are present, near the safe-area edge when idle. */}
      {location && (
        <RecenterButton
          bottomOffset={insets.bottom + (hasOffers ? 200 : Spacing.lg)}
          onPress={() =>
            mapRef.current?.animateToRegion(
              { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 },
              450,
            )
          }
        />
      )}

      {/* Loading overlay (first fetch while online). */}
      {online && isLoading && !hasOffers && (
        <View style={{ position: 'absolute', top: insets.top + Spacing.xl * 2.5, alignSelf: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      )}

      {/* Status pill over the map: offline → nudge to activate; online + empty → waiting. */}
      {!hasOffers && (!online || !isLoading) && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + Spacing.xl * 2.5,
            alignSelf: 'center',
            backgroundColor: colors.card,
            borderRadius: 999,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            boxShadow: '0px 2px 10px rgba(0,0,0,0.18)',
          }}
        >
          <Icon name={online ? 'hourglass-outline' : 'cloud-offline-outline'} size={16} color={colors.subtle} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>
            {online ? t('captain.queue.emptyTitle') : t('captain.queue.offlineTitle')}
          </Text>
        </View>
      )}

      {/* Offers → bottom carousel. */}
      {hasOffers && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + Spacing.md, gap: Spacing.sm }}>
          {error && (
            <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'center', marginHorizontal: Spacing.xl }}>
              {error}
            </Text>
          )}
          <OfferCarousel
            offers={offers}
            activeIndex={activeIndex}
            onIndexChange={setActiveIndex}
            captainLocation={location}
            onAccept={onAccept}
            accepting={accepting}
          />
        </View>
      )}
    </View>
  )
}

// Persistent "you have a trip in progress" banner. Floats over the home map
// whenever the captain has an active trip, so they can return to the live-trip
// screen after navigating away. Clears itself when the trip ends (the query polls).
function ActiveTripBanner({ topInset }: { topInset: number }) {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar' || I18nManager.isRTL
  const colors = useThemeColors()
  const router = useRouter()
  const { data: trip } = useActiveTrip()

  if (!trip) return null

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(trip.tripType === 'abriyah' && trip.roomId ? `/(trip)/room/${trip.roomId}` : `/(trip)/${trip.id}`)}
      style={{
        position: 'absolute',
        top: topInset + Spacing.md,
        left: Spacing.lg,
        right: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.tint,
        borderRadius: 18,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.12)',
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="navigate" size={20} color={colors.onTint} />
      </View>
      <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        <Text style={{ ...Typography['body-md'], color: colors.onTint, textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.live.resumeTitle')}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.onTint, opacity: 0.85, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.live.resumeSubtitle')}
        </Text>
      </View>
      <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.onTint} />
    </TouchableOpacity>
  )
}
