import { parseCaptainFrame } from './captain-frame'

const frame = (o: Record<string, unknown>) => JSON.stringify(o)

describe('parseCaptainFrame', () => {
  it('reads a room offer with its rider count and total', () => {
    const parsed = parseCaptainFrame(
      frame({ trip_id: 'trip-1', room_id: 'room-1', pickup_lat: 33.3, pickup_lng: 44.4, rider_count: 3, total_fare_iqd: 10500 }),
    )
    expect(parsed).toMatchObject({
      kind: 'offer',
      offer: { tripId: 'trip-1', roomId: 'room-1', riderCount: 3, totalFareIqd: 10500 },
    })
  })

  it('reads room offer numbers sent as strings', () => {
    const parsed = parseCaptainFrame(
      frame({ trip_id: 'trip-1', room_id: 'room-1', pickup_lat: 33.3, rider_count: '4', total_fare_iqd: '12000' }),
    )
    expect(parsed?.kind === 'offer' && [parsed.offer.riderCount, parsed.offer.totalFareIqd]).toEqual([4, 12000])
  })

  it('reads the room deadline off a beep.room.offered frame', () => {
    const parsed = parseCaptainFrame(
      frame({
        trip_id: 'trip-1',
        room_id: 'room-1',
        pickup_lat: 33.3,
        rider_count: 2,
        expires_at: '2026-09-28T10:05:00.123456Z',
        expires_in_seconds: 299,
      }),
    )
    expect(parsed).toMatchObject({
      kind: 'offer',
      offer: { roomId: 'room-1', expiresAt: '2026-09-28T10:05:00.123456Z', expiresInSeconds: 299 },
    })
  })

  it('leaves the deadline off a frame from an older backend', () => {
    const parsed = parseCaptainFrame(frame({ trip_id: 'trip-1', room_id: 'room-1', pickup_lat: 33.3, rider_count: 2 }))
    expect(parsed?.kind === 'offer' && [parsed.offer.expiresAt, parsed.offer.expiresInSeconds]).toEqual([
      undefined,
      undefined,
    ])
  })

  it('leaves the room fields off a regular trip offer', () => {
    const parsed = parseCaptainFrame(
      frame({ trip_id: 'trip-2', pickup_lat: 33.3, rider_count: 3, expires_at: '2026-09-28T10:05:00Z', expires_in_seconds: 60 }),
    )
    expect(parsed).toMatchObject({ kind: 'offer', offer: { tripId: 'trip-2' } })
    expect(parsed?.kind === 'offer' && [parsed.offer.roomId, parsed.offer.riderCount]).toEqual([undefined, undefined])
    expect(parsed?.kind === 'offer' && [parsed.offer.expiresAt, parsed.offer.expiresInSeconds]).toEqual([
      undefined,
      undefined,
    ])
  })

  it('reads a trip_update frame', () => {
    const parsed = parseCaptainFrame(frame({ event: 'trip_update', id: 't1', status: 'cancelled', cancelled_by: 'rider' }))
    expect(parsed).toMatchObject({ kind: 'trip', trip: { id: 't1', status: 'cancelled', cancelled_by: 'rider' } })
  })

  it('turns the legacy cancel frame (no status) into a cancelled trip', () => {
    const parsed = parseCaptainFrame(frame({ id: 't1', cancelled_by: 'rider', reason: 'changed_mind' }))
    expect(parsed).toMatchObject({ kind: 'trip', trip: { id: 't1', status: 'cancelled' } })
  })

  it('reads a location echo', () => {
    expect(parseCaptainFrame(frame({ event: 'captain_location', longitude: 44.4, latitude: 33.3, online: true }))).toEqual({
      kind: 'location',
      location: { longitude: 44.4, latitude: 33.3, lastPingAt: undefined, online: true },
    })
  })

  it('ignores non-JSON, non-string and unknown frames', () => {
    expect(parseCaptainFrame('ping')).toBeNull()
    expect(parseCaptainFrame(42)).toBeNull()
    expect(parseCaptainFrame('null')).toBeNull()
    expect(parseCaptainFrame(frame({ event: 'beep.room.joined', room_id: 'r' }))).toBeNull()
  })
})
