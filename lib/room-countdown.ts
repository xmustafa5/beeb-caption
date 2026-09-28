// lib/room-countdown.ts
// The countdown on a Nafarat room offer card: how long the captain can still
// wait for more riders before the room expires. Pure, so it is unit tested.
//
// The backend sends the room's deadline twice: `expires_at` (RFC3339) and
// `expires_in_seconds` (whole seconds left when it built the offer). The card
// counts down from the moment the offer ARRIVED plus `expires_in_seconds`, so
// a phone whose clock is off still shows the right time; `expires_at` is only
// the fallback for a payload without the seconds.
//
// The queue poll and the WS `beep.room.offered` frame both feed the same card;
// `carryRoomDeadline`, `applyRoomFrame` and `createFrameGate` below decide
// what each of them may change on it.

/** Under this many seconds the countdown turns to the warning colour. */
export const COUNTDOWN_WARNING_SECONDS = 60

export type CountdownTone = 'normal' | 'warning' | 'expired'

export interface RoomDeadlineFields {
  /** Whole seconds left when the backend built the offer. */
  expiresInSeconds?: number
  /** The room's deadline, RFC3339. */
  expiresAt?: string
}

/**
 * The local-clock instant (ms) a room offer expires: its arrival time plus
 * `expiresInSeconds`, else `expiresAt` read against this phone's clock.
 * Undefined when the offer carries neither (an older backend): no countdown.
 */
export function roomDeadlineMs(
  { expiresInSeconds, expiresAt }: RoomDeadlineFields,
  receivedAtMs: number,
): number | undefined {
  if (typeof expiresInSeconds === 'number' && Number.isFinite(expiresInSeconds)) {
    return receivedAtMs + Math.max(0, expiresInSeconds) * 1000
  }
  if (expiresAt) {
    const at = Date.parse(expiresAt)
    if (Number.isFinite(at)) return at
  }
  return undefined
}

/**
 * Whole seconds left before `deadlineMs`, never negative. Rounded UP, so the
 * card only reaches 0 ("expired") once the deadline has really passed.
 */
export function secondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
}

/** `m:ss`, Western digits in every language: 192 → '3:12', 59 → '0:59', 600 → '10:00'. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 'expired' at 0, 'warning' under a minute, 'normal' otherwise. */
export function countdownTone(seconds: number): CountdownTone {
  if (seconds <= 0) return 'expired'
  return seconds < COUNTDOWN_WARNING_SECONDS ? 'warning' : 'normal'
}

/**
 * Milliseconds until the shown second changes (a tick timer waits exactly
 * this long, so the display never skips or repeats a second). Null once the
 * deadline has passed: nothing is left to tick.
 */
export function msUntilNextTick(deadlineMs: number, nowMs: number): number | null {
  const remaining = deadlineMs - nowMs
  if (remaining <= 0) return null
  return remaining % 1000 || 1000
}

/** What `carryRoomDeadline` needs from an offer. */
export interface DeadlineCarrier {
  offerType: string
  id: string
  expiresAt?: string
  deadlineMs?: number
}

function sameInstant(a?: string, b?: string): boolean {
  if (!a || !b) return false
  const x = Date.parse(a)
  return Number.isFinite(x) && x === Date.parse(b)
}

/**
 * Keep a room's countdown steady across refreshes. Every queue poll (and every
 * room frame) re-derives the deadline as its own arrival time plus
 * `expires_in_seconds`. The backend rounds those seconds DOWN, so an estimate
 * is never more than 1 s early; the network delay can only make it LATER, by
 * as much as the response took. So while the room's `expiresAt` is unchanged
 * the card keeps the EARLIEST deadline it has seen: the countdown never jumps
 * up, and a slow first response is corrected by the next faster one, settling
 * within about a second of the real deadline. A changed `expiresAt` (the join
 * that readied the room restarted the wait) takes the new deadline, so the
 * countdown restarts.
 */
