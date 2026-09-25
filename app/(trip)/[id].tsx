import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Linking } from 'react-native'
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
import { TripMap, type TripMapHandle } from '@/components/trip/trip-map'
import { RecenterButton } from '@/components/trip/recenter-button'
import { TripActionBar } from '@/components/captain/trip-action-bar'
import { CancelSheet } from '@/components/captain/cancel-sheet'
import { RatingStars } from '@/components/captain/rating-stars'
import { MemberRoster } from '@/components/captain/member-roster'
import { StopsPanel } from '@/components/captain/stops-panel'
import { BoxDetailsCard } from '@/components/captain/box-details-card'
import { BoxSummaryRow } from '@/components/captain/box-summary-row'
import { useLiveTrip } from '@/hooks/use-live-trip'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useTripStops } from '@/hooks/use-trip-stops'
import { useBoxDetails } from '@/hooks/use-box-details'
import { getProxy, rateRider, type CancelReason } from '@/services/captain-trips'
import { getRoomMembers } from '@/services/abriyah-members'
import { getRoute } from '@/services/routing'
import { useCurrentLocation, type LatLng } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { openDialer } from '@/lib/phone'
import { distanceKm, nearestOf } from '@/lib/nav-links'
import { NavigateButtons } from '@/components/captain/navigate-buttons'
import { parseApiError } from '@/lib/api'

/**
 * How far the captain must drive before we ask for a new route line.
 *
 * GPS fixes land every 15 m (the watch's distanceInterval; its timeInterval is
 * Android-only), about one a second at city speed. Every fix is a new origin, so
 * re-routing on each one misses both the app's and the backend's route cache and
 * runs a fresh OSRM query each time. The rider's in-progress screen gates its
 * line the same way; at 150 m a city drive re-routes roughly every half minute.
 */
const ROUTE_ORIGIN_MIN_MOVE_M = 150

/** One leg of the drawn route: from where the captain was to the current target. */
interface RouteLeg {
  from: LatLng
  to: LatLng
  /** `lat,lng` of `to` — a change means a new target, not just a moved captain. */
  targetKey: string
}

