import {
  applyRoomFrame,
  carryRoomDeadline,
  carryRoomDeadlines,
  countdownTone,
  createFrameGate,
  formatCountdown,
  msUntilNextTick,
  roomDeadlineMs,
  secondsLeft,
  type DeadlineCarrier,
} from './room-countdown'

const T0 = 1_790_000_000_000 // some arrival instant, ms

describe('roomDeadlineMs', () => {
  it('counts from the arrival time plus the seconds the backend sent', () => {
    expect(roomDeadlineMs({ expiresInSeconds: 192, expiresAt: '2000-01-01T00:00:00Z' }, T0)).toBe(T0 + 192_000)
  })

  it('never trusts the phone clock when the seconds are there', () => {
    // expires_at says "long ago", the seconds say 5 minutes: the seconds win.
    expect(roomDeadlineMs({ expiresInSeconds: 300, expiresAt: '1999-01-01T00:00:00Z' }, T0)).toBe(T0 + 300_000)
  })

  it('treats a negative value as already expired', () => {
    expect(roomDeadlineMs({ expiresInSeconds: -4 }, T0)).toBe(T0)
  })

  it('falls back to expires_at when the seconds are missing', () => {
    expect(roomDeadlineMs({ expiresAt: '2026-09-28T10:05:00Z' }, T0)).toBe(Date.parse('2026-09-28T10:05:00Z'))
  })

  it('is undefined without a usable deadline (an older backend)', () => {
    expect(roomDeadlineMs({}, T0)).toBeUndefined()
    expect(roomDeadlineMs({ expiresAt: 'not a date' }, T0)).toBeUndefined()
    expect(roomDeadlineMs({ expiresInSeconds: Number.NaN }, T0)).toBeUndefined()
  })
})

