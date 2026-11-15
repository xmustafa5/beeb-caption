import { parseApiError } from '@/lib/api'

/**
 * i18n key for a failed `POST /api/auth/otp/send`.
 *
 * The backend answers its send limits (one per 30 s, hourly/daily caps) with a
 * 400 `rate limited: too many OTP requests`, not a 429, and a bad number with a
 * 400 `invalid phone number`.
 */
export function otpSendErrorKey(error: unknown): string {
  const info = parseApiError(error)
  if (info.isNetwork) return 'common.networkError'
  const msg = info.backendMessage ?? ''
  if (info.status === 429 || msg.includes('rate limited')) return 'auth.otpRateLimited'
  if (info.status === 400 && msg.includes('invalid phone')) return 'auth.phoneInvalid'
  return 'auth.otpSendFailed'
}

/**
 * i18n key for a failed `POST /api/auth/otp/verify`.
 *
 * - 400 `too many OTP attempts`: the code took its 5 tries and is dead; only a new code helps.
 * - 401: wrong or expired code.
 * - 503 `otp_check_unavailable`: the server could not check the code; the try was not counted.
 */
export function otpVerifyErrorKey(error: unknown): string {
  const info = parseApiError(error)
  if (info.isNetwork) return 'common.networkError'
  const msg = info.backendMessage ?? ''
  if (msg.includes('too many OTP attempts')) return 'captain.auth.otpTooManyTries'
  if (info.status === 401) return 'captain.auth.otpWrong'
  if (info.status === 503 || msg === 'otp_check_unavailable') return 'captain.auth.otpCheckUnavailable'
  if (info.status === 429) return 'common.rateLimited'
  return 'captain.auth.otpVerifyFailed'
}
