// providers/captain-presence.tsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Alert } from 'react-native'
import * as Location from 'expo-location'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'
import { roomDeadlineMs } from '@/lib/room-countdown'
// Imported for its side effect as much as for the name: defining the background
// task at module scope is what lets the OS deliver fixes after a relaunch.
import {
  TRIP_LOCATION_TASK,
  notePingSent,
  setBackgroundPingMode,
  type BackgroundPingMode,
} from '@/lib/trip-location-task'
import {
  setOnline as apiSetOnline,
  pingLocation,
  flushPings,
  getLocation,
  toPingCoords,
  type PingCoords,
} from '@/services/captain-location'
import { getActiveCaptainTrip, toCancelledBy, type CancelledBy } from '@/services/captain-trips'
import { CaptainSocket, type CaptainSocketState } from '@/services/captain-socket'

export type ConnectionHealth = 'offline' | 'connecting' | 'live' | 'stale'

export interface TripUpdate { id: string; status: string; cancelledBy?: CancelledBy }
export interface Offer {
  tripId: string
  /** Room offers only (see OfferFrame). */
  roomId?: string
  riderCount?: number
  totalFareIqd?: number
  /** Room offers: the room's deadline as sent (RFC3339). */
  expiresAt?: string
  /** Room offers: the local-clock instant (ms) the room expires, fixed when the frame arrived. */
  deadlineMs?: number
}

interface CaptainPresence {
  online: boolean
  connection: ConnectionHealth
  goingOnline: boolean
  error: string | null
  setOnline: (online: boolean) => Promise<void>
  /**
   * True while a trip owns the location session: pings run at trip cadence, the
   * background task is up, and going offline is refused. The tab bar reads this
   * to disable its toggle.
   */
  tripActive: boolean
  /**
   * Called by the live-trip screen on every status change. An accepted or
   * in_progress trip must keep the rider's car moving whether or not the online
   * toggle says so, and a terminal one must release the background task.
   */
  ensureTracking: (tripStatus?: string | null) => Promise<void>
  lastTripUpdate: TripUpdate | null
  lastOffer: Offer | null
}

const PING_INTERVAL_MS = 10_000
/** A rider watching the car move needs finer granularity than idle presence does. */
const TRIP_PING_INTERVAL_MS = 4_000
const STALE_AFTER_MS = 60_000

const Ctx = createContext<CaptainPresence | null>(null)

export function useCaptainPresence(): CaptainPresence {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCaptainPresence must be used within CaptainPresenceProvider')
  return ctx
}

function isActiveStatus(status?: string | null): boolean {
  return status === 'accepted' || status === 'in_progress'
}

