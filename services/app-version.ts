import { api } from '@/lib/api'
import type { AppMinVersions } from '@/lib/app-version'

export const minVersionsQueryKey = ['app', 'min-versions'] as const

/** Public (no auth): lowest version each app may run, per platform. */
export async function getMinVersions(): Promise<AppMinVersions> {
  const { data } = await api.get<AppMinVersions>('/api/app/min-versions')
  return data
}
