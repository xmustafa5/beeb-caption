export function formatIqd(amount: number, lang: string = 'en'): string {
  // Locale-aware: ar-IQ gives Arabic-Indic grouping under forceRTL, en-US gives Western.
  // Callers pass the app language (i18n.language). Kurdish writes amounts exactly like
  // Arabic — Arabic-Indic digits and the same 'د.ع' (دیناری عێراقی) — so it shares the
  // ar-IQ formatter rather than depending on the JS engine shipping 'ckb' number data.
  const en = lang === 'en'
  const formatted = new Intl.NumberFormat(en ? 'en-US' : 'ar-IQ', { maximumFractionDigits: 0 }).format(amount)
  return `${formatted} ${en ? 'IQD' : 'د.ع'}`
}

// Shim kept so the original export contract (formatIqd + formatIqdAr) still holds for any unseen caller.
export function formatIqdAr(amount: number): string {
  return formatIqd(amount, 'ar')
}
