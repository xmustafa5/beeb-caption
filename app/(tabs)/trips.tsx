import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { TripMap, type TripMapHandle } from '@/components/trip/trip-map'
import { OfferPickupMarker } from '@/components/captain/offer-pickup-marker'
import { OfferCarousel } from '@/components/captain/offer-carousel'
import { useTripQueue } from '@/hooks/use-trip-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { parseApiError } from '@/lib/api'
import type { CaptainOffer } from '@/services/captain-queue'

export default function QueueScreen() {
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

  // Offline → keep the simple offline message (no map).
  if (!online) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md }}>
        <Icon name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.queue.offlineTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.offlineBody')}</Text>
      </View>
    )
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
      >
        {offers.map((o, i) => (
          <OfferPickupMarker
            key={`${o.offerType}-${o.id}`}
            coord={{ latitude: o.pickupLat, longitude: o.pickupLng }}
            active={i === activeIndex}
          />
        ))}
      </TripMap>

      {/* Loading overlay (first fetch) */}
      {isLoading && !hasOffers && (
        <View style={{ position: 'absolute', top: insets.top + Spacing.xl, alignSelf: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      )}

      {/* Online but no offers → waiting pill over the map */}
      {!isLoading && !hasOffers && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + Spacing.lg,
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
          <Icon name="hourglass-outline" size={16} color={colors.subtle} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{t('captain.queue.emptyTitle')}</Text>
        </View>
      )}

      {/* Offers → bottom carousel */}
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
