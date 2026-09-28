import 'intl-pluralrules'
import { createInstance } from 'i18next'
import en from '@/i18n/en.json'
import ar from '@/i18n/ar.json'
import ckb from '@/i18n/ckb.json'
import { LOCAL_PUSH_FLAG, pushNotificationType, roomOfferContent, roomOfferFromPush } from './room-offer-push'

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

describe('roomOfferContent (the foreground copy)', () => {
  const i18n = createInstance()
  beforeAll(async () => {
    await i18n.init({
      resources: { en: { translation: en }, ar: { translation: ar }, ckb: { translation: ckb } },
      lng: 'ar',
      fallbackLng: { ckb: ['ar', 'en'], default: ['en'] },
      interpolation: { escapeValue: false },
      showSupportNotice: false,
    })
  })
  const contentIn = (lang: string, offer: Parameters<typeof roomOfferContent>[0]) =>
    roomOfferContent(offer, i18n.getFixedT(lang), lang)

  it('is written in the language on screen, with Western digits', () => {
    expect(contentIn('en', { riderCount: 3, totalFareIqd: 10500 })).toEqual({
      title: en.captain.queue.roomOfferTitle,
      body: '3 riders · 10,500 IQD',
    })
    expect(contentIn('ar', { riderCount: 3, totalFareIqd: 10500 })).toEqual({
      title: ar.captain.queue.roomOfferTitle,
      body: '3 ركاب · 10,500 د.ع',
    })
    expect(contentIn('ckb', { riderCount: 3, totalFareIqd: 10500 })).toEqual({
      title: ckb.captain.queue.roomOfferTitle,
      body: '3 سەرنشین · 10,500 د.ع',
    })
  })

  it('leaves out a missing field', () => {
    expect(contentIn('en', { riderCount: 2 }).body).toBe('2 riders')
    expect(contentIn('ar', { totalFareIqd: 7500 }).body).toBe('7,500 د.ع')
  })

  it('never carries Arabic-only letters in Kurdish', () => {
    const { title, body } = contentIn('ckb', { riderCount: 4, totalFareIqd: 12000 })
    expect(`${title} ${body}`).not.toMatch(/[يكةى]/)
  })
})
