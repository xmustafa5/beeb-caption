// lib/captain-mappers.ts
// Pure conversion helpers between the backend Captain JSON (snake_case, gender m/f)
// and the app's Captain shape (camelCase, gender male/female). No network here.

import { toAsciiDigits } from '@/lib/digits'

export type CaptainStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type CaptainGender = 'male' | 'female'
/**
 * Car star grade (1|2|3). 3 = nicest, and it also sets the rider's per-km price.
 *
 * It is AUTOMATIC now, not admin-entered: the backend grades the captain from
 * the vehicle-catalog entry (market value, rear comfort, airbags, recency,
 * premium marque) plus the model year, behind a hard age cap (star 3 needs a car
 * <= 5 model years old, star 2 <= 10). A car with no `car_year` clears no age
 * gate and lands at star 1; a car that never resolved to a catalog entry is
 * capped at star 2 however new it is.
 *
 * An admin can still override the grade (`PUT /api/captains/{id}/star`), and
 * doing so PINS it — later automatic re-grades skip that captain. Defaults to 1.
 */
export type CarStar = 1 | 2 | 3
/**
 * Abriyah (shared-ride) access state. Only 'approved' grants shared rides;
 * everything else means taxi orders only. The server now writes just 'none' and
 * 'approved' -- an admin picks the scope when approving the captain. The legacy
 * 'requested' / 'rejected' values are kept in the union because a store
 * rehydrated from an older build can still hold one.
 */
export type AbriyahStatus = 'none' | 'requested' | 'approved' | 'rejected'

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
  /** Model year of the car, or null for a captain who registered before it was collected. */
  carYear: number | null
  cityId: string
  nationalId?: string | null
  status: CaptainStatus
  rejectionReason?: string | null
  rejectionComment?: string | null
  blockedReason?: string | null
  avgRating: number
  tripCount: number
  /** Car class grade (1|2|3), auto-graded from the catalog + model year. See CarStar. */
  star: CarStar
  /** Abriyah access status; gate the Abriyah UI on `=== 'approved'`. */
  abriyahStatus: AbriyahStatus
  /** Legacy rejection reason. The server clears this now; nothing renders it. */
  abriyahRejectionReason?: string | null
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
  car_year?: number | null
  city_id: string
  national_id?: string | null
  status: string
  rejection_reason?: string | null
  rejection_comment?: string | null
  blocked_reason?: string | null
  avg_rating: number
  trip_count: number
  star?: number | null
  abriyah_status?: string | null
  abriyah_rejection_reason?: string | null
}

/** Coerce the backend `star` into the 1|2|3 range (defaults to 1). */
export function toCarStar(s: number | null | undefined): CarStar {
  return s === 2 || s === 3 ? s : 1
}

export function toAbriyahStatus(s: string | null | undefined): AbriyahStatus {
  return s === 'requested' || s === 'approved' || s === 'rejected' ? s : 'none'
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
    carYear: b.car_year ?? null,
    cityId: b.city_id,
    nationalId: b.national_id ?? null,
    status: (b.status as CaptainStatus) ?? 'pending',
    rejectionReason: b.rejection_reason ?? null,
    rejectionComment: b.rejection_comment ?? null,
    blockedReason: b.blocked_reason ?? null,
    avgRating: b.avg_rating ?? 0,
    tripCount: b.trip_count ?? 0,
    star: toCarStar(b.star),
    abriyahStatus: toAbriyahStatus(b.abriyah_status),
    abriyahRejectionReason: b.abriyah_rejection_reason ?? null,
  }
}

// The phone input stores the local Iraqi format `07XXXXXXXXX`; the backend wants
// international digits `9647XXXXXXXXX`. Identical to the rider normalizer.
export function normalizePhone(local: string): string {
  // Defensively normalize Arabic-Indic/Persian digits at the boundary so any
  // caller's raw input survives the \D strip (callers already pass ASCII today).
  let digits = toAsciiDigits(local).replace(/\D/g, '')
  // Strip an international "00" prefix (a common Iraqi habit) BEFORE the 964 check,
  // otherwise "00964…" would survive as a leading-zero local and double-prefix.
  digits = digits.replace(/^00/, '')
  if (digits.startsWith('964')) return digits
  return `964${digits.replace(/^0+/, '')}`
}
