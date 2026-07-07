import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/store/auth-store'
import { registerFcmToken, clearFcmToken } from '@/services/push'

// Offline chat pushes (FCM). While the app is foregrounded on the relevant chat
// screen, messages already arrive over the WS — so we suppress the banner there
// to avoid a double. Everywhere else (backgrounded, other screen) the banner
// shows, and tapping it deep-links into that trip's chat.
//
// Requires a Firebase-configured build (google-services.json) — see the FCM
// setup notes. In Expo Go / a build without Firebase, getDevicePushTokenAsync
// throws; we swallow it so the app runs fine without push.

// The trip whose chat is currently on screen (set by the chat screen). Used to
// suppress a redundant foreground banner for the thread you're already reading.
let foregroundChatTripId: string | null = null
export function setForegroundChatTrip(tripId: string | null): void {
  foregroundChatTripId = tripId
}

/** Pull a trip id out of an FCM data payload, tolerating key-name variants. */
function tripIdFromData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const candidate = d.trip_id ?? d.tripId ?? d.tripID
  return typeof candidate === 'string' ? candidate : null
}

function isChatNotification(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return d.notification_type === 'chat_message' || d.type === 'chat_message'
}

// Foreground display policy: show banner + play sound EXCEPT for a chat message
// on the thread the user is already viewing (the WS already rendered it).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data
    const suppress =
      isChatNotification(data) &&
      tripIdFromData(data) != null &&
      tripIdFromData(data) === foregroundChatTripId
    return {
      shouldShowBanner: !suppress,
      shouldShowList: !suppress,
      shouldPlaySound: !suppress,
      shouldSetBadge: false,
    }
  },
})

export function PushProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const router = useRouter()

  // Register the device token whenever we have a session; clear it on logout.
  const registeredForToken = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function sync() {
      if (!token) {
        if (registeredForToken.current) {
          await clearFcmToken()
          registeredForToken.current = null
        }
        return
      }
      if (registeredForToken.current === token) return
      if (!Device.isDevice) return // emulators/simulators can't get FCM tokens

      try {
        const settings = await Notifications.getPermissionsAsync()
        let granted = settings.granted
        if (!granted && settings.canAskAgain) {
          const req = await Notifications.requestPermissionsAsync()
          granted = req.granted
        }
        if (!granted || cancelled) return

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('chat', {
            name: 'Messages',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
          })
        }

        const device = await Notifications.getDevicePushTokenAsync()
        if (cancelled) return
        const fcm = typeof device.data === 'string' ? device.data : String(device.data)
        const ok = await registerFcmToken(fcm)
        if (ok && !cancelled) registeredForToken.current = token
      } catch {
        // No Firebase in this build, permission denied, or offline — push stays
        // off; the live WS remains the in-app path. Never crash here.
      }
    }

    void sync()
    return () => {
      cancelled = true
    }
  }, [token])

  // Tap-to-open: a chat push opens that trip's chat thread.
  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data
      if (!isChatNotification(data)) return
      const tripId = tripIdFromData(data)
      if (tripId) router.push({ pathname: '/(chat)/[tripId]', params: { tripId } })
    }

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse)

    // Cold start: the app may have been launched by tapping a push.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response)
    })

    return () => sub.remove()
  }, [router])

  return <>{children}</>
}
