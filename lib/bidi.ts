// lib/bidi.ts

/** U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE. */
const LRI = '⁦'
const PDI = '⁩'

/**
 * Wrap a Western-only run (a phone number, "+2", "1 / 3") in a Unicode LTR
 * isolate so it keeps its order inside RTL text. `writingDirection: 'ltr'` does
 * the same on iOS only — Android ignores it — so keep both: the style for iOS,
 * the isolate for everyone. The marks are invisible (default-ignorable).
 */
export function ltrIsolate(s: string): string {
  return s ? `${LRI}${s}${PDI}` : s
}