export default function LiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()
  const mapRef = useRef<TripMapHandle>(null)
  const scrollRef = useRef<ScrollView>(null)
  // Where the full Box card sits in the scroll content — the summary row jumps there.
  const boxCardY = useRef(0)

  const { trip, isLoading, arrived, arrive, start, complete, cancel, busy } = useLiveTrip(id)
  const { ensureTracking } = useCaptainPresence()
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [stars, setStars] = useState(0)
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([])

  const status = trip?.status
  const pickup: LatLng | undefined = trip ? { latitude: trip.pickupLat, longitude: trip.pickupLng } : undefined
  const dropoff: LatLng | undefined = trip ? { latitude: trip.dropoffLat, longitude: trip.dropoffLng } : undefined

  // Location tracking follows the TRIP, not the online toggle: a trip accepted
  // mid-session has to switch background tracking on (the launch-resume path only
  // covers a relaunch), and a terminal one has to hand the OS task back. Skip the
  // undefined first render — that would read as "no trip" and tear down tracking
  // a resumed ride had already started, for the one frame before the GET lands.
  useEffect(() => {
    if (!status) return
    void ensureTracking(status)
  }, [status, ensureTracking])

  // Abriyah roster.
  const roster = useQuery({
    queryKey: ['abriyah', 'members', trip?.roomId],
    queryFn: () => getRoomMembers(trip!.roomId as string),
    enabled: trip?.tripType === 'abriyah' && !!trip?.roomId,
  })

  // Multi-stop: regular trips only, while the captain is on the trip (accepted/in_progress).
  const stopsEnabled =
    trip?.tripType === 'regular' && (status === 'accepted' || status === 'in_progress')
  const { stops, reachStop, reachingId } = useTripStops(id, !!stopsEnabled)

  // Box: the same live screen as a regular trip plus the parcel card. The
  // details (incl. the recipient's phone) are served to the assigned captain only
  // while the trip is accepted / in progress, so the query runs only then.
  const isBox = trip?.tripType === 'box'
  const boxEnabled = isBox && (status === 'accepted' || status === 'in_progress')
  const box = useBoxDetails(id, boxEnabled)

  // Un-reached intermediate stops as coordinates — the pending waypoints of a
  // multi-stop trip. Empty for a plain point-to-point ride.
  const pendingStops = stops
    .filter((s) => s.status !== 'reached')
    .map((s) => ({ latitude: s.lat, longitude: s.lng }))

  // Where the captain drives next — for the drawn route AND the Google Maps /
  // Waze buttons: the pickup until the rider is aboard, then any stops the rider
  // added (nearest first), then the dropoff. Neither navigator takes more than
  // one destination per link, so the target moves on as each stop is reached.
  // (Stops used to be routed to while the captain was still on the way to the
  // pickup, and skipped once the rider was aboard.)
  const target: LatLng | undefined =
    status !== 'in_progress'
      ? pickup
      : pendingStops.length > 0
        ? (location && nearestOf(location, pendingStops)) || pendingStops[0]
        : dropoff

  // The leg the route line is drawn for: captain → target. Held in state rather
  // than read straight off the GPS so it only advances in ROUTE_ORIGIN_MIN_MOVE_M
  // steps (see the constant), or at once when the target itself changes.
  const [routeLeg, setRouteLeg] = useState<RouteLeg | null>(null)
  useEffect(() => {
    if (!location || !target) { setRouteLeg(null); return }
    const targetKey = `${target.latitude},${target.longitude}`
    setRouteLeg((prev) =>
      prev &&
      prev.targetKey === targetKey &&
      distanceKm(prev.from, location) * 1000 < ROUTE_ORIGIN_MIN_MOVE_M
        ? prev
        : { from: location, to: target, targetKey },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, target?.latitude, target?.longitude])

  // Route line from captain → target.
  const routeTargetRef = useRef<string | null>(null)
  // Whether the line on screen is a road route (vs the straight-line fallback).
  const hasRoadLineRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    if (!routeLeg) {
      setRouteCoords([])
      routeTargetRef.current = null
      hasRoadLineRef.current = false
      return
    }
    // Target flip (pickup → dropoff on trip start): drop the stale route right away
    // instead of showing the old line until the new OSRM response lands. A new
    // origin to the same target keeps the line, so it doesn't blink while driving.
    if (routeTargetRef.current !== routeLeg.targetKey) {
      routeTargetRef.current = routeLeg.targetKey
      hasRoadLineRef.current = false
      setRouteCoords([])
    }
    const { from, to } = routeLeg
    getRoute(from, to).then((r) => {
      if (cancelled) return
      if (r) {
        hasRoadLineRef.current = true
        setRouteCoords(r.coords)
        return
      }
      // No route (router down, rate limited, offline, timeout): keep the road line
      // already drawn to this same target rather than wiping it mid-drive; with none
      // to keep, draw the straight line so the captain still sees where to head.
      const keepRoadLine = hasRoadLineRef.current
      setRouteCoords((prev) => (keepRoadLine && prev.length >= 2 ? prev : [from, to]))
    })
    return () => { cancelled = true }
  }, [routeLeg])

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

  // The recipient is not in the masked-call session (that reaches the sender), so
  // this dials their real number. Errors land in the FormError right above the
  // step button, next to the summary row that triggered the call.
  async function onCallRecipient() {
    setError(null)
    const phone = box.data?.recipientPhone
    if (!phone || !(await openDialer(phone))) setError(t('captain.live.callUnavailable'))
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
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
          {isBox ? t('captain.box.completedTitle') : t('captain.live.completedTitle')}
        </Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
          {t('captain.live.fareCollected', { fare: formatIqd(trip.fareIqd, i18n.language) })}
        </Text>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'center', fontStyle: 'normal' }}>
          {isBox ? t('captain.box.rateSender') : t('captain.live.rateRider')}
        </Text>
        <RatingStars value={stars} onChange={setStars} />
        <Button label={stars > 0 ? t('captain.live.submitRating') : t('captain.live.skip')} onPress={onSubmitRating} />
      </View>
    )
  }

  // Active (accepted / in_progress). A Box walks the same three steps; only the
  // start/complete wording changes ("Picked up the box" / "Delivered").
  const primaryLabel =
    status === 'accepted' && !arrived ? t('captain.live.arrivedAtPickup')
    : status === 'accepted' && arrived ? t(isBox ? 'captain.box.pickedUp' : 'captain.live.startTrip')
    : status === 'in_progress' ? t(isBox ? 'captain.box.delivered' : 'captain.live.completeTrip')
    : t('captain.live.arrivedAtPickup') // 'requested' (transient) fallback — refetch clears it

  const stopCoords = stops.map((s) => ({ latitude: s.lat, longitude: s.lng }))
  // Frame the map to enclose the whole active leg (captain + pickup + dropoff +
  // stops). Without this the camera has no initial region and MapLibre opens at
  // world zoom — the "map is so far away" bug. `fitToCoords` needs ≥2 points; the
  // pickup/dropoff pair guarantees that even before the first GPS fix lands.
  const fitCoords = [
    ...(location ? [location] : []),
    ...(pickup ? [pickup] : []),
    ...(dropoff ? [dropoff] : []),
    ...stopCoords,
  ]
  // A single-point region as a floor, so the map is never at world zoom for the
  // one frame before fitToCoords runs (or if only one point exists).
  const focus = target ?? pickup ?? dropoff ?? location ?? undefined

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '52%' }}>
        <TripMap
          ref={mapRef}
          initialRegion={
            focus
              ? { latitude: focus.latitude, longitude: focus.longitude, latitudeDelta: 0.03, longitudeDelta: 0.03 }
              : undefined
          }
          fitToCoords={fitCoords}
          driver={location ?? undefined}
          pickup={pickup}
          dropoff={dropoff}
          routeCoords={routeCoords}
          stops={stopCoords}
          showsUserLocation={false}
        />
        {location && (
          <RecenterButton
            bottomOffset={Spacing.lg}
            onPress={() =>
              mapRef.current?.animateToRegion(
                { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 },
                450,
              )
            }
          />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}
      >
        {/* native forceRTL mirrors this row in AR — no manual flip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal' }}>{t('captain.live.fareLabel')}</Text>
          {/* Currency value: lock LTR so the IQD amount keeps Western digit order inside the AR (forceRTL) screen. */}
          <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>{formatIqd(trip.fareIqd, i18n.language)}</Text>
        </View>

        {trip.tripType === 'abriyah' && <MemberRoster data={roster.data} />}

        {/* Box: one compact line here; the full parcel card goes BELOW the step
            buttons so the primary action stays above the fold (the map takes 52%). */}
        {isBox && (
          <BoxSummaryRow
            details={box.data}
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, boxCardY.current - Spacing.md), animated: true })}
            onCallRecipient={onCallRecipient}
          />
        )}

        {trip.tripType === 'regular' && (
          <StopsPanel stops={stops} reachingId={reachingId} onReach={reachStop} />
        )}

        <FormError message={error} />

        <Button label={primaryLabel} loading={busy} onPress={onPrimary} />

        <NavigateButtons destination={target} />

        <TripActionBar
          onCall={onCall}
          callLabel={isBox ? t('captain.box.callSender') : undefined}
          onChat={() => router.push({ pathname: '/(chat)/[tripId]', params: { tripId: id } })}
          onCancel={status === 'accepted' ? () => setShowCancel(true) : undefined}
        />

        {isBox && (
          <View onLayout={(e) => { boxCardY.current = e.nativeEvent.layout.y }}>
            <BoxDetailsCard
              tripId={id}
              details={box.data}
              isLoading={box.isLoading}
              isError={box.isError}
              onRetry={() => void box.refetch()}
              dropoffAddress={trip.dropoffAddress}
            />
          </View>
        )}
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
