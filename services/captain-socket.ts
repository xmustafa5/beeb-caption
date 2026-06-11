// services/captain-socket.ts
import { WS_BASE_URL } from '@/lib/api'

export type CaptainSocketState = 'connecting' | 'open' | 'closed'

export interface LocationEcho {
  longitude: number
  latitude: number
  lastPingAt?: string
  online?: boolean
}

export interface TripFrame {
  id: string
  status: string
  [k: string]: unknown
}

export interface OfferFrame {
  tripId: string
  [k: string]: unknown
}

export interface CaptainSocketHandlers {
  onLocationEcho?: (loc: LocationEcho) => void
  onTripUpdate?: (trip: TripFrame) => void
  onOffer?: (offer: OfferFrame) => void
  onState?: (state: CaptainSocketState) => void
}

const KEEPALIVE_MS = 25_000
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/**
 * Read-only /ws/captain client. Opens with the JWT as a query param, keeps the
 * connection warm with a 25s frame, reconnects with exponential backoff, and
 * routes frames by their additive `event` field (falling back to field-sniffing).
 * The backend ignores client→server frames; this never sends commands.
 */
export class CaptainSocket {
  private ws: WebSocket | null = null
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = RECONNECT_MIN_MS
  private closedByUs = false

  constructor(
    private readonly token: string,
    private readonly handlers: CaptainSocketHandlers,
  ) {}

  connect(): void {
    this.closedByUs = false
    this.open()
  }

  close(): void {
    this.closedByUs = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopKeepAlive()
    this.ws?.close()
    this.ws = null
    this.handlers.onState?.('closed')
  }

  private open(): void {
    this.handlers.onState?.('connecting')
    const url = `${WS_BASE_URL}/ws/captain?token=${encodeURIComponent(this.token)}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS
      this.handlers.onState?.('open')
      this.startKeepAlive()
    }
    ws.onmessage = (e) => this.handleMessage(e.data)
    ws.onerror = () => { /* surfaced via onclose */ }
    ws.onclose = () => {
      this.stopKeepAlive()
      if (this.closedByUs) return
      this.handlers.onState?.('connecting')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.open(), this.backoff)
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS)
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAlive = setInterval(() => {
      // The server ignores client frames; this no-op text frame keeps intermediaries from idling us.
      try { this.ws?.send('ping') } catch { /* ignore */ }
    }, KEEPALIVE_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(raw)
    } catch {
      return // ignore non-JSON
    }
    const event = frame.event as string | undefined

    // Prefer the additive `event`; else field-sniff.
    if (event === 'captain_location' || (frame.longitude !== undefined && frame.latitude !== undefined && frame.status === undefined)) {
      this.handlers.onLocationEcho?.({
        longitude: Number(frame.longitude),
        latitude: Number(frame.latitude),
        lastPingAt: frame.last_ping_at as string | undefined,
        online: frame.online as boolean | undefined,
      })
      return
    }
    if (frame.trip_id !== undefined && frame.pickup_lat !== undefined) {
      this.handlers.onOffer?.({ tripId: String(frame.trip_id), ...frame })
      return
    }
    if (event === 'trip_update' || (frame.id !== undefined && frame.status !== undefined)) {
      this.handlers.onTripUpdate?.({ id: String(frame.id), status: String(frame.status), ...frame })
      return
    }
    // Unknown frame — ignore.
  }
}
