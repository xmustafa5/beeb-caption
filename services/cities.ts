// services/cities.ts
import { api } from '@/lib/api'

export interface City {
  id: string
}

interface BackendZone {
  city_id: string
}

/**
 * The backend exposes no public cities list; derive the distinct cities from the
 * public zones endpoint (each zone carries a city_id). Today there is one Baghdad
 * city. Returns distinct city ids in first-seen order.
 */
export async function getCities(): Promise<City[]> {
  const { data } = await api.get<BackendZone[]>('/api/zones')
  const seen = new Set<string>()
  const out: City[] = []
  for (const z of data ?? []) {
    if (z.city_id && !seen.has(z.city_id)) {
      seen.add(z.city_id)
      out.push({ id: z.city_id })
    }
  }
  return out
}
