// services/captain-auth.ts
import { api, parseApiError } from '@/lib/api'
import {
  toCaptain,
  toBackendGender,
  normalizePhone,
  type BackendCaptain,
  type Captain,
  type CaptainGender,
} from '@/lib/captain-mappers'

export type LoginResult =
  | { kind: 'authed'; token: string; captain: Captain }
  | { kind: 'forbidden' } // 403 — registered but not approved / blocked (no token issued)
  | { kind: 'unregistered' } // 404 — no captain for this phone

export interface RegisterCaptainInput {
  phone: string // local 07… or already-normalized; normalized here
  password: string
  ticket: string // register-purpose ticket from verifyOtp()
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

interface AuthTokenResponse {
  token: string
  user_id: string
}

/** Send the OTP code to the phone (shared rider/captain endpoint). */
export async function sendOtp(phone: string): Promise<{ ok: true }> {
  await api.post('/api/auth/otp/send', { phone: normalizePhone(phone) })
  return { ok: true }
}

/**
 * Verify the 6-digit code and exchange it for a single-use UUID ticket. Captains
 * only ever register (there's no captain self-service password reset), so the
 * purpose is fixed to "register". 401 = wrong/expired code; 400 = bad purpose/phone.
 */
export async function verifyOtp(phone: string, code: string): Promise<{ ticket: string }> {
  const { data } = await api.post<{ ticket: string; purpose: string }>(
    '/api/auth/otp/verify',
    { phone: normalizePhone(phone), code, purpose: 'register' },
  )
  return { ticket: data.ticket }
}

/**
 * Captain login with phone + password. Branches on backend status:
 *   200 → token + hydrated captain (route on captain.status: approved → tabs, else status screen)
 *   403 → registered but NOT approved (or blocked) — no token issued
 *   404 → no captain for this phone (route to registration)
 * 401 (bad creds) and 429 (locked) are thrown for the caller to surface.
 */
export async function loginCaptain(phone: string, password: string): Promise<LoginResult> {
  try {
    const { data } = await api.post<AuthTokenResponse>('/api/auth/captain/login', {
      phone: normalizePhone(phone),
      password,
    })
    const captain = await getCaptain(data.user_id, data.token)
    return { kind: 'authed', token: data.token, captain }
  } catch (err) {
    const info = parseApiError(err)
    if (info.status === 403) return { kind: 'forbidden' }
    if (info.status === 404) return { kind: 'unregistered' }
    throw err // 401 bad creds, 429 locked, network — caller handles
  }
}

/**
 * Read a captain by id. Pass an explicit token during the login round-trip
 * (the request interceptor only fills Authorization when it's absent).
 * Ownership is enforced server-side: a captain token may read only its own id.
 */
export async function getCaptain(id: string, token?: string): Promise<Captain> {
  const { data } = await api.get<BackendCaptain>(`/api/captains/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return toCaptain(data)
}

/**
 * Self-register a captain (public; authorized by a register-purpose ticket).
 * Returns the pending Captain AND a captain JWT: the 201 body is
 * `CaptainRegisteredResponse` (Captain + required `token`). The token is
 * onboarding-scoped — it authorizes the document-upload + self-read endpoints
 * while pending, so the captain can upload the 5 docs and an admin can then
 * approve. Operational endpoints stay 403 until approved.
 *
 * 409 → phone or plate already registered; 401 → bad/expired ticket;
 * 400 → invalid gender/phone; 404 → referenced city doesn't exist.
 */
export async function registerCaptain(
  input: RegisterCaptainInput,
): Promise<{ captain: Captain; token: string }> {
  const body = {
    phone: normalizePhone(input.phone),
    password: input.password,
    ticket: input.ticket,
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
  const { data } = await api.post<BackendCaptain & { token: string }>(
    '/api/captains/register',
    body,
  )
  return { captain: toCaptain(data), token: data.token }
}
