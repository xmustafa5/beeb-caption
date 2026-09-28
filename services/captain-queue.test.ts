import { api } from '@/lib/api'
import { getTripQueue } from './captain-queue'

jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }))

const get = api.get as jest.Mock
const ARRIVED = 1_790_000_000_000

const base = {
  pickup_lat: 33.31,
  pickup_lng: 44.36,
  dropoff_lat: 33.33,
  dropoff_lng: 44.4,
  fare_iqd: 4500,
  created_at: '2026-09-28T10:00:00Z',
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(ARRIVED)
})
afterEach(() => {
  jest.restoreAllMocks()
  get.mockReset()
})

describe('getTripQueue room deadline', () => {
  it('counts a room down from the moment the queue arrived', async () => {
    get.mockResolvedValue({
      data: {
        offers: [
          {
            ...base,
            offer_type: 'room',
            id: 'room-1',
            room_type: 'mixed',
            rider_count: 2,
            total_fare_iqd: 9000,
            expires_at: '2026-09-28T10:05:00.123456Z',
            expires_in_seconds: 192,
          },
        ],
      },
    })
    const [room] = await getTripQueue()
    expect(room).toMatchObject({
      offerType: 'room',
      riderCount: 2,
      totalFareIqd: 9000,
      expiresAt: '2026-09-28T10:05:00.123456Z',
      expiresInSeconds: 192,
      deadlineMs: ARRIVED + 192_000,
    })
  })

  it('falls back to expires_at without the seconds', async () => {
    get.mockResolvedValue({
      data: { offers: [{ ...base, offer_type: 'room', id: 'room-1', expires_at: '2026-09-28T10:05:00Z' }] },
    })
    const [room] = await getTripQueue()
    expect(room.deadlineMs).toBe(Date.parse('2026-09-28T10:05:00Z'))
  })

  it('has no deadline on a trip offer or from an older backend', async () => {
    get.mockResolvedValue({
      data: {
        offers: [
          { ...base, offer_type: 'trip', trip_type: 'regular', id: 'trip-1', expires_in_seconds: 60 },
          { ...base, offer_type: 'room', id: 'room-2', rider_count: 2 },
        ],
      },
    })
    const [trip, room] = await getTripQueue()
    expect([trip.expiresAt, trip.expiresInSeconds, trip.deadlineMs]).toEqual([undefined, undefined, undefined])
    expect([room.expiresAt, room.expiresInSeconds, room.deadlineMs]).toEqual([undefined, undefined, undefined])
  })
})
