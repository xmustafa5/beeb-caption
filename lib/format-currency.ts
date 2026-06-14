export function formatIqd(amount: number, locale: 'en' | 'ar' = 'en'): string {
  // Locale-aware: ar-IQ gives Arabic-Indic grouping under forceRTL, en-US gives Western.
  const bcp = locale === 'ar' ? 'ar-IQ' : 'en-US'
  const formatted = new Intl.NumberFormat(bcp, { maximumFractionDigits: 0 }).format(amount)
  const suffix = locale === 'ar' ? 'د.ع' : 'IQD'
  return `${formatted} ${suffix}`
}

// Shim kept so the original export contract (formatIqd + formatIqdAr) still holds for any unseen caller.
export function formatIqdAr(amount: number): string {
  return formatIqd(amount, 'ar')
}
