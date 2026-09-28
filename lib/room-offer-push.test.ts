import { LOCAL_PUSH_FLAG, pushNotificationType, roomOfferFromPush } from './room-offer-push'

const roomPush = { notification_type: 'new_trip_in_queue', room_id: 'room-1', trip_id: 'trip-1' }

describe('roomOfferFromPush', () => {
  it('reads FCM data, where every value is a string', () => {
    expect(roomOfferFromPush({ ...roomPush, rider_count: '3', total_fare_iqd: '10500' })).toEqual({
      riderCount: 3,
      totalFareIqd: 10500,
    })
  })

  it('reads APNs data, where numbers stay numbers', () => {
    expect(roomOfferFromPush({ ...roomPush, rider_count: 3, total_fare_iqd: 10500 })).toEqual({
      riderCount: 3,
      totalFareIqd: 10500,
    })
  })

  it('keeps whichever field is there', () => {
    expect(roomOfferFromPush({ ...roomPush, rider_count: '2' })).toEqual({ riderCount: 2, totalFareIqd: undefined })
    expect(roomOfferFromPush({ ...roomPush, rider_count: '', total_fare_iqd: '7500' })).toEqual({
      riderCount: undefined,
      totalFareIqd: 7500,
    })
  })

  it('accepts the legacy `type` key', () => {
    expect(roomOfferFromPush({ type: 'new_trip_in_queue', room_id: 'room-1', rider_count: '4' })?.riderCount).toBe(4)
  })

  it('ignores a push without the room fields (an older backend)', () => {
    expect(roomOfferFromPush(roomPush)).toBeNull()
    expect(roomOfferFromPush({ ...roomPush, rider_count: 'abc', total_fare_iqd: '' })).toBeNull()
  })

  it('ignores a plain trip offer, other push kinds and non-objects', () => {
    expect(roomOfferFromPush({ notification_type: 'new_trip_in_queue', trip_id: 't', rider_count: '3' })).toBeNull()
    expect(roomOfferFromPush({ ...roomPush, notification_type: 'trip_cancelled', rider_count: '3' })).toBeNull()
    expect(roomOfferFromPush(null)).toBeNull()
    expect(roomOfferFromPush('new_trip_in_queue')).toBeNull()
  })

  it('ignores the copy the app re-presented itself (no loop)', () => {
    expect(roomOfferFromPush({ ...roomPush, rider_count: '3', [LOCAL_PUSH_FLAG]: true })).toBeNull()
  })
})

describe('pushNotificationType', () => {
  it('prefers notification_type and falls back to type', () => {
    expect(pushNotificationType({ notification_type: 'chat_message', type: 'x' })).toBe('chat_message')
    expect(pushNotificationType({ type: 'room_expired' })).toBe('room_expired')
    expect(pushNotificationType({ notification_type: 3 })).toBeNull()
    expect(pushNotificationType(undefined)).toBeNull()
  })
})
