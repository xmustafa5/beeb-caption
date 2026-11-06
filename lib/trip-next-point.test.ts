import { legFrame, nextPoint } from './trip-next-point'
import type { TripStop } from '@/services/captain-stops'

const stop = (seq: number, status: TripStop['status'] = 'pending'): TripStop => ({
  id: `s${seq}`,
  seq,
  status,
  lat: 33 + seq / 100,
  lng: 44 + seq / 100,
})

describe('nextPoint', () => {
  it('goes to the pickup until the rider is aboard, even with stops booked', () => {
    expect(nextPoint(false, [stop(1)])).toEqual({ kind: 'pickup' })
  })

  it('goes through the stops in booked order, however the list arrives', () => {
    const next = nextPoint(true, [stop(2), stop(1)])
    expect(next.kind === 'stop' && next.stop.id).toBe('s1')
  })

  it('moves on to the next stop once one is reached, and counts all of them', () => {
    const next = nextPoint(true, [stop(1, 'reached'), stop(2), stop(3)])
    expect(next.kind === 'stop' && next.stop.id).toBe('s2')
    expect(next.kind === 'stop' && next.total).toBe(3)
  })

  it('goes to the dropoff with every stop reached, or none booked', () => {
    expect(nextPoint(true, [stop(1, 'reached')])).toEqual({ kind: 'dropoff' })
    expect(nextPoint(true, [])).toEqual({ kind: 'dropoff' })
  })
})

describe('legFrame', () => {
  const at = (latitude: number, longitude: number) => ({ latitude, longitude })

  it('frames exactly the two ends of a long leg', () => {
    const [a, b] = legFrame(at(33.3, 44.3), at(33.32, 44.4))
    expect(a.latitude).toBeCloseTo(33.3)
    expect(a.longitude).toBeCloseTo(44.3)
    expect(b.latitude).toBeCloseTo(33.32)
    expect(b.longitude).toBeCloseTo(44.4)
  })

  it('keeps a readable frame when the captain is already there', () => {
    const [a, b] = legFrame(at(33.3, 44.3), at(33.3, 44.3))
    expect(b.latitude - a.latitude).toBeCloseTo(0.004)
    expect(b.longitude - a.longitude).toBeCloseTo(0.004)
    expect((a.latitude + b.latitude) / 2).toBeCloseTo(33.3)
  })
})
