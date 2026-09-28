// lib/push-registration.ts
// Keeping the backend's copy of this device's push registration current: the
// FCM token AND the app language the backend writes every push in. Pure (the
// device and network calls are injected), so it can be unit tested without
// expo-notifications. providers/push-provider.tsx wires it up.
import { isAppLanguage, type AppLanguage } from '@/i18n/languages'

/**
 * The language to report with the token: the app language when it is one the
 * backend accepts ('ar' | 'ckb' | 'en'), else nothing, which leaves the stored
 * value as it is. Never a guess: the backend answers an unsupported value with
 * 400, and the token must not be lost over it.
 */
export function pushLanguage(lang: string | null | undefined): AppLanguage | undefined {
  return isAppLanguage(lang) ? lang : undefined
}

/**
 * The account a session JWT belongs to (its `sub`: the captain row the backend
 * writes the token to), or null when it cannot be read. Read only, never
 * verified: it only decides whether an old clear would hit the account that is
 * signed in now.
 */
export function sessionAccount(session: string): string | null {
  const payload = session.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    const sub = claims && typeof claims === 'object' ? (claims as { sub?: unknown }).sub : undefined
    return typeof sub === 'string' && sub ? sub : null
  } catch {
    return null
  }
}

/**
 * True unless the two sessions are known to be different accounts. Unreadable
 * counts as the same account: dropping a clear only risks the previous captain's
 * pushes on this phone (and the backend releases the token from every other
 * captain once the new one registers it), while clearing the signed-in captain's
 * own row would silently cost them their trip offers.
 */
function mayBeSameAccount(a: string, b: string): boolean {
  if (a === b) return true
  const accountA = sessionAccount(a)
  const accountB = sessionAccount(b)
  return accountA === null || accountB === null || accountA === accountB
}

export interface PushRegistrarDeps {
  /** False on a simulator / emulator: they get no FCM token. */
  canUsePush: () => boolean
  /** Notification permission; may show the system prompt only when `mayPrompt`. */
  ensurePermission: (mayPrompt: boolean) => Promise<boolean>
  /** The device's FCM token. Throws in a build without Firebase. */
  getDeviceToken: () => Promise<string>
  /** POST the token + language for the signed-in captain. False when it did not land. */
  register: (deviceToken: string, language: AppLanguage | undefined) => Promise<boolean>
  /**
   * Clear the token of a session that ended (logout), sent with that session's
   * JWT. True once there is nothing left to try (cleared, or refused for good,
   * e.g. the JWT has expired); false when it did not land and should be retried.
   */
  clear: (endedSession: string) => Promise<boolean>
}

/** What the backend should hold: the signed-in session (null = none) and the app language. */
export interface PushTarget {
  session: string | null
  language: string
}

export interface PushRegistrarOptions {
  /**
   * Waits before trying again after a report or clear that did not land
   * (offline, backend down), one per consecutive failure; the last one repeats.
   */
  retryDelaysMs?: readonly number[]
}

export const PUSH_RETRY_DELAYS_MS: readonly number[] = [30_000, 60_000, 120_000, 300_000]

export interface PushRegistrar {
  /** Bring the backend in line with `target`. Calls run one at a time; the latest target wins. */
  sync: (target: PushTarget) => Promise<void>
  /** Try the last target again now (the app came back to the foreground). */
  retry: () => Promise<void>
}

export function createPushRegistrar(
  deps: PushRegistrarDeps,
  { retryDelaysMs = PUSH_RETRY_DELAYS_MS }: PushRegistrarOptions = {},
): PushRegistrar {
  let desired: PushTarget = { session: null, language: '' }
  // What the backend was last told, and for which session. Per app run: every
  // launch (including the restart a switch to or from English triggers) reports
  // again, so a report lost to that restart is made up for on the way back up.
  let reported: { session: string; language: AppLanguage | undefined } | null = null
  // A session that ended while the backend still held this device's token for
  // it (a logout, or a switch straight to another session). Kept until its
  // clear lands, so a logout sent offline or into a backend hiccup is retried
  // rather than leaving a signed-out phone with that captain's pushes.
  let pendingClear: string | null = null
  // The permission prompt shows at most once per session per app run, not again
  // on every language switch or foreground.
  let prompted: string | null = null
  let running: Promise<void> | null = null
  let again = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let failures = 0

  /** Clear the ended session's token. False when it has to be tried again. */
  async function clearEnded(session: string | null): Promise<boolean> {
    const ended = pendingClear
    if (!ended) return true
    // Signed back in to the same account: the registration that follows keeps
    // the token on that row, and a clear landing after it would undo it.
    if (session && mayBeSameAccount(ended, session)) {
      pendingClear = null
      return true
    }
    let cleared = false
    try {
      cleared = await deps.clear(ended)
    } catch {
      // Same as a clear that did not land.
    }
    if (cleared) pendingClear = null
    return cleared
  }

  /** One pass towards `target`. False when something did not land and should be retried. */
  async function syncOnce({ session, language: appLanguage }: PushTarget): Promise<boolean> {
    if (reported && reported.session !== session) {
      pendingClear = reported.session
      reported = null
    }
    // The ended session goes first, and a failed clear never holds up the next
    // session's registration.
    const cleared = await clearEnded(session)
    if (!session) return cleared
    const language = pushLanguage(appLanguage)
    if (reported?.session === session && reported.language === language) return cleared
    // A simulator, or notifications turned off: nothing to retry on a timer. The
    // next foreground asks again (the captain may have allowed them in Settings).
    if (!deps.canUsePush()) return cleared
    const mayPrompt = prompted !== session
    prompted = session
    if (!(await deps.ensurePermission(mayPrompt))) return cleared
    const deviceToken = await deps.getDeviceToken()
    if (!(await deps.register(deviceToken, language))) return false
    reported = { session, language }
    return cleared
  }

  function scheduleRetry(): void {
    const delay = retryDelaysMs[Math.min(failures, retryDelaysMs.length - 1)]
    failures += 1
    retryTimer = setTimeout(() => {
      retryTimer = null
      void sync(desired)
    }, delay)
  }

  function sync(target: PushTarget): Promise<void> {
    desired = target
    if (running) {
      // A login, logout or language switch that lands mid-registration is picked
      // up by the loop below as soon as the current call returns.
      again = true
      return running
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    running = (async () => {
      let landed = true
      do {
        again = false
        try {
          landed = await syncOnce(desired)
        } catch {
          // No Firebase in this build, or offline: push stays off for now (the
          // live WS remains the in-app path) and is tried again below.
          landed = false
        }
      } while (again)
      running = null
      // A report or clear that did not land is tried again on a slow timer, not
      // only at the next foreground: a captain on shift keeps the app open with
      // the map for hours, and the backend would write in the old language (or
      // keep pushing a signed-out captain) all that time.
      if (landed) failures = 0
      else scheduleRetry()
    })()
    return running
  }

  return { sync, retry: () => sync(desired) }
}
