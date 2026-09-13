// services/vehicle-catalog.ts
import { api } from '@/lib/api'

/**
 * Public vehicle catalog (brands + models). All three endpoints are PUBLIC —
 * no auth header is required, which matters because the captain hits them
 * DURING registration, before any token exists.
 *
 * The catalog ids the captain picks feed the backend's automatic car-star
 * classifier (catalog entry + model year → 1|2|3). A car that never resolves to
 * a catalog row is capped at star 2, and a missing model year guarantees star 1,
 * so the picker + the year field are the two highest-value things this app can
 * collect.
 */

export interface VehicleBrand {
  id: string
  nameEn: string
  nameAr: string
  isPremium: boolean
}

export interface VehicleModel {
  id: string
  brandId: string
  nameEn: string
  nameAr: string
}

export interface VehicleSearchHit extends VehicleModel {
  brandNameEn: string
  brandNameAr: string
}

interface BackendBrand {
  id: string
  name_en: string
  name_ar: string
  is_premium?: boolean | null
}

interface BackendModel {
  id: string
  brand_id: string
  name_en: string
  name_ar: string
}

interface BackendSearchHit extends BackendModel {
  brand_name_en: string
  brand_name_ar: string
}

function toBrand(b: BackendBrand): VehicleBrand {
  return {
    id: b.id,
    nameEn: b.name_en ?? '',
    nameAr: b.name_ar ?? '',
    isPremium: !!b.is_premium,
  }
}

function toModel(m: BackendModel): VehicleModel {
  return {
    id: m.id,
    brandId: m.brand_id,
    nameEn: m.name_en ?? '',
    nameAr: m.name_ar ?? '',
  }
}

/**
 * Every brand in the catalog (141 live today).
 *
 * NOTE the server's ordering is currently INVERTED — see `BACKEND_ISSUES.md` #11.
 * Callers must not treat index 0 as "most common". The car picker pins a known
 * popular set on top instead of trusting (or blindly reversing) this order.
 */
export async function getBrands(): Promise<VehicleBrand[]> {
  const { data } = await api.get<BackendBrand[]>('/api/vehicle-catalog/brands')
  return (data ?? []).map(toBrand)
}

/**
 * Models for one brand, sorted by name_en ASC server-side.
 *
 * An UNKNOWN but well-formed uuid returns `200 []` (not a 404), so an empty
 * array is a VALID answer and must render as an empty state, never an error.
 * A MALFORMED id is a 400 — only ever pass an id that came from the catalog.
 */
export async function getModels(brandId: string): Promise<VehicleModel[]> {
  const { data } = await api.get<BackendModel[]>(`/api/vehicle-catalog/brands/${brandId}/models`)
  return (data ?? []).map(toModel)
}

/**
 * Bilingual model search (max 25 hits, best match first). 'corol', 'Corolla',
 * 'كورولا' and 'تويوتا' all work.
 *
 * Short-circuits below 2 characters WITHOUT a request: the backend 400s on a
 * missing `q` and answers `200 []` for a 1-char one, so firing it is either an
 * error or a wasted roundtrip.
 */
export async function searchVehicles(q: string): Promise<VehicleSearchHit[]> {
  const term = q.trim()
  if (term.length < 2) return []
  const { data } = await api.get<BackendSearchHit[]>('/api/vehicle-catalog/search', {
    params: { q: term },
  })
  return (data ?? []).map((h) => ({
    ...toModel(h),
    brandNameEn: h.brand_name_en ?? '',
    brandNameAr: h.brand_name_ar ?? '',
  }))
}

type Lang = 'en' | 'ar' | string

/** Pick the localized name, falling back to the other language when one is blank. */
function localized(nameEn: string, nameAr: string, lang: Lang): string {
  const ar = (nameAr ?? '').trim()
  const en = (nameEn ?? '').trim()
  return lang === 'ar' ? ar || en : en || ar
}

export function brandName(b: Pick<VehicleBrand, 'nameEn' | 'nameAr'>, lang: Lang): string {
  return localized(b.nameEn, b.nameAr, lang)
}

export function modelName(m: Pick<VehicleModel, 'nameEn' | 'nameAr'>, lang: Lang): string {
  return localized(m.nameEn, m.nameAr, lang)
}

/** Brand label of a search hit (the hit carries its brand's names inline). */
export function hitBrandName(h: Pick<VehicleSearchHit, 'brandNameEn' | 'brandNameAr'>, lang: Lang): string {
  return localized(h.brandNameEn, h.brandNameAr, lang)
}
