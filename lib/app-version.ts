/**
 * Forced update: the backend's `GET /api/app/min-versions` names the lowest
 * installed version each app may run on each platform. Below it, the app shows a
 * blocking "update to continue" screen (components/update-gate.tsx).
 */

export const APP_KEY = 'captain' as const

export const STORE_URLS = {
  ios: 'https://apps.apple.com/app/id6791985509',
  android: 'https://play.google.com/store/apps/details?id=com.beep.captain',
} as const

export type StorePlatform = keyof typeof STORE_URLS

export interface PlatformMinVersions {
  ios: string
  android: string
}

export interface AppMinVersions {
  rider: PlatformMinVersions
  captain: PlatformMinVersions
}

/** `MAJOR.MINOR.PATCH` as numbers, or null when the text isn't one. */
function parseVersion(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** -1 / 0 / 1 like a sort comparator, or null when either side isn't a version. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/**
 * True only when the installed version is known, valid and strictly lower than
 * this app's minimum on this platform. Anything unknown lets the user in: a bad
 * value or a missing field must never lock the app.
 */
export function mustUpdate(
  installed: string | null | undefined,
  minimums: AppMinVersions | undefined,
  platform: string,
): boolean {
  if (!installed || !minimums) return false
  if (platform !== 'ios' && platform !== 'android') return false
  const min = minimums[APP_KEY]?.[platform]
  if (typeof min !== 'string') return false
  return compareVersions(installed, min) === -1
}
