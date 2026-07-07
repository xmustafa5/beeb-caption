import { api } from '@/lib/api'

// Register/clear the caller's FCM device token with the backend so it can send
// offline chat pushes (notification_type: "chat_message") when the WS isn't live.
//
// Contract: POST /api/me/fcm-token { fcm_token: string | null } → 204. Send the
// token to register; send null on logout to stop pushes to this device. Any
// valid rider/captain JWT authorizes it (the interceptor attaches the bearer).

/** Register the device's FCM token. Best-effort — never throws to the caller. */
export async function registerFcmToken(token: string): Promise<boolean> {
  try {
    await api.post('/api/me/fcm-token', { fcm_token: token })
    return true
  } catch {
    // Push is a nice-to-have on top of the live WS; a failed registration must
    // never block login or crash the app.
    return false
  }
}

/** Clear the device's FCM token (call on logout). Best-effort. */
export async function clearFcmToken(): Promise<void> {
  try {
    await api.post('/api/me/fcm-token', { fcm_token: null })
  } catch {
    /* best-effort */
  }
}
