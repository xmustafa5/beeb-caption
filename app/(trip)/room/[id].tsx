// app/(trip)/room/[id].tsx
import { useEffect } from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
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
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { nextNafaratStop } from '@/lib/nafarat-next-stop'
import { NavigateButtons } from '@/components/captain/navigate-buttons'
import { contentLanguage } from '@/i18n/languages'

export default function NafaratRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  // Zone names only come in en/ar; Kurdish shows the Arabic one.
  const names = contentLanguage(i18n.language)
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()
  const { room, dropoffZone, pickupBreakdown, seats, isLoading, isError, pickup, dropoff, busyTripId } = useNafaratRoom(id)
  const { ensureTracking } = useCaptainPresence()

  // A dispatched room IS a live trip as far as location goes — the pooled riders
  // are watching this car on their maps exactly like a regular fare. Without this
  // the shared-ride leg is the one case that still freezes the moment the captain
  // opens a navigation app, because `ensureTracking` is otherwise only called from
  // the regular live-trip screen. `dispatched` maps to `in_progress`; any other
  // room state (expired, or the room going away) releases the OS task.
  const roomStatus = room?.status
  useEffect(() => {
    if (!roomStatus) return
    void ensureTracking(roomStatus === 'dispatched' ? 'in_progress' : undefined)
  }, [roomStatus, ensureTracking])

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

  // A rider who cancelled after the captain accepted is out of the ride: not
  // counted, not driven to, and no longer holding the room open.
  const riding = seats.filter((s) => s.tripStatus !== 'cancelled')
  const total = riding.length
  const done = riding.filter((s) => s.tripStatus === 'completed').length
  const allDone = seats.length > 0 && done === total
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
          {t('captain.live.fareCollected', { fare: formatIqd(collected, i18n.language) })}
        </Text>
        <Button label={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  const pickups = seats.map((s) => s.pickup)
  const dropoffs = seats.map((s) => s.dropoff)
  const zoneName = (names === 'ar' ? dropoffZone?.nameAr : dropoffZone?.name) ?? t('captain.live.unknownZone')

  // Pickups first (closest waiting rider each time), then drop-offs (closest
  // first). The old rule took the nearest of each rider's current target, so a
  // rider just picked up could be dropped off before the others were collected.
  const nextStop = nextNafaratStop(riding, location)

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
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'left' }}>{t('captain.nafarat.title')}</Text>
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Icon name="flag" size={15} color={colors.tint} />
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{zoneName}</Text>
          </View>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'], textAlign: 'left' }}>
            {t('captain.nafarat.progress', { done, total })}
          </Text>
        </View>

        {/* The next stop, and the captain's navigator of choice for it. */}
        {nextStop && (
          <View style={{ gap: Spacing.sm }}>
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: 'left' }} numberOfLines={1}>
              {t(nextStop.kind === 'pickup' ? 'captain.nafarat.nextPickup' : 'captain.nafarat.nextDropoff', { name: nextStop.name })}
            </Text>
            <NavigateButtons destination={nextStop} />
          </View>
        )}

        {/* pickup-zone breakdown */}
        {pickupBreakdown.length > 0 && (
          <View style={{ gap: Spacing.xs }}>
            {pickupBreakdown.map((p, i) => (
              <View key={p.zoneId ?? `u-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Icon name="location-outline" size={14} color={colors.subtle} />
                <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', textAlign: 'left' }}>
                  {t('captain.live.pickupFromZone', { count: p.riderCount, zone: (names === 'ar' ? p.nameAr : p.name) ?? t('captain.live.unknownZone') })}
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
