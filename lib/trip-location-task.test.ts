jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }))
jest.mock('@/services/captain-location', () => ({ pingLocation: jest.fn(), toPingCoords: jest.fn() }))
jest.mock('@/store/auth-store', () => ({ useAuthStore: { getState: () => ({ token: 't' }) } }))

import {
  MIN_PING_GAP_MS,
  notePingSent,
  resetBackgroundPingState,
  setBackgroundPingMode,
  shouldSendBackgroundPing,
} from './trip-location-task'

describe('background ping throttle', () => {
  beforeEach(() => resetBackgroundPingState())

  it('sends the first ping of a run', () => {
    expect(shouldSendBackgroundPing(1_000_000)).toBe(true)
  })

  it('spaces idle pings at least the idle gap apart', () => {
    setBackgroundPingMode('idle')
    notePingSent(0)
    expect(shouldSendBackgroundPing(MIN_PING_GAP_MS.idle - 1)).toBe(false)
    expect(shouldSendBackgroundPing(MIN_PING_GAP_MS.idle)).toBe(true)
  })

  it('lets trip pings through at the finer trip gap', () => {
    setBackgroundPingMode('trip')
    notePingSent(0)
    expect(shouldSendBackgroundPing(MIN_PING_GAP_MS.trip)).toBe(true)
    expect(MIN_PING_GAP_MS.trip).toBeLessThan(MIN_PING_GAP_MS.idle)
  })

  it('counts a foreground ping, so the two loops do not double up', () => {
    setBackgroundPingMode('idle')
    notePingSent(50_000)
    expect(shouldSendBackgroundPing(52_000)).toBe(false)
  })
})
