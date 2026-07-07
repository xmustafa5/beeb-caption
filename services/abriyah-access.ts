// services/abriyah-access.ts
// Captain-side Abriyah (shared-ride) access: a one-button request + a refresh of
// the captain's own record to observe the admin's approve/reject decision.
import { api } from '@/lib/api'
import { toCaptain, type BackendCaptain, type Captain } from '@/lib/captain-mappers'

/**
 * Request Abriyah access (one button, no body) → the updated Captain with
 * `abriyahStatus: "requested"`. Idempotent if already requested/approved. The
 * captain must already be an approved captain, else the server returns 403.
 */
export async function requestAbriyahAccess(): Promise<Captain> {
  const { data } = await api.post<BackendCaptain>('/api/captain/abriyah/request', {})
  return toCaptain(data)
}

/**
 * Re-read the captain's own record (own id only; server enforces ownership) so
 * the app can observe an out-of-band Abriyah approve/reject (or a star re-grade).
 */
export async function refreshCaptain(id: string): Promise<Captain> {
  const { data } = await api.get<BackendCaptain>(`/api/captains/${id}`)
  return toCaptain(data)
}
