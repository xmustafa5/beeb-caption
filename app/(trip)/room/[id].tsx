// app/(trip)/room/[id].tsx
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { TripMap } from '@/components/trip/trip-map'
import { NafaratMarkers } from '@/components/captain/nafarat-markers'
import { RiderSeatCard } from '@/components/captain/rider-seat-card'
import { useNafaratRoom } from '@/hooks/use-nafarat-room'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { openNavigation, distanceKm } from '@/lib/nav-links'

const isRTL = I18nManager.isRTL

export default function NafaratRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()
  const { room, dropoffZone, pickupBreakdown, seats, isLoading, isError, pickup, dropoff, busyTripId } = useNafaratRoom(id)

  // Loading (first load)
  if (isLoading && seats.length === 0 && !room) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  // Couldn't load (403 / gone)
  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.lg }}>
        <Icon name="alert-circle" size={44} color={colors.destructive} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.nafarat.loadError')}</Text>
        <Button label={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  const total = seats.length
  const done = seats.filter((s) => s.tripStatus === 'completed').length
  const allDone = total > 0 && done === total
  const collected = seats.reduce((sum, s) => (s.tripStatus === 'completed' ? sum + s.fareIqd : sum), 0)

  // All riders dropped → summary
  if (allDone) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark-done-circle" size={40} color={colors.success} />
        </View>
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.nafarat.allDoneTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
          {t('captain.live.fareCollected', { fare: formatIqd(collected, isAr ? 'ar' : 'en') })}
        </Text>
        <Button label={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  const pickups = seats.map((s) => s.pickup)
  const dropoffs = seats.map((s) => s.dropoff)
  const zoneName = (isAr ? dropoffZone?.nameAr : dropoffZone?.name) ?? t('captain.live.unknownZone')

  // Nearest-first navigation. Each un-finished rider has ONE active target: their
  // pickup until they're aboard (in_progress → their dropoff). Waze takes a single
  // destination per launch, so we pick the rider whose active target is physically
  // closest to the captain and open Waze to just that leg. After the captain picks
  // up / drops off, this recomputes to the next-nearest rider.
  const navTargets = seats
    .filter((s) => s.tripStatus !== 'completed')
    .map((s) => ({ name: s.name, coord: s.tripStatus === 'in_progress' ? s.dropoff : s.pickup }))
  const nextTarget =
    location && navTargets.length > 0
      ? navTargets.reduce((best, cur) =>
          distanceKm(location, cur.coord) < distanceKm(location, best.coord) ? cur : best,
        )
      : navTargets[0] ?? null

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '42%' }}>
        <TripMap
          showsUserLocation
          fitToCoords={[...pickups, ...dropoffs]}
          initialRegion={pickups[0] ? { latitude: pickups[0].latitude, longitude: pickups[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
        >
          <NafaratMarkers pickups={pickups} dropoffs={dropoffs} />
        </TripMap>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}>
        {/* header: title + destination + progress */}
        <View style={{ gap: Spacing.xs }}>
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>{t('captain.nafarat.title')}</Text>
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Icon name="flag" size={15} color={colors.tint} />
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{zoneName}</Text>
          </View>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'], textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.nafarat.progress', { done, total })}
          </Text>
        </View>

        {/* Nearest-first navigation: open Waze to the closest un-finished rider's
            active target (pickup, or dropoff once aboard). One leg per launch. */}
        {nextTarget && (
          <TouchableOpacity
            onPress={() => void openNavigation(nextTarget.coord)}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Spacing.sm,
              backgroundColor: colors.surface,
              borderRadius: 14,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: Spacing.md + 2,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <Icon name="navigate" size={18} color={colors.tint} />
            <Text style={{ ...Typography['body-md'], color: colors.tint, fontStyle: 'normal' }} numberOfLines={1}>
              {t('captain.nafarat.navigateNext', { name: nextTarget.name })}
            </Text>
          </TouchableOpacity>
        )}

        {/* pickup-zone breakdown */}
        {pickupBreakdown.length > 0 && (
          <View style={{ gap: Spacing.xs }}>
            {pickupBreakdown.map((p, i) => (
              <View key={p.zoneId ?? `u-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Icon name="location-outline" size={14} color={colors.subtle} />
                <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
                  {t('captain.live.pickupFromZone', { count: p.riderCount, zone: (isAr ? p.nameAr : p.name) ?? t('captain.live.unknownZone') })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* rider seats with drive */}
        <View style={{ gap: Spacing.md }}>
          {seats.map((s) => (
            <RiderSeatCard
              key={s.riderId}
              seat={s}
              busy={busyTripId === s.tripId}
              onPickup={() => { if (s.tripId) pickup(s.tripId).catch(() => {}) }}
              onDropoff={() => { if (s.tripId) dropoff(s.tripId).catch(() => {}) }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
