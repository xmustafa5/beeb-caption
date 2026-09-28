// app/(trip)/room/[id].tsx
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { TripMap } from '@/components/trip/trip-map'
import { NafaratMarkers } from '@/components/captain/nafarat-markers'
import { RiderSeatCard } from '@/components/captain/rider-seat-card'
import { CancelSheet } from '@/components/captain/cancel-sheet'
import { NafaratEndState } from '@/components/captain/nafarat-end-state'
import { useNafaratRoom } from '@/hooks/use-nafarat-room'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { nextNafaratStop } from '@/lib/nafarat-next-stop'
import { NavigateButtons } from '@/components/captain/navigate-buttons'
import { contentLanguage } from '@/i18n/languages'
import { parseApiError } from '@/lib/api'
import type { CancelReason } from '@/services/captain-trips'

export default function NafaratRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  // Zone names only come in en/ar; Kurdish shows the Arabic one.
  const names = contentLanguage(i18n.language)
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()
  const {
    room, dropoffZone, pickupBreakdown, seats, state, riding, done, collectedIqd,
    arrive, pickup, dropoff, cancel, busyTripIds,
  } = useNafaratRoom(id)
  const { ensureTracking } = useCaptainPresence()
  const [error, setError] = useState<string | null>(null)
  // The rider whose trip the cancel sheet is open for.
  const [cancelTripId, setCancelTripId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // A room being driven IS a live trip as far as location goes — the pooled
  // riders watch this car on their maps exactly like a regular fare, including
  // while the captain is in a navigation app. The room itself stays `dispatched`
  // forever, so the ride's own progress decides: tracking runs while any rider is
  // still to be picked up or dropped off, and the OS task is handed back once the
  // last one is done (or everyone cancelled). Nothing happens while loading.
  useEffect(() => {
    if (state === 'live') void ensureTracking('in_progress')
    else if (state === 'done' || state === 'ended') void ensureTracking('completed')
  }, [state, ensureTracking])

  // Back to the Home that is already under this screen: a replace would stack a
  // second (tabs) on top of it (another map, another queue poll) per ride.
  const goHome = () => router.dismissTo('/(tabs)')

  function legFailed(err: unknown) {
    setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.legFailed'))
  }

  function runLeg(fn: (tripId: string) => Promise<void>, tripId: string | null) {
    if (!tripId) return
    setError(null)
    fn(tripId).catch(legFailed)
  }

  async function confirmCancel(reason: CancelReason, comment?: string) {
    if (!cancelTripId) return
    setError(null)
    setCancelling(true)
    try {
      await cancel(cancelTripId, reason, comment)
      setCancelTripId(null)
    } catch (err) {
      setCancelTripId(null)
      setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.cancelFailed'))
    } finally {
      setCancelling(false)
    }
  }

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  // Couldn't read the room (not this captain's room, or it is gone).
  if (state === 'error') {
    return <NafaratEndState icon="alert-circle" tone={colors.destructive} title={t('captain.nafarat.loadError')} onDone={goHome} />
  }

  // The room expired, or every rider cancelled: nobody left to drive.
  if (state === 'ended') {
    return (
      <NafaratEndState
        icon="close-circle"
        tone={colors.destructive}
        title={t('captain.live.cancelledTitle')}
        body={t('captain.live.cancelledBody')}
        onDone={goHome}
      />
    )
  }

  // Every rider still in the car was dropped off.
  if (state === 'done') {
    return (
      <NafaratEndState
        icon="checkmark-done-circle"
        tone={colors.success}
        title={t('captain.nafarat.allDoneTitle')}
        body={t('captain.live.fareCollected', { fare: formatIqd(collectedIqd, i18n.language) })}
        onDone={goHome}
      />
    )
  }

  // Map pins carry each rider's seat number, like the cards below. A rider who
  // cancelled is no longer a stop, so their pins go (the others keep their numbers).
  const stops = seats.filter((s) => s.tripStatus !== 'cancelled')
  const pickups = stops.map((s) => s.pickup)
  const dropoffs = stops.map((s) => s.dropoff)
  const zoneName = (names === 'ar' ? dropoffZone?.nameAr : dropoffZone?.name) ?? t('captain.live.unknownZone')
  const womenOnly = room?.roomType === 'women_only'

  // Pickups first (closest waiting rider each time), then drop-offs (closest
  // first). Riders who cancelled or were dropped off are skipped.
  const nextStop = nextNafaratStop(seats, location)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '42%' }}>
        <TripMap
          showsUserLocation
          fitToCoords={[...pickups, ...dropoffs]}
          // The map runs up under the status bar: keep the top pins below it.
          fitPadding={{ top: insets.top + 48, right: 48, bottom: 40, left: 48 }}
          initialRegion={pickups[0] ? { latitude: pickups[0].latitude, longitude: pickups[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
        >
          <NafaratMarkers pickups={pickups} dropoffs={dropoffs} numbers={stops.map((s) => s.seatNumber)} />
        </TripMap>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}>
        {/* header: title + ride type + destination + progress */}
        <View style={{ gap: Spacing.xs }}>
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
            <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'left' }}>{t('captain.nafarat.title')}</Text>
            {womenOnly && (
              <View style={{ backgroundColor: colors.tint + '22', borderRadius: 8, borderCurve: 'continuous', paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal' }}>{t('captain.queue.roomWomenOnly')}</Text>
              </View>
            )}
          </View>
          {womenOnly && (
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
              {t('captain.queue.roomAllWomen')}
            </Text>
          )}
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Icon name="flag" size={15} color={colors.tint} />
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', flexShrink: 1, textAlign: 'left' }}>{zoneName}</Text>
          </View>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'], textAlign: 'left' }}>
            {t('captain.nafarat.progress', { done, total: riding })}
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

        <FormError message={error} />

        {/* one card per rider, in join order (= the numbered pins) */}
        <View style={{ gap: Spacing.md }}>
          {seats.map((s) => (
            <RiderSeatCard
              key={s.riderId}
              seat={s}
              isNext={nextStop?.riderId === s.riderId}
              busy={s.tripId != null && busyTripIds.has(s.tripId)}
              onArrive={() => runLeg(arrive, s.tripId)}
              onPickup={() => runLeg(pickup, s.tripId)}
              onDropoff={() => runLeg(dropoff, s.tripId)}
              onCancel={() => { if (s.tripId) setCancelTripId(s.tripId) }}
            />
          ))}
        </View>
      </ScrollView>

      <CancelSheet
        visible={cancelTripId != null}
        submitting={cancelling}
        onClose={() => setCancelTripId(null)}
        onConfirm={(reason, comment) => { void confirmCancel(reason, comment) }}
      />
    </View>
  )
}
