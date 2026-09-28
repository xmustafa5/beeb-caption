import { nextNafaratStop, type SeatForRoute } from './nafarat-next-stop'

// Three riders along one street; the car starts next to rider "near".
const seat = (riderId: string, lat: number, tripStatus: string | null, dropLat = lat + 0.1): SeatForRoute => ({
  riderId,
  name: riderId,
  pickup: { latitude: lat, longitude: 44.4 },
  dropoff: { latitude: dropLat, longitude: 44.4 },
  tripStatus,
})
const car = { latitude: 33.3, longitude: 44.4 }

describe('nextNafaratStop', () => {
  it('picks up the closest waiting rider first', () => {
    const seats = [seat('far', 33.5, 'accepted'), seat('near', 33.31, 'accepted'), seat('mid', 33.4, 'accepted')]
    expect(nextNafaratStop(seats, car)).toMatchObject({ riderId: 'near', kind: 'pickup', latitude: 33.31 })
  })

  it('finishes every pickup before any drop-off', () => {
    const seats = [seat('onboard', 33.31, 'in_progress', 33.3), seat('waiting', 33.6, 'accepted')]
    expect(nextNafaratStop(seats, car)).toMatchObject({ riderId: 'waiting', kind: 'pickup' })
  })

  it('then drops off, closest first', () => {
    const seats = [seat('a', 33.31, 'in_progress', 33.9), seat('b', 33.32, 'in_progress', 33.35)]
    expect(nextNafaratStop(seats, car)).toMatchObject({ riderId: 'b', kind: 'dropoff', latitude: 33.35 })
  })

  it('skips riders who cancelled or were dropped off', () => {
    const seats = [seat('gone', 33.3, 'cancelled'), seat('done', 33.3, 'completed'), seat('left', 33.7, 'accepted')]
    expect(nextNafaratStop(seats, car)).toMatchObject({ riderId: 'left', kind: 'pickup' })
  })

  it('falls back to the first rider without a GPS fix', () => {
    const seats = [seat('first', 33.5, 'accepted'), seat('second', 33.3, 'accepted')]
    expect(nextNafaratStop(seats, null)).toMatchObject({ riderId: 'first', kind: 'pickup' })
  })

  it('is null once nobody is left', () => {
    expect(nextNafaratStop([seat('a', 33.3, 'completed'), seat('b', 33.3, 'cancelled')], car)).toBeNull()
    expect(nextNafaratStop([], car)).toBeNull()
  })
})