export function CaptainPresenceProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  // Presence (location ping + resume) only applies to an approved captain;
  // /api/captain/location 403s otherwise. AuthGate already keeps non-approved
  // captains out of the tabs, but gate here too so a transient state never pings.
  const isApproved = useAuthStore((s) => s.captain?.status === 'approved')
  const captainId = useAuthStore((s) => s.captain?.id)

  const [online, setOnlineState] = useState(false)
  const [connection, setConnection] = useState<ConnectionHealth>('offline')
  const [goingOnline, setGoingOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tripActive, setTripActive] = useState(false)
  const [lastTripUpdate, setLastTripUpdate] = useState<TripUpdate | null>(null)
  const [lastOffer, setLastOffer] = useState<Offer | null>(null)

  const sub = useRef<Location.LocationSubscription | null>(null)
  const lastCoords = useRef<PingCoords | null>(null)
  const queue = useRef<PingCoords[]>([])
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socket = useRef<CaptainSocket | null>(null)
  // Mirrors `tripActive` for the callbacks below, which must read it without
  // being re-created (and without restarting the socket) when it flips.
  const onTrip = useRef(false)
  const sessionActive = useRef(false)
  // "Always" is asked for once per app run. A refusal degrades to the foreground
  // watch instead of blocking the trip, and re-prompting on every status change
  // would just be noise.
  const bgPermission = useRef<'unknown' | 'granted' | 'denied'>('unknown')
  // The mode the OS task was last started in, so a repeat call (every trip
  // status change reaches here) does not restart location updates for nothing.
  const bgMode = useRef<BackgroundPingMode | null>(null)

  const markFreshEcho = useCallback(() => {
    setConnection('live')
    if (staleTimer.current) clearTimeout(staleTimer.current)
    staleTimer.current = setTimeout(() => setConnection('stale'), STALE_AFTER_MS)
  }, [])

  /**
   * Hand the OS task back. Called on every teardown path, and unconditionally
   * when a trip ends: an Android foreground service outlives the JS that started
   * it, so a stale one from a previous run has to be cleared even though this
   * process never started it.
   */
  const stopBackgroundUpdates = useCallback(async () => {
    bgMode.current = null
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK)
      }
    } catch { /* task was never registered with the OS */ }
  }, [])

  // Post the latest coords; queue + flush on failure.
  const sendPing = useCallback(async () => {
    const c = lastCoords.current
    if (!c) return
    notePingSent()
    if (queue.current.length > 0) {
      const queued = [...queue.current]
      queue.current = []
      try {
        await flushPings([...queued, c])
      } catch (err) {
        // 400 (bad coords) → drop the batch; else restore everything for next tick.
        if (parseApiError(err).status !== 400) queue.current = [...queued, c]
      }
    } else {
      try {
        await pingLocation(c)
      } catch (err) {
        if (parseApiError(err).status !== 400) queue.current.push(c)
      }
    }
  }, [])

  /**
   * (Re)start the foreground watch at the accuracy the current mode deserves.
   * On a trip the fix feeds a map the rider is staring at, so it is worth the
   * battery; idle-online only needs to be good enough to match a dispatch.
   */
  const startWatch = useCallback(async () => {
    sub.current?.remove()
    sub.current = await Location.watchPositionAsync(
      onTrip.current
        ? { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 3000 }
        : { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
      (pos) => {
        const first = lastCoords.current === null
        lastCoords.current = toPingCoords(pos.coords)
        // Ping on the first fix instead of waiting for the interval: the backend
        // judges "near enough to accept" from the last ping, and after a reopen
        // that ping can be from wherever the app was closed.
        if (first) void sendPing()
      },
    )
  }, [sendPing])

  const startPingLoop = useCallback(() => {
    if (pingTimer.current) clearInterval(pingTimer.current)
    pingTimer.current = setInterval(
      () => { void sendPing() },
      onTrip.current ? TRIP_PING_INTERVAL_MS : PING_INTERVAL_MS,
    )
  }, [sendPing])

  const stopSession = useCallback(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (staleTimer.current) { clearTimeout(staleTimer.current); staleTimer.current = null }
    sub.current?.remove(); sub.current = null
    socket.current?.close(); socket.current = null
    queue.current = []
    lastCoords.current = null
    sessionActive.current = false
    onTrip.current = false
    setTripActive(false)
    void stopBackgroundUpdates()
  }, [stopBackgroundUpdates])

  // Idempotent: the launch resume, the online toggle and `ensureTracking` all
  // reach for it, and a second socket or watch would double every ping.
  const startSession = useCallback(async () => {
    if (sessionActive.current) return
    sessionActive.current = true

    // Foreground location watch feeds lastCoords. A revoked permission throws
    // here; release the claim so the next attempt retries instead of no-opping.
    try {
      await startWatch()
    } catch (err) {
      sessionActive.current = false
      throw err
    }

    // Open the socket.
    if (token) {
      socket.current = new CaptainSocket(token, {
        onState: (s: CaptainSocketState) => {
          if (s === 'open') markFreshEcho()
          else if (s === 'connecting') setConnection((c) => (c === 'offline' ? 'connecting' : c))
        },
        onLocationEcho: () => markFreshEcho(),
        // `cancelled_by` rides on every lifecycle frame (null unless it is a
        // cancel), so the alert can say who quit instead of always blaming the rider.
        onTripUpdate: (t) =>
          setLastTripUpdate({ id: t.id, status: t.status, cancelledBy: toCancelledBy(t.cancelled_by) }),
        onOffer: (o) =>
          setLastOffer({
            tripId: o.tripId,
            roomId: o.roomId,
            riderCount: o.riderCount,
            totalFareIqd: o.totalFareIqd,
            expiresAt: o.expiresAt,
            // The countdown runs from the moment the frame arrived, not from the phone clock.
            deadlineMs: o.roomId ? roomDeadlineMs(o, Date.now()) : undefined,
          }),
      })
      socket.current.connect()
    }

    startPingLoop()
  }, [token, markFreshEcho, startWatch, startPingLoop])

  /**
   * Only iOS needs an "Always" grant. On Android the foreground service IS the
   * authorisation (expo-location skips the background check whenever a
   * `foregroundService` is given), and ACCESS_BACKGROUND_LOCATION is
   * deliberately absent from the manifest -- asking for it there would THROW
   * (NoPermissionInManifestException) and it would drag Play's
   * background-location declaration review in for nothing.
   */
  const ensureBackgroundPermission = useCallback(async (): Promise<boolean> => {
    if (process.env.EXPO_OS !== 'ios') return true
    if (bgPermission.current === 'unknown') {
      try {
        const res = await Location.requestBackgroundPermissionsAsync()
        bgPermission.current = res.status === 'granted' ? 'granted' : 'denied'
      } catch {
        bgPermission.current = 'denied'
      }
      if (bgPermission.current === 'denied') {
        // Not fatal: the foreground watch still works while the app is open,
        // and the backend keeps an idle captain online for a while anyway.
        Alert.alert(
          i18n.t('captain.live.backgroundLocationTitle'),
          i18n.t('captain.live.backgroundLocationBody'),
        )
      }
    }
    return bgPermission.current === 'granted'
  }, [])

  /**
   * Hand pinging to an OS-owned task so it carries on once the captain leaves
   * the app: the JS timers above are suspended in the background. Runs for the
   * whole time the captain is online -- idle, so going to the home screen does
   * not end the shift and offers keep matching where the car really is, and at
   * trip cadence, so the rider's car keeps moving while Waze is open.
   */
  const startBackgroundUpdates = useCallback(async (mode: BackgroundPingMode) => {
    setBackgroundPingMode(mode)
    if (!(await ensureBackgroundPermission())) return
    try {
      if (bgMode.current === mode && (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK))) {
        return
      }
      // Starting an already-running task replaces its options in place, so a
      // mode switch needs no stop first (Android cannot restart a foreground
      // service from the background).
      await Location.startLocationUpdatesAsync(
        TRIP_LOCATION_TASK,
        mode === 'trip'
          ? {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 10,
              // The rider's car must not stall because the captain waited at a light.
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: true,
              foregroundService: {
                notificationTitle: 'Beep Captain',
                notificationBody: i18n.t('captain.live.sharingLocation'),
              },
            }
          : {
              // GPS, not Balanced: on Android Balanced means wifi/cell fixes,
              // which are hundreds of metres off on Iraqi roads, and a captain
              // waiting for work is usually driving, not parked. Dispatch ranks
              // by distance to pickup, so a wrong position offers the trip to
              // the wrong car.
              accuracy: Location.Accuracy.High,
              timeInterval: 10_000,
              distanceInterval: 30,
              // A captain parked waiting for work must not be paused out of
              // updates: iOS would then let the app be suspended.
              pausesUpdatesAutomatically: false,
              showsBackgroundLocationIndicator: false,
              foregroundService: {
                notificationTitle: 'Beep Captain',
                notificationBody: i18n.t('captain.live.onlineInBackground'),
              },
            },
      )
      bgMode.current = mode
    } catch { /* degrade to the foreground watch */ }
  }, [ensureBackgroundPermission])

  const startTripTracking = useCallback(async () => {
    if (!onTrip.current) {
      onTrip.current = true
      setTripActive(true)
      // Re-arm the foreground watch and timer at trip cadence.
      if (sessionActive.current) { await startWatch(); startPingLoop() }
    }
    await startBackgroundUpdates('trip')
  }, [startWatch, startPingLoop, startBackgroundUpdates])

  const stopTripTracking = useCallback(async () => {
    if (onTrip.current) {
      onTrip.current = false
      setTripActive(false)
      // Back to idle cadence; the captain may well still be online and waiting.
      if (sessionActive.current) { await startWatch(); startPingLoop() }
    }
    // Still online: keep the idle background task so leaving the app does not
    // end the shift. Offline: an Android foreground service outlives the JS
    // that started it, so hand it back even if this process never started it.
    if (sessionActive.current) await startBackgroundUpdates('idle')
    else await stopBackgroundUpdates()
  }, [startWatch, startPingLoop, startBackgroundUpdates, stopBackgroundUpdates])

  const ensureTracking = useCallback(async (tripStatus?: string | null) => {
    if (isActiveStatus(tripStatus)) {
      try {
        await startSession()
      } catch {
        setError('permissionNeeded')
        return
      }
      setOnlineState(true)
      setConnection((c) => (c === 'offline' ? 'connecting' : c))
      await startTripTracking()
    } else {
      await stopTripTracking()
    }
  }, [startSession, startTripTracking, stopTripTracking])

  const setOnline = useCallback(async (next: boolean) => {
    setError(null)
    if (next) {
      setGoingOnline(true)
      try {
        const perm = await Location.requestForegroundPermissionsAsync()
        if (perm.status !== 'granted') { setError('permissionNeeded'); return }
        await apiSetOnline(true)
        await startSession()
        setOnlineState(true)
        setConnection('connecting')
        // Not awaited: the iOS "Always" prompt must not hold the toggle spinner.
        void startBackgroundUpdates(onTrip.current ? 'trip' : 'idle')
      } catch (err) {
        setError(parseApiError(err).status === 403 ? 'notActivated' : 'onlineFailed')
        stopSession()
        setOnlineState(false)
        setConnection('offline')
      } finally {
        setGoingOnline(false)
      }
    } else {
      // Order matters. This used to stop the session BEFORE calling the API and
      // swallow whatever came back — so a refusal left the client dark while the
      // server still had the captain online, which is exactly the case that kills
      // the rider's car. Nothing is torn down until the server has agreed.
      setGoingOnline(true)
      try {
        await apiSetOnline(false)
      } catch (err) {
        // 409 carries the trip that blocks it: stay online and say why.
        if (parseApiError(err).status === 409) {
          Alert.alert(
            i18n.t('captain.live.offlineBlockedTitle'),
            i18n.t('captain.live.offlineBlockedBody'),
          )
        } else {
          setError('onlineFailed')
        }
        return
      } finally {
        setGoingOnline(false)
      }
      // stopSession also drops trip mode and hands the background task back.
      stopSession()
      setOnlineState(false)
      setConnection('offline')
    }
  }, [startSession, stopSession, startBackgroundUpdates])

  // On launch: resume if a trip is running, or if the backend still has us online.
  useEffect(() => {
    if (!token || !isApproved) return
    let cancelled = false
    ;(async () => {
      // An active trip outranks the online flag and the resume window entirely.
      // Relaunching ten minutes into a ride — or after the staleness sweep flipped
      // `online` to false — used to mean zero pings for the rest of it. The
      // backend tolerates the resume: POST /api/captain/location only requires an
      // approved captain and re-sets online itself.
      const [loc, trip] = await Promise.all([
        getLocation().catch(() => null),
        captainId ? getActiveCaptainTrip(captainId).catch(() => null) : Promise.resolve(null),
      ])
      if (cancelled) return

      // The backend's flag is the truth: it keeps an idle captain online for a
      // long grace window after the app is closed (and switches them off past
      // it), so reopening the app picks the shift up where it was.
      const onTripNow = isActiveStatus(trip?.status)
      const stillOnline = !!loc?.online
      if (!onTripNow && !stillOnline) return

      try {
        await startSession()
        if (cancelled) { stopSession(); return }
        setOnlineState(true)
        setConnection('connecting')
        if (onTripNow) await startTripTracking()
        else await startBackgroundUpdates('idle')
      } catch { /* start offline */ }
    })()
    return () => { cancelled = true }
  }, [token, isApproved, captainId, startSession, stopSession, startTripTracking, startBackgroundUpdates])

  // Tear down when the session ends. The provider now lives at the app root
  // (so the live-trip screen shares it), so it no longer unmounts on logout —
  // explicitly stop the socket + ping loop and reset presence when the token
  // clears, then clean up on unmount.
  useEffect(() => {
    if (!token) {
      stopSession()
      setOnlineState(false)
      setConnection('offline')
    }
    return () => stopSession()
  }, [token, stopSession])

  return (
    <Ctx.Provider
      value={{
        online,
        connection,
        goingOnline,
        error,
        setOnline,
        tripActive,
        ensureTracking,
        lastTripUpdate,
        lastOffer,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
