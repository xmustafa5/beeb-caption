import { isAxiosError } from 'axios'
import { api } from '@/lib/api'
import type { AppLanguage } from '@/i18n/languages'

// Register/clear the caller's FCM device token with the backend, and tell it the
// app language, so it can push trip offers, lifecycle alerts and offline chat
// messages (notification_type: "chat_message") when the WS isn't live.
//
// Contract: POST /api/me/fcm-token { fcm_token: string | null, language?: 'ar' | 'ckb' | 'en' } → 204.
// - fcm_token: the token to register; null on logout stops pushes to this device.
// - language: the app language. The backend writes every push to this captain in
//   it (unknown → Arabic); user-typed text such as a chat message stays as typed.
//   Omitted → the stored language is kept. Anything else → 400 {"error":"invalid_language"}.
//   A backend from before push localization ignores the field.
// Any valid rider/captain JWT authorizes it (the interceptor attaches the bearer).

const PATH = '/api/me/fcm-token'

/** The backend's error code for a `language` it does not accept. */
export const INVALID_LANGUAGE_CODE = 'invalid_language'

function isInvalidLanguageError(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 400) return false
  const data = error.response.data as { error?: unknown } | undefined
  return !!data && typeof data === 'object' && data.error === INVALID_LANGUAGE_CODE
}

/**
 * Register the device's FCM token, with the app language when given. Sending it
 * again with a new language is how a language switch reaches the backend.
 * Best-effort — never throws to the caller.
 */
export async function registerFcmToken(token: string, language?: AppLanguage): Promise<boolean> {
  try {
    await api.post(PATH, language ? { fcm_token: token, language } : { fcm_token: token })
    return true
  } catch (error) {
    // A language the backend refuses must not cost the device its pushes:
    // register the token alone (the stored language is kept).
    if (language && isInvalidLanguageError(error)) return registerFcmToken(token)
    // Push is a nice-to-have on top of the live WS; a failed registration must
    // never block login or crash the app.
    return false
  }
}

/**
 * Clear the device's FCM token (on logout), so a signed-out phone stops getting
 * this captain's pushes. By the time the session is gone from the store the
 * interceptor has no bearer to attach, so the ended session's JWT is sent
 * explicitly. Best-effort.
 */
export async function clearFcmToken(endedSession: string): Promise<void> {
  try {
    await api.post(PATH, { fcm_token: null }, { headers: { Authorization: `Bearer ${endedSession}` } })
  } catch {
    /* best-effort */
  }
}
