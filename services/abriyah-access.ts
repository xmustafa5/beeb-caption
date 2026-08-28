// services/abriyah-access.ts
// Captain-side Abriyah (shared-ride) access: read-only. The captain no longer
// requests it — an admin picks the service scope when approving the captain's
// registration, and can grant or revoke it afterwards. All this file does is
// re-read the captain's own record so the app observes that decision.
import { api } from '@/lib/api'
import { toCaptain, type BackendCaptain, type Captain } from '@/lib/captain-mappers'

/**
 * Re-read the captain's own record (own id only; server enforces ownership) so
 * the app picks up an out-of-band Abriyah grant/revoke (or a star re-grade).
 */
export async function refreshCaptain(id: string): Promise<Captain> {
  const { data } = await api.get<BackendCaptain>(`/api/captains/${id}`)
  return toCaptain(data)
}
