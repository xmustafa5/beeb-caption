// Place and car names are stored in Arabic spelling, but Kurdish and Persian
// keyboards type their own code points for the same letters (ک for ك, ی for ي,
// ە where Arabic has ة/ه), add Kurdish-only vowel letters, and have no
// hamza-on-alef keys. These two folds let a name typed on any of them match.

/**
 * Maps only letters that never occur in Arabic text onto their Arabic
 * counterparts, leaving Arabic input untouched — so it is safe on a query the
 * server matches literally (the vehicle catalog search).
 */
export function toArabicLetters(s: string): string {
  return s
    .replace(/ک/g, 'ك')
    .replace(/[یێ]/g, 'ي')
    .replace(/ھ/g, 'ه')
    .replace(/ۆ/g, 'و')
    .replace(/ڵ/g, 'ل')
    .replace(/ڕ/g, 'ر')
}

/**
 * Folds BOTH sides of a client-side comparison onto one skeleton: the
 * Kurdish-keyboard letters above plus Arabic spelling variants (أ/ا, ة/ه/ە,
 * ى/ي) and tashkeel.
 */
export function foldForSearch(s: string): string {
  return toArabicLetters(s.toLowerCase())
    .replace(/[ً-ٰٟ]/g, '') // tashkeel, incl. the hamza marks NFD splits off أ إ ئ ؤ
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/[ةە]/g, 'ه')
    .trim()
}
