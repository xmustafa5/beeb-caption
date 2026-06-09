import axios, { AxiosError } from 'axios'
import { useAuthStore } from '@/store/auth-store'

// Beeb backend. EXPO_PUBLIC_* vars are inlined at build time; the fallback keeps
// the app working if .env is missing (the staging host is public, not a secret).
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://beeb.madebyhaithem.com'

// WebSocket origin (rt:trip / rt:room channels). https→wss, http→ws.
export const WS_BASE_URL = API_BASE_URL.replace(/^http/i, 'ws')

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the rider JWT to every request. An explicit per-call Authorization
// header wins (used during OTP verify, before the token lands in the store).
api.interceptors.request.use((config) => {
  if (!config.headers.Authorization) {
    const token = useAuthStore.getState().token
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// There is no refresh-token flow: a 401 on an authenticated request means the
// JWT expired or was revoked → clear the session so the AuthGate routes to login.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status
    const hadAuth = !!error.config?.headers?.Authorization
    if (status === 401 && hadAuth) {
      useAuthStore.getState().clear()
    }
    return Promise.reject(error)
  },
)

// Dev-only network logger: prints every Beeb API call to the Metro terminal
// (method, URL, status, and a trimmed body). Never runs in production. Sensitive
// fields are redacted so tokens / raw card numbers don't land in logs.
if (__DEV__) {
  const REDACT = new Set(['token', 'card_number', 'gateway_token', 'password', 'code'])
  const trim = (data: unknown): unknown => {
    if (!data || typeof data !== 'object') return data
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = REDACT.has(k) ? '«redacted»' : v
    }
    return out
  }
  const short = (url?: string) => (url ?? '').replace(API_BASE_URL, '')

  api.interceptors.request.use((config) => {
    const body = config.data
      ? (() => {
          try {
            return trim(typeof config.data === 'string' ? JSON.parse(config.data) : config.data)
          } catch {
            return '[body]'
          }
        })()
      : ''
    console.log(`→ ${config.method?.toUpperCase()} ${short(config.url)}`, body)
    return config
  })

  api.interceptors.response.use(
    (res) => {
      console.log(`← ${res.status} ${short(res.config.url)}`, trim(res.data))
      return res
    },
    (error: AxiosError) => {
      const cfg = error.config
      if (error.response) {
        console.log(`← ${error.response.status} ${short(cfg?.url)}`, trim(error.response.data))
      } else {
        console.log(`✕ network ${cfg?.method?.toUpperCase()} ${short(cfg?.url)}`, error.message)
      }
      return Promise.reject(error)
    },
  )
}

export interface ApiErrorInfo {
  /** HTTP status, or undefined for a network/timeout error (no response). */
  status?: number
  /** True when the request never reached the server (offline / timeout). */
  isNetwork: boolean
  /**
   * The backend's human message from its `{ "error": "..." }` envelope, if any.
   * NOTE: auth 401s come back with an EMPTY body — there is no message there,
   * so callers must branch on `status`, not on this field.
   */
  backendMessage?: string
}

export function parseApiError(error: unknown): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return { status: undefined, isNetwork: true }
    }
    const body = error.response.data as { error?: string } | undefined
    return {
      status: error.response.status,
      isNetwork: false,
      backendMessage: typeof body?.error === 'string' ? body.error : undefined,
    }
  }
  return { status: undefined, isNetwork: false }
}

/**
 * Maps an error to a translatable i18n key. Network → networkError,
 * 429 → rateLimited, otherwise the provided fallback key.
 */
export function apiErrorKey(error: unknown, fallback = 'common.error'): string {
  const info = parseApiError(error)
  if (info.isNetwork) return 'common.networkError'
  if (info.status === 429) return 'common.rateLimited'
  return fallback
}
