import { Linking } from 'react-native'
import { toAsciiDigits } from '@/lib/digits'
import { ltrIsolate } from '@/lib/bidi'

/** Convert Arabic-Indic digits (٠-٩) to Western digits (0-9) */
function toWesternDigits(str: string): string {
  return str.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
}

/** Strip '+' prefix and normalize digits so phone matches backend format: 964XXXXXXXXXX */
export function formatPhone(phone: string): string {
  return toWesternDigits(phone).replace(/^\+/, '')
}

/** Build full phone from country code + local number */
export function buildPhone(countryCode: string, local: string): string {
  return formatPhone(countryCode + local)
}

/**
 * Digits only, Western — accepts `9647…`, `+9647…`, `009647…`, `07…`, `7…`
 * (10 digits) and Arabic-Indic digits.
 */
function phoneDigits(phone: string): string {
  const digits = toAsciiDigits(phone).replace(/\D/g, '')
  if (digits.startsWith('00')) return digits.slice(2)
  // A local Iraqi mobile (07XXXXXXXXX, or 7XXXXXXXXX without the trunk 0) →
  // international form. Without this a bare 7… would be dialled as +7 (Russia).
  if (/^07\d{9}$/.test(digits)) return `964${digits.slice(1)}`
  if (/^7\d{9}$/.test(digits)) return `964${digits}`
  return digits
}

/**
 * Display form of a phone number for the captain: `+964 770 123 4567` for an
 * Iraqi mobile, `+<digits>` otherwise — wrapped in an LTR isolate so the groups
 * keep their order inside an RTL screen on Android too. Also set
 * `writingDirection: 'ltr'` on the Text for iOS.
 */
export function formatPhoneDisplay(phone: string): string {
  const d = phoneDigits(phone)
  if (/^9647\d{9}$/.test(d)) return ltrIsolate(`+964 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`)
  return d ? ltrIsolate(`+${d}`) : ''
}

/**
 * `tel:` URL for a stored number. The backend stores `9647XXXXXXXXX` without a
 * '+'; a bare `tel:964…` can be dialled as a LOCAL number, so always send '+'.
 */
export function phoneTelUrl(phone: string): string {
  return `tel:+${phoneDigits(phone)}`
}

/**
 * Open the dialer on a stored number. Resolves false when the device can't
 * place calls (simulator, tablet) so the caller can say so instead of failing
 * silently.
 */
export async function openDialer(phone: string): Promise<boolean> {
  if (!phoneDigits(phone)) return false
  try {
    await Linking.openURL(phoneTelUrl(phone))
    return true
  } catch {
    return false
  }
}
