import { api } from '@/lib/api'
import type { Gender, User } from '@/store/auth-store'

// The backend uses single-letter gender codes; the app store uses words.
type BackendGender = 'm' | 'f' | 'unset'

function toBackendGender(g: Gender): BackendGender {
  return g === 'male' ? 'm' : g === 'female' ? 'f' : 'unset'
}

function fromBackendGender(g?: string | null): Gender {
  return g === 'm' ? 'male' : g === 'f' ? 'female' : 'unset'
}

// The phone input stores the local Iraqi format `07XXXXXXXXX`; the backend wants
// international digits `9647XXXXXXXXX` (10–15 digits, leading `+` optional).
function normalizePhone(local: string): string {
  const digits = local.replace(/\D/g, '')
  if (digits.startsWith('964')) return digits
  return `964${digits.replace(/^0+/, '')}`
}

interface BackendUser {
  id: string
  phone: string
  name?: string | null
  photo_url?: string | null
  gender?: BackendGender
}

function toUser(b: BackendUser): User {
  return {
    id: b.id,
    phone: b.phone,
    name: b.name ?? '',
    gender: fromBackendGender(b.gender),
    photoUri: b.photo_url ?? null,
  }
}

export async function requestOtp(phone: string): Promise<{ ok: true }> {
  await api.post('/api/auth/otp/send', { phone: normalizePhone(phone) })
  return { ok: true }
}

export async function verifyOtp(
  phone: string,
  code: string,
): Promise<{ token: string; user: User; isNewUser: boolean }> {
  const { data } = await api.post<{ token: string; user_id: string }>(
    '/api/auth/otp/verify',
    { phone: normalizePhone(phone), code },
  )
  // Hydrate the profile. The token isn't in the store yet, so pass it explicitly
  // (the request interceptor only fills Authorization when it's absent).
  const me = await api.get<BackendUser>('/api/riders/me', {
    headers: { Authorization: `Bearer ${data.token}` },
  })
  const user = toUser({ ...me.data, id: me.data.id ?? data.user_id })
  // A first-time account has no name yet → send them through profile setup.
  return { token: data.token, user, isNewUser: !user.name }
}

export async function getMe(): Promise<User> {
  const { data } = await api.get<BackendUser>('/api/riders/me')
  return toUser(data)
}

export async function updateProfile(
  patch: Partial<Pick<User, 'name' | 'gender' | 'photoUri'>>,
): Promise<User> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.gender !== undefined) body.gender = toBackendGender(patch.gender)
  if (patch.photoUri !== undefined) body.photo_url = patch.photoUri
  const { data } = await api.patch<BackendUser>('/api/riders/me', body)
  return toUser(data)
}

/**
 * Upload a rider avatar via the backend's presigned-PUT flow, then persist the
 * object key and re-fetch the profile (whose `photo_url` comes back as a
 * short-lived presigned GET URL — not the object key).
 *
 *   1. POST /api/riders/me/photo/upload-url → { upload_url, object_key }
 *   2. PUT the image bytes directly to upload_url (no auth header — presigned)
 *   3. PATCH /api/riders/me { photo_url: object_key }
 *   4. GET /api/riders/me → displayable presigned photo_url
 */
export async function uploadRiderPhoto(localUri: string): Promise<User> {
  // 1. Ask for a presigned slot.
  const { data: slot } = await api.post<{
    upload_url: string
    object_key: string
    expires_in: number
  }>('/api/riders/me/photo/upload-url')

  // 2. Stream the file bytes straight to storage. Use fetch (not the api client)
  //    so no Authorization header is attached to the presigned URL.
  const file = await fetch(localUri)
  const blob = await file.blob()
  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!put.ok) throw new Error(`photo upload failed: ${put.status}`)

  // 3. Point the profile at the uploaded object, then 4. read back the
  //    presigned display URL.
  await api.patch('/api/riders/me', { photo_url: slot.object_key })
  return getMe()
}

export type { Gender, User }
