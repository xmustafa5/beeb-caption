// The languages the app ships and the rules that follow from each. Kept free of
// side effects (no i18next init, no AsyncStorage) so services and tests can import it.

/** 'ckb' is Central Kurdish (Sorani) — the Kurdish written and spoken in Iraq. */
export type AppLanguage = 'en' | 'ar' | 'ckb'

/** Picker order; each label is written in its own language. */
export const LANGUAGES: readonly { code: AppLanguage; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'ckb', label: 'کوردی' },
]

export function isAppLanguage(value: unknown): value is AppLanguage {
  return LANGUAGES.some((l) => l.code === value)
}

export function languageName(lang: string): string {
  return LANGUAGES.find((l) => l.code === lang)?.label ?? 'English'
}

/** Arabic and Kurdish are both written right-to-left in Arabic script. */
export function isRtlLanguage(lang: string): boolean {
  return lang === 'ar' || lang === 'ckb'
}

/**
 * Which name to show from data that only carries English and Arabic (backend
 * POIs, zones, the vehicle catalog, curated places, Nominatim). Kurdish readers
 * get the Arabic one: same script and direction, and it is the name on Baghdad's
 * street signs.
 */
export function contentLanguage(lang: string): 'en' | 'ar' {
  return lang === 'en' ? 'en' : 'ar'
}

// An engine without 'ckb' locale data doesn't throw — it silently formats in
// the device locale (usually English). Check once; fall back to Arabic.
const hasKurdishDates = (() => {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(['ckb']).length > 0
  } catch {
    return false
  }
})()

/**
 * Locale for Date#toLocale*String. English stays `undefined` (the device's own
 * formatting, as before); Kurdish gets Sorani month names where supported.
 */
export function dateLocale(lang: string): string | undefined {
  if (lang === 'ckb') return hasKurdishDates ? 'ckb' : 'ar'
  return lang === 'ar' ? 'ar' : undefined
}
