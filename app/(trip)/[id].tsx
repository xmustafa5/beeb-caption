import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Linking, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { TripMap } from '@/components/trip/trip-map'
import { TripActionBar } from '@/components/captain/trip-action-bar'
import { CancelSheet } from '@/components/captain/cancel-sheet'
import { RatingStars } from '@/components/captain/rating-stars'
import { MemberRoster } from '@/components/captain/member-roster'
import { useLiveTrip } from '@/hooks/use-live-trip'
import { getProxy, rateRider, type CancelReason } from '@/services/captain-trips'
import { getRoomMembers } from '@/services/abriyah-members'
import { getRoute } from '@/services/routing'
import { useCurrentLocation, type LatLng } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

export default function LiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()

  const { trip, isLoading, arrived, arrive, start, complete, cancel, busy } = useLiveTrip(id)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [stars, setStars] = useState(0)
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([])

  const status = trip?.status
  const pickup: LatLng | undefined = trip ? { latitude: trip.pickupLat, longitude: trip.pickupLng } : undefined
  const dropoff: LatLng | undefined = trip ? { latitude: trip.dropoffLat, longitude: trip.dropoffLng } : undefined
  // Navigate/route target: pickup until started, dropoff once in_progress.
  const target = status === 'in_progress' ? dropoff : pickup

  // Abriyah roster.
  const roster = useQuery({
    queryKey: ['abriyah', 'members', trip?.roomId],
    queryFn: () => getRoomMembers(trip!.roomId as string),
    enabled: trip?.tripType === 'abriyah' && !!trip?.roomId,
  })

  // Route line from captain → target.
  useEffect(() => {
    let cancelled = false
    if (!location || !target) { setRouteCoords([]); return }
    getRoute(location, target).then((r) => { if (!cancelled) setRouteCoords(r?.coords ?? []) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, target?.latitude, target?.longitude])

  async function onPrimary() {
    setError(null)
    try {
      if (status === 'accepted' && !arrived) await arrive()
      else if (status === 'accepted' && arrived) await start()
      else if (status === 'in_progress') await complete()
    } catch (err) {
      setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.legFailed'))
    }
  }

  async function onCall() {
    setError(null)
    try {
      const proxy = await getProxy(id)
      Linking.openURL(`tel:${proxy.captainProxyNumber}`)
    } catch {
      setError(t('captain.live.callUnavailable'))
    }
  }

  function onNavigate() {
    if (!target) return
    const ll = `${target.latitude},${target.longitude}`
    const url = process.env.EXPO_OS === 'ios'
      ? `https://maps.google.com/?daddr=${ll}`
      : `https://www.google.com/maps/dir/?api=1&destination=${ll}`
    Linking.openURL(url)
  }

  async function onCancelConfirm(reason: CancelReason, comment?: string) {
    setError(null)
    try {
      await cancel(reason, comment)
      setShowCancel(false)
    } catch (err) {
      setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.cancelFailed'))
    }
  }

  async function onSubmitRating() {
    try { if (stars > 0) await rateRider(id, stars) } catch { /* 409 already-rated → ignore */ }
    router.replace('/(tabs)')
  }

  if (isLoading && !trip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  if (!trip) {
    // Query errored (or no data) — don't spin forever; offer a way back.
    return (
      <CenteredState
        icon="alert-circle"
        tone={colors.destructive}
        title={t('common.error')}
        body={t('common.networkError')}
        button={t('captain.live.done')}
        onPress={() => router.replace('/(tabs)')}
        colors={colors}
        insets={insets}
      />
    )
  }

  // Cancelled (own or rider/admin via WS)
  if (status === 'cancelled') {
    return (
      <CenteredState icon="close-circle" tone={colors.destructive} title={t('captain.live.cancelledTitle')} body={t('captain.live.cancelledBody')}
        button={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} colors={colors} insets={insets} />
    )
  }

  // Completed → summary + optional rating
  if (status === 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark-circle" size={40} color={colors.success} />
        </View>
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.live.completedTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
          {t('captain.live.fareCollected', { fare: formatIqd(trip.fareIqd) })}
        </Text>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.live.rateRider')}</Text>
        <RatingStars value={stars} onChange={setStars} />
        <Button label={stars > 0 ? t('captain.live.submitRating') : t('captain.live.skip')} onPress={onSubmitRating} />
      </View>
    )
  }

  // Active (accepted / in_progress)
  const primaryLabel =
    status === 'accepted' && !arrived ? t('captain.live.arrivedAtPickup')
    : status === 'accepted' && arrived ? t('captain.live.startTrip')
    : status === 'in_progress' ? t('captain.live.completeTrip')
    : t('captain.live.arrivedAtPickup') // 'requested' (transient) fallback — refetch clears it

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '52%' }}>
        <TripMap
          driver={location ?? undefined}
          pickup={pickup}
          dropoff={dropoff}
          routeCoords={routeCoords}
          showsUserLocation={false}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}
      >
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal' }}>{t('captain.live.fareLabel')}</Text>
          <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'] }}>{formatIqd(trip.fareIqd)}</Text>
        </View>

        {trip.tripType === 'abriyah' && <MemberRoster members={roster.data ?? []} />}

        <FormError message={error} />

        <Button label={primaryLabel} loading={busy} onPress={onPrimary} />

        <TripActionBar
          onCall={onCall}
          onNavigate={onNavigate}
          onCancel={status === 'accepted' ? () => setShowCancel(true) : undefined}
        />
      </ScrollView>

      <CancelSheet
        visible={showCancel}
        submitting={busy}
        onClose={() => setShowCancel(false)}
        onConfirm={onCancelConfirm}
      />
    </View>
  )
}

interface CenteredStateProps {
  icon: React.ComponentProps<typeof Icon>['name']
  tone: string
  title: string
  body: string
  button: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  insets: { top: number; bottom: number }
}

function CenteredState({ icon, tone, title, body, button, onPress, colors, insets }: CenteredStateProps) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tone + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={40} color={tone} />
      </View>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{title}</Text>
      <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{body}</Text>
      <Button label={button} onPress={onPress} />
    </View>
  )
}
