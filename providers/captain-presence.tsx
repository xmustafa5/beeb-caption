// providers/captain-presence.tsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import * as Location from 'expo-location'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'
import {
  setOnline as apiSetOnline,
  pingLocation,
  flushPings,
  getLocation,
  type PingCoords,
} from '@/services/captain-location'
import { CaptainSocket, type CaptainSocketState } from '@/services/captain-socket'

export type ConnectionHealth = 'offline' | 'connecting' | 'live' | 'stale'

export interface TripUpdate { id: string; status: string }
export interface Offer { tripId: string }

interface CaptainPresence {
  online: boolean
  connection: ConnectionHealth
  goingOnline: boolean
  error: string | null
  setOnline: (online: boolean) => Promise<void>
  lastTripUpdate: TripUpdate | null
  lastOffer: Offer | null
}

const PING_INTERVAL_MS = 10_000
const STALE_AFTER_MS = 60_000
const RESUME_WINDOW_MS = 5 * 60_000

const Ctx = createContext<CaptainPresence | null>(null)

export function useCaptainPresence(): CaptainPresence {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCaptainPresence must be used within CaptainPresenceProvider')
  return ctx
}

export function CaptainPresenceProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)

  const [online, setOnlineState] = useState(false)
  const [connection, setConnection] = useState<ConnectionHealth>('offline')
  const [goingOnline, setGoingOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTripUpdate, setLastTripUpdate] = useState<TripUpdate | null>(null)
  const [lastOffer, setLastOffer] = useState<Offer | null>(null)

  const sub = useRef<Location.LocationSubscription | null>(null)
  const lastCoords = useRef<PingCoords | null>(null)
  const queue = useRef<PingCoords[]>([])
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socket = useRef<CaptainSocket | null>(null)

  const markFreshEcho = useCallback(() => {
    setConnection('live')
    if (staleTimer.current) clearTimeout(staleTimer.current)
    staleTimer.current = setTimeout(() => setConnection('stale'), STALE_AFTER_MS)
  }, [])

  const stopSession = useCallback(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (staleTimer.current) { clearTimeout(staleTimer.current); staleTimer.current = null }
    sub.current?.remove(); sub.current = null
    socket.current?.close(); socket.current = null
    queue.current = []
    lastCoords.current = null
  }, [])

  const startSession = useCallback(async () => {
    // Foreground location watch feeds lastCoords.
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
      (pos) => { lastCoords.current = { longitude: pos.coords.longitude, latitude: pos.coords.latitude } },
    )

    // Open the socket.
    if (token) {
      socket.current = new CaptainSocket(token, {
        onState: (s: CaptainSocketState) => {
          if (s === 'open') markFreshEcho()
          else if (s === 'connecting') setConnection((c) => (c === 'offline' ? 'connecting' : c))
        },
        onLocationEcho: () => markFreshEcho(),
        onTripUpdate: (t) => setLastTripUpdate({ id: t.id, status: t.status }),
        onOffer: (o) => setLastOffer({ tripId: o.tripId }),
      })
      socket.current.connect()
    }

    // Ping loop: post the latest coords; queue + flush on failure.
    pingTimer.current = setInterval(async () => {
      const c = lastCoords.current
      if (!c) return
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
    }, PING_INTERVAL_MS)
  }, [token, markFreshEcho])

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
      } catch (err) {
        setError(parseApiError(err).status === 403 ? 'notActivated' : 'onlineFailed')
        stopSession()
        setOnlineState(false)
        setConnection('offline')
      } finally {
        setGoingOnline(false)
      }
    } else {
      stopSession()
      setOnlineState(false)
      setConnection('offline')
      try { await apiSetOnline(false) } catch { /* best-effort */ }
    }
  }, [startSession, stopSession])

  // On launch: resume if recently online.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const loc = await getLocation()
        if (cancelled || !loc?.online) return
        const age = Date.now() - new Date(loc.lastPingAt).getTime()
        if (age < RESUME_WINDOW_MS) {
          await startSession()
          if (cancelled) { stopSession(); return }
          setOnlineState(true)
          setConnection('connecting')
        }
      } catch { /* start offline */ }
    })()
    return () => { cancelled = true }
  }, [token, startSession])

  // Cleanup on unmount.
  useEffect(() => () => stopSession(), [stopSession])

  return (
    <Ctx.Provider value={{ online, connection, goingOnline, error, setOnline, lastTripUpdate, lastOffer }}>
      {children}
    </Ctx.Provider>
  )
}
