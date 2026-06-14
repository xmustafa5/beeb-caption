// lib/captain-mappers.ts
// Pure conversion helpers between the backend Captain JSON (snake_case, gender m/f)
// and the app's Captain shape (camelCase, gender male/female). No network here.

import { toAsciiDigits } from '@/lib/digits'

export type CaptainStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type CaptainGender = 'male' | 'female'

export interface Captain {
  id: string
  phone: string
  name: string
  nameAr: string
  gender: CaptainGender
  carMake: string
  carModel: string
  carColor?: string | null
  carPlate: string
  cityId: string
  nationalId?: string | null
  status: CaptainStatus
  rejectionReason?: string | null
  rejectionComment?: string | null
  blockedReason?: string | null
  avgRating: number
  tripCount: number
}

export interface BackendCaptain {
  id: string
  phone: string
  name: string
  name_ar: string
  gender: string
  car_make: string
  car_model: string
  car_color?: string | null
  car_plate: string
  city_id: string
  national_id?: string | null
  status: string
  rejection_reason?: string | null
  rejection_comment?: string | null
  blocked_reason?: string | null
  avg_rating: number
  trip_count: number
}

export function toCaptainGender(g: string): CaptainGender {
  return g === 'f' ? 'female' : 'male'
}

export function toBackendGender(g: CaptainGender): 'm' | 'f' {
  return g === 'female' ? 'f' : 'm'
}

export function toCaptain(b: BackendCaptain): Captain {
  return {
    id: b.id,
    phone: b.phone,
    name: b.name,
    nameAr: b.name_ar,
    gender: toCaptainGender(b.gender),
    carMake: b.car_make,
    carModel: b.car_model,
    carColor: b.car_color ?? null,
    carPlate: b.car_plate,
    cityId: b.city_id,
    nationalId: b.national_id ?? null,
    status: (b.status as CaptainStatus) ?? 'pending',
    rejectionReason: b.rejection_reason ?? null,
    rejectionComment: b.rejection_comment ?? null,
    blockedReason: b.blocked_reason ?? null,
    avgRating: b.avg_rating ?? 0,
    tripCount: b.trip_count ?? 0,
  }
}

// The phone input stores the local Iraqi format `07XXXXXXXXX`; the backend wants
// international digits `9647XXXXXXXXX`. Identical to the rider normalizer.
export function normalizePhone(local: string): string {
  // Defensively normalize Arabic-Indic/Persian digits at the boundary so any
  // caller's raw input survives the \D strip (callers already pass ASCII today).
  const digits = toAsciiDigits(local).replace(/\D/g, '')
  if (digits.startsWith('964')) return digits
  return `964${digits.replace(/^0+/, '')}`
}
