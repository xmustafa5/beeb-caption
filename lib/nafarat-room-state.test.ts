import { cancelIsPartOfRide, mergeRoster, nafaratRideState, seatTripStatus, type RosterEntry } from './nafarat-room-state'

interface M {
  riderId: string
  name: string
}
const m = (riderId: string, name = riderId): M => ({ riderId, name })
const seats = (roster: RosterEntry<M>[]) => roster.map((e) => [e.member.riderId, e.seatNumber])

describe('mergeRoster', () => {
  it('numbers riders 1..n in join order', () => {
    expect(seats(mergeRoster([], [m('a'), m('b'), m('c')]))).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })

  it('keeps every number when a rider drops off /members (no renumbering)', () => {
    const first = mergeRoster([], [m('a'), m('b'), m('c')])
    const after = mergeRoster(first, [m('a'), m('c')])
    expect(seats(after)).toEqual([['a', 1], ['b', 2], ['c', 3]])
  })

  it('gives a new rider the next number, never a freed one', () => {
    const first = mergeRoster([], [m('a'), m('b')])
    const bLeft = mergeRoster(first, [m('a')])
    expect(seats(mergeRoster(bLeft, [m('a'), m('d')]))).toEqual([['a', 1], ['b', 2], ['d', 3]])
  })

  it('refreshes a known rider from /members and keeps the last data of one who left', () => {
    const first = mergeRoster([], [m('a', 'Ali'), m('b', 'Bashar')])
    const next = mergeRoster(first, [m('a', 'Ali Hassan')])
    expect(next.map((e) => e.member.name)).toEqual(['Ali Hassan', 'Bashar'])
  })

  it('does not number a rider twice when /members repeats them', () => {
    expect(seats(mergeRoster([], [m('a'), m('a'), m('b')]))).toEqual([['a', 1], ['b', 2]])
  })

  it('is stable when merged again with the same members', () => {
    const first = mergeRoster([], [m('a'), m('b')])
    expect(mergeRoster(first, [m('a'), m('b')])).toEqual(first)
  })
})

describe('seatTripStatus', () => {
  it('uses the trip status while the rider is on /members', () => {
    expect(seatTripStatus(false, 'accepted')).toBe('accepted')
    expect(seatTripStatus(false, 'cancelled')).toBe('cancelled')
    expect(seatTripStatus(false, undefined)).toBeNull()
  })

  it('treats a rider gone from /members as cancelled unless they were dropped off', () => {
    expect(seatTripStatus(true, 'accepted')).toBe('cancelled')
    expect(seatTripStatus(true, undefined)).toBe('cancelled')
    expect(seatTripStatus(true, 'completed')).toBe('completed')
  })
})

describe('nafaratRideState', () => {
  const base = { membersLoaded: true, membersError: false, roomStatus: 'dispatched', tripsKnown: true }

  it('is loading until /members answers, and error when it fails', () => {
    expect(nafaratRideState({ ...base, membersLoaded: false, seatStatuses: [] })).toBe('loading')
    expect(nafaratRideState({ ...base, membersLoaded: false, membersError: true, seatStatuses: [] })).toBe('error')
  })

  it('is ended as soon as the room expired', () => {
    expect(nafaratRideState({ ...base, roomStatus: 'expired', seatStatuses: ['accepted'] })).toBe('ended')
  })

  it('waits for the trips before deciding', () => {
    expect(nafaratRideState({ ...base, tripsKnown: false, seatStatuses: ['accepted'] })).toBe('loading')
  })

  it('is live while any rider still has to be picked up or dropped off', () => {
    expect(nafaratRideState({ ...base, seatStatuses: ['accepted', 'completed'] })).toBe('live')
    expect(nafaratRideState({ ...base, seatStatuses: ['in_progress', 'cancelled'] })).toBe('live')
    // Trips not read yet for a seat (null): still live.
    expect(nafaratRideState({ ...base, seatStatuses: [null] })).toBe('live')
  })

  it('is done once every remaining rider was dropped off', () => {
    expect(nafaratRideState({ ...base, seatStatuses: ['completed', 'cancelled', 'completed'] })).toBe('done')
  })

  it('is ended when nobody is left to drive', () => {
    expect(nafaratRideState({ ...base, seatStatuses: [] })).toBe('ended')
    expect(nafaratRideState({ ...base, seatStatuses: ['cancelled', 'cancelled'] })).toBe('ended')
  })

  it('runs without the room read (an older backend refused it)', () => {
    expect(nafaratRideState({ ...base, roomStatus: undefined, seatStatuses: ['accepted'] })).toBe('live')
  })
})

describe('cancelIsPartOfRide', () => {
  const trip = (id: string, status: 'accepted' | 'in_progress' | 'completed' | 'cancelled', roomId: string | null = 'r1') => ({
    id,
    status,
    tripType: roomId ? 'abriyah' : 'regular',
    roomId,
  })

  it('answers from the room screen cache when it holds the trip', () => {
    const room = [trip('t1', 'cancelled'), trip('t2', 'in_progress')]
    expect(cancelIsPartOfRide('t1', [room], null)).toBe(true)
    const lastOne = [trip('t1', 'cancelled'), trip('t2', 'completed')]
    expect(cancelIsPartOfRide('t1', [lastOne], trip('t9', 'accepted'))).toBe(false)
  })

  it('falls back to the active trip once the room cache is gone', () => {
    expect(cancelIsPartOfRide('t1', [], trip('t2', 'accepted'))).toBe(true)
    expect(cancelIsPartOfRide('t1', [undefined], trip('t2', 'in_progress'))).toBe(true)
  })

  it('is a plain cancel for a regular trip, the same trip, or no active trip', () => {
    expect(cancelIsPartOfRide('t1', [], trip('t2', 'accepted', null))).toBe(false)
    expect(cancelIsPartOfRide('t1', [], trip('t1', 'accepted'))).toBe(false)
    expect(cancelIsPartOfRide('t1', [], null)).toBe(false)
    expect(cancelIsPartOfRide('t1', [], undefined)).toBe(false)
  })
})
