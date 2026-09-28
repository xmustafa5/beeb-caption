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

export interface PushRegistrarDeps {
  /** False on a simulator / emulator: they get no FCM token. */
  canUsePush: () => boolean
  /** Notification permission; may show the system prompt only when `mayPrompt`. */
  ensurePermission: (mayPrompt: boolean) => Promise<boolean>
  /** The device's FCM token. Throws in a build without Firebase. */
  getDeviceToken: () => Promise<string>
  /** POST the token + language for the signed-in captain. False when it did not land. */
  register: (deviceToken: string, language: AppLanguage | undefined) => Promise<boolean>
  /** Clear the token of a session that just ended (logout). Best-effort. */
  clear: (endedSession: string) => Promise<void>
}

/** What the backend should hold: the signed-in session (null = none) and the app language. */
export interface PushTarget {
  session: string | null
  language: string
}

export interface PushRegistrar {
  /** Bring the backend in line with `target`. Calls run one at a time; the latest target wins. */
  sync: (target: PushTarget) => Promise<void>
  /** Try the last target again (the app came back to the foreground after a failed report). */
  retry: () => Promise<void>
}

export function createPushRegistrar(deps: PushRegistrarDeps): PushRegistrar {
  let desired: PushTarget = { session: null, language: '' }
  // What the backend was last told, and for which session. Per app run: every
  // launch (including the restart a switch to or from English triggers) reports
  // again, so a report lost to that restart is made up for on the way back up.
  let reported: { session: string; language: AppLanguage | undefined } | null = null
  // The permission prompt shows at most once per session per app run, not again
  // on every language switch or foreground.
  let prompted: string | null = null
  let running: Promise<void> | null = null
  let again = false

  async function syncOnce({ session, language: appLanguage }: PushTarget): Promise<void> {
    if (!session) {
      if (reported) {
        const ended = reported.session
        reported = null
        await deps.clear(ended)
      }
      return
    }
    const language = pushLanguage(appLanguage)
    if (reported?.session === session && reported.language === language) return
    if (!deps.canUsePush()) return
    const mayPrompt = prompted !== session
    prompted = session
    if (!(await deps.ensurePermission(mayPrompt))) return
    const deviceToken = await deps.getDeviceToken()
    if (await deps.register(deviceToken, language)) reported = { session, language }
  }

  function sync(target: PushTarget): Promise<void> {
    desired = target
    if (running) {
      // A login, logout or language switch that lands mid-registration is picked
      // up by the loop below as soon as the current call returns.
      again = true
      return running
    }
    running = (async () => {
      try {
        do {
          again = false
          try {
            await syncOnce(desired)
          } catch {
            // No Firebase in this build, permission denied, or offline: push stays
            // off (the live WS remains the in-app path) and the next trigger retries.
          }
        } while (again)
      } finally {
        running = null
      }
    })()
    return running
  }

  return { sync, retry: () => sync(desired) }
}
