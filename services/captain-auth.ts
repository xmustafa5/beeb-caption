// services/captain-auth.ts
import { api } from '@/lib/api'
import { parseApiError } from '@/lib/api'
import {
  toCaptain,
  toBackendGender,
  normalizePhone,
  type BackendCaptain,
  type Captain,
  type CaptainGender,
} from '@/lib/captain-mappers'

export type VerifyResult =
  | { kind: 'authed'; token: string; captain: Captain }
  | { kind: 'pending' } // 403 — registered but not approved
  | { kind: 'unregistered' } // 404 — no captain for this phone

export interface RegisterCaptainInput {
  phone: string // local 07… or already-normalized; normalized here
  name: string
  nameAr: string
  gender: CaptainGender
  carMake: string
  carModel: string
  carColor?: string | null
  carPlate: string
  cityId: string
  nationalId?: string | null
}

/** Send the OTP code to the phone (same endpoint as riders). */
export async function requestOtp(phone: string): Promise<{ ok: true }> {
  await api.post('/api/auth/otp/send', { phone: normalizePhone(phone) })
  return { ok: true }
}

/**
 * Verify a captain OTP. Branches on backend status:
 *  200 → token + hydrated captain (the captain's `status` field decides routing:
 *        approved → tabs, pending → status screen)
 *  403 → registered but not approved is no longer returned as 403 for pending;
 *        403 now means rejected/blocked → treat as { kind: 'pending' } so the
 *        caller routes to the status screen (which reads captain.status).
 *  404 → no captain for this phone (route to registration)
 * 401 (wrong/expired code) and 429 are thrown for the caller to surface.
 */
export async function verifyCaptainOtp(phone: string, code: string): Promise<VerifyResult> {
  try {
    const { data } = await api.post<{ token: string; user_id: string }>(
      '/api/auth/captain/otp/verify',
      { phone: normalizePhone(phone), code },
    )
    const captain = await getCaptain(data.user_id, data.token)
    return { kind: 'authed', token: data.token, captain }
  } catch (err) {
    const info = parseApiError(err)
    if (info.status === 403) return { kind: 'pending' }
    if (info.status === 404) return { kind: 'unregistered' }
    throw err // 401 wrong code, 429, network — caller handles
  }
}

/**
 * Read a captain by id. Pass an explicit token during the verify round-trip
 * (the request interceptor only fills Authorization when it's absent).
 * Ownership is enforced server-side: a captain token may read only its own id.
 */
export async function getCaptain(id: string, token?: string): Promise<Captain> {
  const { data } = await api.get<BackendCaptain>(`/api/captains/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return toCaptain(data)
}

/** Self-register (public). Returns the pending Captain (no token in the response). */
export async function registerCaptain(input: RegisterCaptainInput): Promise<Captain> {
  const body = {
    phone: normalizePhone(input.phone),
    name: input.name,
    name_ar: input.nameAr,
    gender: toBackendGender(input.gender),
    car_make: input.carMake,
    car_model: input.carModel,
    car_plate: input.carPlate,
    city_id: input.cityId,
    ...(input.carColor ? { car_color: input.carColor } : {}),
    ...(input.nationalId ? { national_id: input.nationalId } : {}),
  }
  const { data } = await api.post<BackendCaptain>('/api/captains/register', body)
  return toCaptain(data)
}
