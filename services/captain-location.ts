// services/captain-location.ts
import { api, parseApiError } from '@/lib/api'

export interface CaptainLocation {
  captainId: string
  longitude: number
  latitude: number
  lastPingAt: string
  online: boolean
}

export interface PingCoords {
  longitude: number
  latitude: number
  /**
   * Travel direction in degrees clockwise from north. The rider's map rotates the
   * car sprite with it, so a wrong value is worse than none: send `null` unless the
   * fix is trustworthy (see `toPingCoords`). Backend `LocationPingInput` defaults
   * all three of these, so omitting or nulling them is wire-compatible.
   */
  heading_deg?: number | null
  speed_mps?: number | null
  accuracy_m?: number | null
}

/**
 * The subset of `Location.LocationObjectCoords` a ping needs. Declared
 * structurally so the background task and the foreground watch can share the
 * mapper without this service depending on expo-location.
 */
export interface DeviceCoords {
  longitude: number
  latitude: number
  heading?: number | null
  speed?: number | null
  accuracy?: number | null
}

/**
 * Below this the device is standing still and its reported heading is stale
 * noise (the last direction it happened to be facing, or a compass reading).
 */
const HEADING_MIN_SPEED_MPS = 1

/**
 * Device fix → ping payload. The heading guard is the whole point: iOS reports
 * `-1` for "unknown" and Android reports `0`, the backend 400s on a negative
 * heading, and `0` is a legitimate "due north" — so a raw passthrough either
 * kills the ping or permanently points the rider's car north. Only a heading the
 * device produced while actually moving is sent; everything else is `null`.
 */
export function toPingCoords(c: DeviceCoords): PingCoords {
  const speed = typeof c.speed === 'number' && c.speed >= 0 ? c.speed : null
  const heading =
    typeof c.heading === 'number' && c.heading >= 0 && (speed ?? 0) > HEADING_MIN_SPEED_MPS
      ? c.heading
      : null
  return {
    longitude: c.longitude,
    latitude: c.latitude,
    heading_deg: heading,
    speed_mps: speed,
    accuracy_m: typeof c.accuracy === 'number' ? c.accuracy : null,
  }
}

interface BackendLocation {
  captain_id: string
  longitude: number
  latitude: number
  last_ping_at: string
  online: boolean
}

function toCaptainLocation(b: BackendLocation): CaptainLocation {
  return {
    captainId: b.captain_id,
    longitude: b.longitude,
    latitude: b.latitude,
    lastPingAt: b.last_ping_at,
    online: b.online,
  }
}

/** Toggle online. Going online enforces today's activation gate (403 if not activated). */
export async function setOnline(online: boolean): Promise<void> {
  await api.put('/api/captain/online', { online })
}

/** Single GPS ping. Sets the captain online (presence). Out-of-range coords → 400. */
export async function pingLocation(coords: PingCoords): Promise<CaptainLocation> {
  const { data } = await api.post<BackendLocation>('/api/captain/location', coords)
  return toCaptainLocation(data)
}

/** Flush queued pings on reconnect (backend keeps only the last). Empty list → 400. */
export async function flushPings(pings: PingCoords[]): Promise<CaptainLocation> {
  const { data } = await api.post<BackendLocation>('/api/captain/location/flush', { pings })
  return toCaptainLocation(data)
}

/** Read own last-known location. Never-pinged → null (404 mapped). */
export async function getLocation(): Promise<CaptainLocation | null> {
  try {
    const { data } = await api.get<BackendLocation>('/api/captain/location')
    return toCaptainLocation(data)
  } catch (err) {
    if (parseApiError(err).status === 404) return null
    throw err
  }
}