export function carryRoomDeadline<T extends DeadlineCarrier>(prev: T | undefined, next: T): T {
  if (
    !prev ||
    next.offerType !== 'room' ||
    prev.offerType !== 'room' ||
    prev.id !== next.id ||
    prev.deadlineMs == null ||
    !sameInstant(prev.expiresAt, next.expiresAt) ||
    (next.deadlineMs != null && next.deadlineMs <= prev.deadlineMs)
  ) {
    return next
  }
  return { ...next, deadlineMs: prev.deadlineMs }
}

/** `carryRoomDeadline` over a fresh queue, matching rooms by id. */
export function carryRoomDeadlines<T extends DeadlineCarrier>(prev: readonly T[] | undefined, next: T[]): T[] {
  if (!prev?.length) return next
  const rooms = new Map(prev.filter((o) => o.offerType === 'room').map((o) => [o.id, o]))
  if (rooms.size === 0) return next
  return next.map((o) => (o.offerType === 'room' ? carryRoomDeadline(rooms.get(o.id), o) : o))
}

/** What a WS room frame can put on a room card before the refetch confirms it. */
export interface RoomFrame {
  roomId?: string
  riderCount?: number
  totalFareIqd?: number
  /** The room's deadline as the frame sent it (RFC3339). */
  expiresAt?: string
  /** The local-clock deadline, fixed when the frame arrived (`roomDeadlineMs`). */
  deadlineMs?: number
}

/** What `applyRoomFrame` needs from an offer. */
export interface RoomFrameTarget extends DeadlineCarrier {
  riderCount?: number
  totalFareIqd?: number
}

/**
 * Write a room frame onto the matching room card in the cached queue: its
 * rider count, total fare and deadline, each only when the frame has it. The
 * deadline goes through `carryRoomDeadline`, so a frame for the same
 * `expiresAt` can only correct the countdown down, and a moved `expiresAt`
 * restarts it. Returns `prev` itself when there is nothing to write (no room
 * id, nothing on the frame, or that room isn't in the queue).
 */
export function applyRoomFrame<T extends RoomFrameTarget>(
  prev: T[] | undefined,
  frame: RoomFrame,
): T[] | undefined {
  const { roomId, riderCount, totalFareIqd, expiresAt, deadlineMs } = frame
  if (!prev || !roomId) return prev
  if (riderCount == null && totalFareIqd == null && deadlineMs == null) return prev
  let hit = false
  const next = prev.map((o) => {
    if (o.offerType !== 'room' || o.id !== roomId) return o
    hit = true
    return carryRoomDeadline(o, {
      ...o,
      riderCount: riderCount ?? o.riderCount,
      totalFareIqd: totalFareIqd ?? o.totalFareIqd,
      ...(deadlineMs != null ? { expiresAt: expiresAt ?? o.expiresAt, deadlineMs } : null),
    })
  })
  return hit ? next : prev
}

/**
 * What to do with the presence provider's latest offer frame:
 * - `'none'`: no frame, or the queue isn't live (offline or off the Home tab);
 * - `'merge'`: a frame not seen before, queue live: write it onto the card
 *   (`applyRoomFrame`), then refetch;
 * - `'refetch'`: the same frame again (coming back to Home re-runs the effect
 *   with the last, possibly minutes-old frame): only the refetch may speak.
 */
export type FrameAction = 'none' | 'merge' | 'refetch'

/**
 * A gate that lets each frame through for merging at most once. A frame that
 * arrives while the queue isn't live is marked seen too, so it is never merged
 * later: by the time the captain is back on Home, the poll knows better.
 */
export function createFrameGate<F extends object>(): (frame: F | null | undefined, live: boolean) => FrameAction {
  let seen: F | null = null
  return (frame, live) => {
    if (!frame) return 'none'
    const fresh = seen !== frame
    seen = frame
    if (!live) return 'none'
    return fresh ? 'merge' : 'refetch'
  }
}
