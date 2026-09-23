// IQD amounts, always with Western digits (0-9) — in Arabic and Kurdish too; the
// app shows every number that way. Only the currency label follows the language:
// 'IQD' in English, 'د.ع' (دينار عراقي / دیناری عێراقی) in Arabic and Kurdish.
// Callers pass the app language (i18n.language).
export function formatIqd(amount: number, lang: string = 'en'): string {
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)
  return `${formatted} ${lang === 'en' ? 'IQD' : 'د.ع'}`
}

// Shim kept so the original export contract (formatIqd + formatIqdAr) still holds for any unseen caller.
export function formatIqdAr(amount: number): string {
  return formatIqd(amount, 'ar')
}
