import { isOnTripScreen, launchResume, offerScreenHref, tripScreenHref } from './trip-route'

const taxi = { id: 't-1', tripType: 'regular', roomId: null }
const seat = { id: 't-2', tripType: 'abriyah', roomId: 'r-9' }

const TRIP_SEGMENTS = ['(trip)', '[id]']
const ROOM_SEGMENTS = ['(trip)', 'room', '[id]']
const HOME_SEGMENTS = ['(tabs)']

describe('tripScreenHref', () => {
  it('opens a Nafarat seat on its room screen', () => {
    expect(tripScreenHref(seat)).toBe('/(trip)/room/r-9')
  })

  it('opens anything else on the live-trip screen', () => {
    expect(tripScreenHref(taxi)).toBe('/(trip)/t-1')
    expect(tripScreenHref({ id: 't-3', tripType: 'abriyah', roomId: null })).toBe('/(trip)/t-3')
  })
})

describe('offerScreenHref', () => {
  it('opens an accepted room on the same screen as any of its seats', () => {
    // The launch resume relies on this: a room offer's id is the room id.
    expect(offerScreenHref({ id: 'r-9', offerType: 'room' })).toBe(
      tripScreenHref({ id: 't', tripType: 'abriyah', roomId: 'r-9' }),
    )
  })

  it('opens an accepted trip on its live-trip screen', () => {
    expect(offerScreenHref({ id: 't-1', offerType: 'trip' })).toBe(tripScreenHref(taxi))
  })
})

describe('isOnTripScreen', () => {
  it('matches the pathname expo-router reports (no group) inside the (trip) group', () => {
    expect(isOnTripScreen('/room/r-9', ROOM_SEGMENTS, seat)).toBe(true)
    expect(isOnTripScreen('/t-1', TRIP_SEGMENTS, taxi)).toBe(true)
  })

  it('is false on the chat for the same trip, which reports the same pathname', () => {
    expect(isOnTripScreen('/t-1', ['(chat)', '[tripId]'], taxi)).toBe(false)
  })

  it('is false anywhere else', () => {
    expect(isOnTripScreen('/', HOME_SEGMENTS, seat)).toBe(false)
    expect(isOnTripScreen('/t-2', TRIP_SEGMENTS, seat)).toBe(false)
    expect(isOnTripScreen('/room/r-9', ROOM_SEGMENTS, taxi)).toBe(false)
  })
})

describe('launchResume', () => {
  it('waits while there is no answer yet', () => {
    expect(launchResume(null, 'c-1', undefined, '/', HOME_SEGMENTS)).toEqual({ spend: false, href: null })
  })

  it('waits while there is no captain', () => {
    expect(launchResume(null, undefined, taxi, '/', HOME_SEGMENTS)).toEqual({ spend: false, href: null })
  })

  it('spends the check on an answered "no trip", without navigating', () => {
    expect(launchResume(null, 'c-1', null, '/', HOME_SEGMENTS)).toEqual({ spend: true, href: null })
  })

  it('spends the check without navigating when the captain is already on the trip screen', () => {
    expect(launchResume(null, 'c-1', taxi, '/t-1', TRIP_SEGMENTS)).toEqual({ spend: true, href: null })
    expect(launchResume(null, 'c-1', seat, '/room/r-9', ROOM_SEGMENTS)).toEqual({ spend: true, href: null })
  })

  it('resumes a live trip found at launch', () => {
    expect(launchResume(null, 'c-1', taxi, '/', HOME_SEGMENTS)).toEqual({ spend: true, href: '/(trip)/t-1' })
    expect(launchResume(null, 'c-1', seat, '/', HOME_SEGMENTS)).toEqual({ spend: true, href: '/(trip)/room/r-9' })
  })

  it('resumes the trip over its chat, which is not the trip screen', () => {
    expect(launchResume(null, 'c-1', taxi, '/t-1', ['(chat)', '[tripId]'])).toEqual({
      spend: true,
      href: '/(trip)/t-1',
    })
  })

  it('never acts again once spent for this captain', () => {
    // E2E bug (a): "no trip" at launch, then the offer just accepted shows up
    // in the same query — its screen is already open, it must not be pushed.
    expect(launchResume('c-1', 'c-1', taxi, '/', HOME_SEGMENTS)).toEqual({ spend: false, href: null })
    expect(launchResume('c-1', 'c-1', null, '/', HOME_SEGMENTS)).toEqual({ spend: false, href: null })
  })

  it('checks again for a different captain', () => {
    expect(launchResume('c-1', 'c-2', taxi, '/', HOME_SEGMENTS)).toEqual({ spend: true, href: '/(trip)/t-1' })
  })
})
