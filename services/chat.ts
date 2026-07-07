import { api } from '@/lib/api'

// 1:1 rider<->captain chat, keyed by trip. The backend enforces that the caller
// is that trip's rider or its assigned captain (any valid JWT — no role header).
// Sending is only allowed while the trip is active (accepted / in_progress);
// reading history works any time once a captain has been assigned. POST returns
// the persisted message and also fans it out over the WS channel
// rt:chat:trip:{tripId} (dedupe the self-echo by id).

export type ChatRole = 'rider' | 'captain'

export interface ChatMessage {
  id: string
  tripId: string
  /** users.id (rider) or captains.id (captain) — id space depends on senderRole. */
  senderId: string
  senderRole: ChatRole
  body: string
  /** RFC3339 once the counterparty reads it; null while unread. */
  readAt: string | null
  /** RFC3339 send time. Also the keyset cursor for pagination. */
  createdAt: string
}

export interface ChatPage {
  /** Oldest-first within the page (backend contract). */
  items: ChatMessage[]
  /** True when older messages exist before items[0]. */
  hasMore: boolean
}

interface BackendMessage {
  id: string
  trip_id: string
  sender_id: string
  sender_role: string
  body: string
  read_at?: string | null
  created_at: string
}

function toMessage(b: BackendMessage): ChatMessage {
  return {
    id: b.id,
    tripId: b.trip_id,
    senderId: b.sender_id,
    senderRole: b.sender_role === 'captain' ? 'captain' : 'rider',
    body: b.body,
    readAt: b.read_at ?? null,
    createdAt: b.created_at,
  }
}

/**
 * Send a chat message on a trip. Body is trimmed server-side; empty-after-trim
 * and >2000 chars are rejected with 400. 403 = not a participant; 404 = trip
 * not found; 409 = chat closed (trip not active).
 */
export async function sendMessage(tripId: string, body: string): Promise<ChatMessage> {
  const { data } = await api.post<BackendMessage>(`/api/chat/trips/${tripId}/messages`, { body })
  return toMessage(data)
}

/**
 * A page of history, newest page first (omit `before`), walking backwards with
 * `before = items[0].createdAt`. Calling this marks the counterparty's messages
 * as read and emits a chat_read receipt on the WS channel. 403 until the caller
 * is a participant with an assigned captain; 404 trip not found.
 */
export async function getMessages(
  tripId: string,
  opts?: { before?: string; limit?: number },
): Promise<ChatPage> {
  const { data } = await api.get<{ items: BackendMessage[]; has_more: boolean }>(
    `/api/chat/trips/${tripId}/messages`,
    {
      params: {
        ...(opts?.before ? { before: opts.before } : {}),
        limit: Math.min(100, Math.max(1, opts?.limit ?? 50)),
      },
    },
  )
  return {
    items: (data.items ?? []).map(toMessage),
    hasMore: data.has_more,
  }
}

// Max message length the backend accepts (chars, after trim). Mirrored here so
// the composer can gate before the round-trip.
export const CHAT_MAX_LEN = 2000
