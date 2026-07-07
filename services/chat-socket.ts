import { WS_BASE_URL } from '@/lib/api'
import { useAuthStore } from '@/store/auth-store'
import type { ChatRole } from '@/services/chat'

// Live chat channel for one trip. Subscribes to rt:chat:trip:{tripId} over the
// shared /ws/subscribe socket and surfaces the two frame shapes the backend
// sends. Scoped to the chat screen: open() on mount, close() on unmount.
//
// Delivery model: POST persists a message AND fans it out here — including the
// sender's own echo — so consumers must dedupe chat_message by messageId.

export interface ChatMessageFrame {
  event: 'chat_message'
  messageId: string
  tripId: string
  senderId: string
  senderRole: ChatRole
  body: string
  createdAt: string
}

export interface ChatReadFrame {
  event: 'chat_read'
  tripId: string
  readerRole: ChatRole
  readAt: string
}

export interface ChatSocketHandlers {
  onMessage?: (frame: ChatMessageFrame) => void
  onRead?: (frame: ChatReadFrame) => void
  /** Fires on (re)connect — a good moment to re-sync history for anything missed. */
  onOpen?: () => void
}

const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export class ChatSocket {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = RECONNECT_MIN_MS
  private closed = false

  constructor(
    private readonly tripId: string,
    private readonly handlers: ChatSocketHandlers,
  ) {}

  open(): void {
    this.closed = false
    this.connect()
  }

  close(): void {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    try {
      this.ws?.close()
    } catch {
      /* noop */
    }
    this.ws = null
  }

  private connect(): void {
    const token = useAuthStore.getState().token
    if (!token || this.closed) return

    const channel = `rt:chat:trip:${this.tripId}`
    const url = `${WS_BASE_URL}/ws/subscribe?token=${encodeURIComponent(token)}&channel=${encodeURIComponent(channel)}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS
      this.handlers.onOpen?.()
    }
    ws.onmessage = (e) => this.handleFrame(typeof e.data === 'string' ? e.data : '')
    ws.onerror = () => {
      try {
        ws.close()
      } catch {
        /* surfaced via onclose */
      }
    }
    ws.onclose = () => {
      if (this.closed) return
      this.reconnectTimer = setTimeout(() => this.connect(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS)
    }
  }

  private handleFrame(raw: string): void {
    let f: Record<string, unknown>
    try {
      f = JSON.parse(raw)
    } catch {
      return
    }
    if (!f || typeof f !== 'object') return
    const event = f.event

    if (event === 'chat_message' && typeof f.message_id === 'string') {
      this.handlers.onMessage?.({
        event: 'chat_message',
        messageId: f.message_id,
        tripId: String(f.trip_id ?? this.tripId),
        senderId: String(f.sender_id ?? ''),
        senderRole: f.sender_role === 'captain' ? 'captain' : 'rider',
        body: typeof f.body === 'string' ? f.body : '',
        createdAt: String(f.created_at ?? ''),
      })
      return
    }

    if (event === 'chat_read') {
      this.handlers.onRead?.({
        event: 'chat_read',
        tripId: String(f.trip_id ?? this.tripId),
        readerRole: f.reader_role === 'captain' ? 'captain' : 'rider',
        readAt: String(f.read_at ?? ''),
      })
    }
  }
}
