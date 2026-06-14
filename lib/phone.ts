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
