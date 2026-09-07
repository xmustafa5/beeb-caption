// hooks/use-remote-trip-cancel.ts
import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useQueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useCaptainPresence } from '@/providers/captain-presence'
import { ACTIVE_TRIP_KEY } from '@/hooks/use-active-trip'
import type { CancelledBy } from '@/services/captain-trips'

/** Mirrors the (private) queue key in use-trip-queue.ts — a cancel frees the captain up. */
export const TRIP_QUEUE_KEY = ['captain', 'trip-queue'] as const

/**
 * One cancel announcement per trip, app-wide.
 *
 * `(trip)` is a sibling stack screen of `(tabs)`, so the tabs tree stays mounted
 * underneath the live-trip screen: this hook and the trip screen's poll backstop
 * (use-live-trip) are BOTH alive for the same cancel and would fire two identical
 * alerts. Arbitrating by "which route is on top" is fragile (a push tap or the
 * launch resume can land either way round), so instead both paths claim the trip
 * id here and only the first claimant speaks. The captain's own cancel claims the
 * id silently in `cancelM.onMutate`, which is what keeps either path from
 * announcing a cancel the captain just performed.
 */
const announced = new Set<string>()

/** Reserve the announcement for `tripId`. True only for the first caller. */
export function claimCancelAnnouncement(tripId: string): boolean {
  if (announced.has(tripId)) return false
  // A captain drives a handful of trips per launch; this only stops a pathological
  // session from growing the set without bound.
  if (announced.size > 50) announced.clear()
  announced.add(tripId)
  return true
}

/**
 * Which explanation to show. `system` is the dispatch/stale sweep and `admin` is
 * support or a captain block — neither is the rider giving up, and telling a
 * captain "the rider cancelled" when support pulled the trip is a lie they may
 * act on. An unknown or absent actor falls back to the neutral body rather than
 * guessing.
 */
function cancelBodyKey(by?: CancelledBy): string {
  if (by === 'rider') return 'captain.live.cancelledByRider'
  if (by === 'system' || by === 'admin') return 'captain.live.cancelledBySupport'
  return 'captain.live.cancelledBody'
}

/** Haptic + alert, at most once per trip. False when someone already announced it. */
export function announceRemoteCancel(tripId: string, cancelledBy?: CancelledBy): boolean {
  if (!claimCancelAnnouncement(tripId)) return false
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }
  Alert.alert(i18n.t('captain.live.cancelledTitle'), i18n.t(cancelBodyKey(cancelledBy)), [
    { text: i18n.t('common.done') },
  ])
  return true
}

/**
 * Home-tab reaction to a remote cancel. The captain is not always on the trip
 * screen when the rider gives up — the "resume trip" banner used to just vanish
 * with no explanation. Mount ONCE, in the tabs layout, next to useResumeActiveTrip.
 *
 * Reads the WS frame rather than a poll so this lands in ~1s; the trip screen's
 * 10s refetch is the backstop for a dropped socket.
 */
export function useRemoteTripCancel() {
  const { lastTripUpdate } = useCaptainPresence()
  const queryClient = useQueryClient()
  // The provider hands out a fresh object per frame, so dedupe on the id — a
  // repeated cancel frame must not re-invalidate (and re-fetch) on every tick.
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (lastTripUpdate?.status !== 'cancelled') return
    const id = lastTripUpdate.id
    if (handled.current === id) return
    handled.current = id

    announceRemoteCancel(id, lastTripUpdate.cancelledBy)
    // Invalidate whether or not we were the one to alert: the banner, the trip
    // screen and the queue all have to drop a trip that no longer exists.
    queryClient.invalidateQueries({ queryKey: ACTIVE_TRIP_KEY })
    queryClient.invalidateQueries({ queryKey: ['trip', id] })
    queryClient.invalidateQueries({ queryKey: TRIP_QUEUE_KEY })
  }, [lastTripUpdate, queryClient])
}
