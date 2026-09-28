// lib/to-number.ts

/**
 * A finite number from a wire value that may come as a number (JSON, APNs
 * data) or as a string (FCM data values are always strings). Anything else,
 * an empty string included, is undefined rather than 0.
 */
export function toFiniteNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}
