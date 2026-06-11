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
