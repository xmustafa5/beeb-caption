// services/captain-auth.ts
import type { Governorate } from '@/lib/governorates'
import { api, parseApiError } from '@/lib/api'
import { getCompleteness } from '@/services/captain-documents'
import {
  toCaptain,
  toBackendGender,
  normalizePhone,
  type BackendCaptain,
  type Captain,
  type CaptainGender,
} from '@/lib/captain-mappers'

export type LoginResult =
  // documentsPending: for a PENDING captain, whether any of the 5 documents is
  // still missing (null when that could not be read; the status screen retries).
  | { kind: 'authed'; token: string; captain: Captain; documentsPending: boolean | null }
  | { kind: 'forbidden' } // 403 — registered but not approved / blocked (no token issued)
  | { kind: 'unregistered' } // 404 — no captain for this phone

export interface RegisterCaptainInput {
  phone: string // local 07… or already-normalized; normalized here
  password: string
  ticket: string // register-purpose ticket from verifyOtp()
  name: string
  gender: CaptainGender
  governorate?: Governorate
  carMake: string
  carModel: string
  carColor?: string | null
  carPlate: string
  cityId: string
  nationalId?: string | null
  /**
   * Vehicle-catalog ids from the car picker. Optional, and they do NOT replace
   * carMake/carModel — those stay required strings. Omitting them leaves the car
   * unresolved, which caps the backend's automatic star grade at 2.
   */
  carBrandId?: string
  carModelId?: string
  /**
   * Model year (backend range 1970..=2100; anything else is a 400). Optional on
   * the wire but the app always collects it: with no year the classifier clears
   * no age gate and the captain is pinned at star 1.
   */
  carYear?: number
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
 * Does this phone already belong to a captain? Asked BEFORE any OTP is sent, so
 * a registered captain is told on the first screen and pointed at login instead
 * of finding out from a 409 on the last wizard step. Public and free: it sends
 * no SMS and is not rate limited. Only `captain_exists` matters here: a rider
 * account on the same number does not stop someone registering as a captain.
 */
export async function isCaptainPhoneRegistered(phone: string): Promise<boolean> {
  const { data } = await api.post<{ captain_exists: boolean }>('/api/auth/phone-status', {
    phone: normalizePhone(phone),
  })
  return data.captain_exists === true
}

/**
 * Verify the 6-digit code and exchange it for a single-use UUID ticket, good only
 * for `purpose`: "register" (the sign-up wizard) or "reset" (forgot password).
 * 401 = wrong/expired code; 400 = bad purpose/phone; 429 = too many tries.
 */
export async function verifyOtp(
  phone: string,
  code: string,
  purpose: 'register' | 'reset' = 'register',
): Promise<{ ticket: string }> {
  const { data } = await api.post<{ ticket: string; purpose: string }>(
    '/api/auth/otp/verify',
    { phone: normalizePhone(phone), code, purpose },
  )
  return { ticket: data.ticket }
}

/**
 * A freshly issued captain token as a session: the captain record, and for a
 * PENDING captain whether any of the 5 documents is still missing (null when that
 * could not be read; the status screen retries). The document check is best
 * effort: a failure there must not fail a sign-in that already succeeded.
 */
async function captainSession(token: string, captainId: string) {
  const captain = await getCaptain(captainId, token)
  let documentsPending: boolean | null = null
  if (captain.status === 'pending') {
    try {
      documentsPending = !(await getCompleteness(captain.id, token)).complete
    } catch {
      documentsPending = null
    }
  }
  return { token, captain, documentsPending }
}

/**
 * Set a new password on the CAPTAIN account for this phone, authorized by a
 * "reset" ticket, and sign in with it (every other device is signed out).
 * `account: 'captain'` matters: without it the backend picks the rider account
 * when the phone has both.
 *   401 → ticket expired/used (a new code is needed)
 *   403 → a captain login refuses (rejected/blocked); ticket NOT spent
 *   404 → no captain account for this phone; ticket NOT spent
 *   400 → password under 8 characters
 */
export async function resetCaptainPassword(
  phone: string,
  newPassword: string,
  ticket: string,
): Promise<{ token: string; captain: Captain; documentsPending: boolean | null }> {
  const { data } = await api.post<AuthTokenResponse>('/api/auth/password/reset', {
    phone: normalizePhone(phone),
    new_password: newPassword,
    ticket,
    account: 'captain',
  })
  return captainSession(data.token, data.user_id)
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
    // A pending captain who still owes documents belongs on the upload screen,
    // not on "waiting for approval": the session says which.
    return { kind: 'authed', ...(await captainSession(data.token, data.user_id)) }
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
    // The app collects a single full name. `name_ar` is optional server-side
    // (it falls back to `name`), but we still send it so a build that ships
    // ahead of the backend deploy keeps working against the older contract.
    name_ar: input.name,
    gender: toBackendGender(input.gender),
    ...(input.governorate ? { governorate: input.governorate } : {}),
    car_make: input.carMake,
    car_model: input.carModel,
    car_plate: input.carPlate,
    city_id: input.cityId,
    ...(input.carColor ? { car_color: input.carColor } : {}),
    ...(input.nationalId ? { national_id: input.nationalId } : {}),
    ...(input.carBrandId ? { car_brand_id: input.carBrandId } : {}),
    ...(input.carModelId ? { car_model_id: input.carModelId } : {}),
    ...(input.carYear ? { car_year: input.carYear } : {}),
  }
  const { data } = await api.post<BackendCaptain & { token: string }>(
    '/api/captains/register',
    body,
  )
  return { captain: toCaptain(data), token: data.token }
}

/** The signed-in captain sets their own governorate. */
export async function updateMyGovernorate(governorate: Governorate): Promise<Captain> {
  const { data } = await api.patch<BackendCaptain>('/api/captain/me', { governorate })
  return toCaptain(data)
}

/**
 * Permanently delete the signed-in captain's own account (App Store guideline
 * 5.1.1(v) requires in-app deletion). The backend archives and anonymizes:
 * phone, name, plate, national id, push token and password hash are scrubbed and
 * the captain can no longer sign in. Phone and plate are freed for a fresh
 * registration later.
 *
 * The plaintext password is re-verified SERVER-SIDE before anything is deleted —
 * a client-only check would be worthless for an irreversible action. Status map:
 *   204 → deleted; 404 → already gone (same end state — sign the captain out)
 *   401 + `{"error":"wrong_password"}` → the typed password was rejected; the
 *         session is still valid, so keep the captain signed in and show an
 *         inline error on the password field
 *   401 otherwise → the JWT is expired or revoked; sign out like anywhere else.
 *         Both cases are 401, which is why the body's code decides, not the
 *         status (see `isWrongPasswordError` in lib/api.ts)
 *   409 → a trip is accepted or in progress; finish or cancel it first. Callers
 *         MUST surface this — it is the one failure the captain can act on.
 *
 * One axios detail: DELETE only carries a body via `data`.
 */
export async function deleteAccount(password: string): Promise<void> {
  await api.delete('/api/captain/me', { data: { password } })
}
