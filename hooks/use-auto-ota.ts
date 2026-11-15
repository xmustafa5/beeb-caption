import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Updates from 'expo-updates'

/**
 * Apply OTA updates without the user doing anything.
 *
 * On launch and on every return to the foreground: ask EAS Update for a newer
 * bundle on this build's channel + runtime, download it, and reload into it right
 * away. Only at those two moments, never while the app is in use, so nobody is
 * thrown out mid-screen; a live trip is restored on relaunch from the server.
 *
 * Off in development and in builds without updates enabled. Any network error is
 * ignored: the next launch or foreground simply tries again.
 */
export function useAutoOta() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return
    let running = false
    const run = async () => {
      if (running) return
      running = true
      try {
        const check = await Updates.checkForUpdateAsync()
        if (!check.isAvailable) return
        const fetched = await Updates.fetchUpdateAsync()
        if (fetched.isNew) await Updates.reloadAsync()
      } catch {
        // Offline or EAS unreachable: try again next time.
      } finally {
        running = false
      }
    }
    void run()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run()
    })
    return () => sub.remove()
  }, [])
}