describe('secondsLeft', () => {
  it('rounds up, so 0 only shows once the deadline has passed', () => {
    const deadline = T0 + 192_000
    expect(secondsLeft(deadline, T0)).toBe(192)
    expect(secondsLeft(deadline, T0 + 1)).toBe(192)
    expect(secondsLeft(deadline, T0 + 1000)).toBe(191)
    expect(secondsLeft(deadline, deadline - 1)).toBe(1)
    expect(secondsLeft(deadline, deadline)).toBe(0)
  })

  it('never goes negative', () => {
    expect(secondsLeft(T0, T0 + 60_000)).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('is m:ss', () => {
    expect(formatCountdown(192)).toBe('3:12')
    expect(formatCountdown(300)).toBe('5:00')
    expect(formatCountdown(59)).toBe('0:59')
    expect(formatCountdown(9)).toBe('0:09')
    expect(formatCountdown(0)).toBe('0:00')
  })

  it('keeps counting minutes past an hour-long window', () => {
    expect(formatCountdown(600)).toBe('10:00')
    expect(formatCountdown(3725)).toBe('62:05')
  })

  it('uses Western digits only', () => {
    expect(formatCountdown(192)).toMatch(/^[0-9]+:[0-9]{2}$/)
  })

  it('clamps nonsense to 0:00', () => {
    expect(formatCountdown(-5)).toBe('0:00')
  })
})

describe('countdownTone', () => {
  it('warns under a minute and is expired at 0', () => {
    expect(countdownTone(300)).toBe('normal')
    expect(countdownTone(60)).toBe('normal')
    expect(countdownTone(59)).toBe('warning')
    expect(countdownTone(1)).toBe('warning')
    expect(countdownTone(0)).toBe('expired')
  })
})

describe('msUntilNextTick', () => {
  it('waits exactly until the shown second changes', () => {
    const deadline = T0 + 192_000
    expect(msUntilNextTick(deadline, T0)).toBe(1000)
    expect(msUntilNextTick(deadline, T0 + 250)).toBe(750)
    expect(msUntilNextTick(deadline, deadline - 1)).toBe(1)
  })

  it('stops at the deadline', () => {
    expect(msUntilNextTick(T0, T0)).toBeNull()
    expect(msUntilNextTick(T0, T0 + 5)).toBeNull()
  })
})

describe('carryRoomDeadline', () => {
  const room = (over: Partial<{ id: string; expiresAt: string; deadlineMs: number; riderCount: number }> = {}) => ({
    offerType: 'room',
    id: 'room-1',
    expiresAt: '2026-09-28T10:05:00.123456Z',
    deadlineMs: T0 + 192_000,
    riderCount: 2,
    ...over,
  })

  it('keeps the running countdown while the room deadline is unchanged', () => {
    // A poll 8 s later re-derives the deadline 400 ms off (latency, rounding).
    const next = room({ deadlineMs: T0 + 192_400, riderCount: 3 })
    const carried = carryRoomDeadline(room(), next)
    expect(carried.deadlineMs).toBe(T0 + 192_000)
    expect(carried.riderCount).toBe(3) // everything else comes from the fresh offer
  })

  it('lets a later, more accurate sample correct a late first one', () => {
    // The first response took 3 s to land: its deadline is 3 s too late.
    const late = room({ deadlineMs: T0 + 195_000 })
    // The next poll landed fast: 200 ms late. The card moves down to it...
    const better = carryRoomDeadline(late, room({ deadlineMs: T0 + 192_200 }))
    expect(better.deadlineMs).toBe(T0 + 192_200)
    // ...and a slower poll after that never pushes it back up.
    expect(carryRoomDeadline(better, room({ deadlineMs: T0 + 193_500 })).deadlineMs).toBe(T0 + 192_200)
  })

  it('keeps the running countdown when the fresh offer has no deadline', () => {
    expect(carryRoomDeadline(room(), room({ deadlineMs: undefined })).deadlineMs).toBe(T0 + 192_000)
  })

  it('restarts when a join moved the room deadline', () => {
    const next = room({ expiresAt: '2026-09-28T10:09:40Z', deadlineMs: T0 + 300_000 })
    expect(carryRoomDeadline(room(), next).deadlineMs).toBe(T0 + 300_000)
  })

  it('takes the fresh deadline when there is nothing to carry', () => {
    const next = room({ deadlineMs: T0 + 192_400 })
    expect(carryRoomDeadline(undefined, next)).toBe(next)
    expect(carryRoomDeadline(room({ deadlineMs: undefined }), next)).toBe(next)
    expect(carryRoomDeadline(room({ id: 'room-2' }), next)).toBe(next)
  })

  it('compares instants, not strings', () => {
    const prev = room({ expiresAt: '2026-09-28T10:05:00Z' })
    const next = room({ expiresAt: '2026-09-28T10:05:00.000Z', deadlineMs: T0 + 192_700 })
    expect(carryRoomDeadline(prev, next).deadlineMs).toBe(T0 + 192_000)
  })

  it('never touches a trip offer', () => {
    const trip: DeadlineCarrier = { offerType: 'trip', id: 'room-1' }
    expect(carryRoomDeadline<DeadlineCarrier>(room(), trip)).toBe(trip)
  })
})

describe('carryRoomDeadlines', () => {
  it('carries each room by id and leaves new rooms and trips alone', () => {
    const prev = [
      { offerType: 'room', id: 'a', expiresAt: '2026-09-28T10:05:00Z', deadlineMs: T0 + 100_000 },
      { offerType: 'trip', id: 't' },
    ]
    const next = [
      { offerType: 'trip', id: 't' },
      { offerType: 'room', id: 'a', expiresAt: '2026-09-28T10:05:00Z', deadlineMs: T0 + 100_600 },
      { offerType: 'room', id: 'b', expiresAt: '2026-09-28T10:06:00Z', deadlineMs: T0 + 160_000 },
    ]
    const out = carryRoomDeadlines(prev, next)
    expect(out.map((o) => o.deadlineMs)).toEqual([undefined, T0 + 100_000, T0 + 160_000])
    expect(out[0]).toBe(next[0])
    expect(out[2]).toBe(next[2])
  })

  it('returns the fresh list as is on the first fetch', () => {
    const next = [{ offerType: 'room', id: 'a', deadlineMs: T0 }]
    expect(carryRoomDeadlines(undefined, next)).toBe(next)
  })
})

describe('applyRoomFrame', () => {
  const EXPIRES = '2026-09-28T10:05:00Z'
  const queue = () => [
    { offerType: 'trip', id: 't', fareIqd: 4000 },
    { offerType: 'room', id: 'r', riderCount: 2, totalFareIqd: 9000, expiresAt: EXPIRES, deadlineMs: T0 + 190_000 },
    { offerType: 'room', id: 'other', riderCount: 2, totalFareIqd: 8000, expiresAt: EXPIRES, deadlineMs: T0 + 50_000 },
  ]

  it('puts the rider count and total fare on the matching room only', () => {
    const prev = queue()
    const next = applyRoomFrame(prev, { roomId: 'r', riderCount: 3, totalFareIqd: 13_500 })!
    expect(next[1]).toMatchObject({ riderCount: 3, totalFareIqd: 13_500, deadlineMs: T0 + 190_000 })
    expect(next[0]).toBe(prev[0])
    expect(next[2]).toBe(prev[2])
  })

  it('keeps what the frame does not carry', () => {
    const next = applyRoomFrame(queue(), { roomId: 'r', riderCount: 3 })!
    expect(next[1]).toMatchObject({ riderCount: 3, totalFareIqd: 9000, expiresAt: EXPIRES })
  })

  it('restarts the countdown when the frame moved the room deadline', () => {
    const next = applyRoomFrame(queue(), {
      roomId: 'r',
      riderCount: 2,
      expiresAt: '2026-09-28T10:09:40Z',
      deadlineMs: T0 + 300_000,
    })!
    expect(next[1]).toMatchObject({ expiresAt: '2026-09-28T10:09:40Z', deadlineMs: T0 + 300_000 })
  })

  it('never pushes the countdown up for the same deadline, but lets it correct down', () => {
    const later = applyRoomFrame(queue(), { roomId: 'r', expiresAt: EXPIRES, deadlineMs: T0 + 191_500 })!
    expect(later[1].deadlineMs).toBe(T0 + 190_000)
    const earlier = applyRoomFrame(queue(), { roomId: 'r', expiresAt: EXPIRES, deadlineMs: T0 + 189_400 })!
    expect(earlier[1].deadlineMs).toBe(T0 + 189_400)
  })

  it("keeps the card's expiresAt when the frame has only the seconds", () => {
    // Same room, no expires_at on the frame: the instant is unchanged, so this is a correction.
    const next = applyRoomFrame(queue(), { roomId: 'r', deadlineMs: T0 + 191_000 })!
    expect(next[1]).toMatchObject({ expiresAt: EXPIRES, deadlineMs: T0 + 190_000 })
  })

  it('leaves the queue as is when there is nothing to write', () => {
    const prev = queue()
    expect(applyRoomFrame(prev, { riderCount: 3 })).toBe(prev) // a trip frame: no room id
    expect(applyRoomFrame(prev, { roomId: 'r' })).toBe(prev) // nothing on the frame
    expect(applyRoomFrame(prev, { roomId: 'gone', riderCount: 3 })).toBe(prev) // room not in the queue
    expect(applyRoomFrame(prev, { roomId: 't', riderCount: 3 })).toBe(prev) // an id of a TRIP offer
    expect(applyRoomFrame(undefined, { roomId: 'r', riderCount: 3 })).toBeUndefined() // no queue yet
  })
})

describe('createFrameGate', () => {
  const frame = (roomId: string) => ({ tripId: 'trip', roomId, riderCount: 2 })

  it('merges a new frame once while the queue is live, then only refetches', () => {
    const gate = createFrameGate<ReturnType<typeof frame>>()
    const a = frame('r')
    expect(gate(a, true)).toBe('merge')
    expect(gate(a, true)).toBe('refetch') // the effect re-ran for another reason
    const b = frame('r')
    expect(gate(b, true)).toBe('merge') // a new frame object, even for the same room
  })

  it('does nothing without a frame', () => {
    const gate = createFrameGate<ReturnType<typeof frame>>()
    expect(gate(null, true)).toBe('none')
    expect(gate(undefined, true)).toBe('none')
  })

  it('does nothing while the queue is not live', () => {
    const gate = createFrameGate<ReturnType<typeof frame>>()
    expect(gate(frame('r'), false)).toBe('none')
  })

  it('never merges an old frame when the captain comes back to Home', () => {
    const gate = createFrameGate<ReturnType<typeof frame>>()
    const seenLive = frame('r')
    expect(gate(seenLive, true)).toBe('merge')
    expect(gate(seenLive, false)).toBe('none') // left Home
    expect(gate(seenLive, true)).toBe('refetch') // back on Home: the poll speaks

    // A frame that ARRIVED while off Home is not merged on return either.
    const whileAway = frame('r')
    expect(gate(whileAway, false)).toBe('none')
    expect(gate(whileAway, true)).toBe('refetch')
  })
})
