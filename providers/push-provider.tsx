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

/** The push kind from the FCM `data` block (`notification_type`, with a `type` fallback). */
function notificationType(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const t = d.notification_type ?? d.type
  return typeof t === 'string' ? t : null
}

function isChatNotification(data: unknown): boolean {
  return notificationType(data) === 'chat_message'
}

// Push kinds that, on tap, should open a specific trip screen (the captain is a
// participant). `new_trip_in_queue` and room pushes route to the home queue instead.
const TRIP_PUSH_TYPES = new Set(['trip_accepted', 'captain_arriving', 'trip_completed', 'trip_cancelled'])

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
          // Trip offers + lifecycle alerts — MAX importance so a new ride offer
          // surfaces immediately even when the app is backgrounded.
          await Notifications.setNotificationChannelAsync('trips', {
            name: 'Trip alerts',
            importance: Notifications.AndroidImportance.MAX,
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

  // Tap-to-open: route by push kind. Chat → that trip's chat thread; a trip
  // lifecycle push → that trip screen; a new-offer / room push → the home queue.
  // The push is only a wake-up; the destination screen fetches current state.
  useEffect(() => {
    function handleResponse(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data
      const type = notificationType(data)
      const tripId = tripIdFromData(data)

      if (type === 'chat_message') {
        if (tripId) router.push({ pathname: '/(chat)/[tripId]', params: { tripId } })
        return
      }
      if (type && TRIP_PUSH_TYPES.has(type)) {
        // Open the trip if we have its id; otherwise fall back to the home queue.
        if (tripId) router.push({ pathname: '/(trip)/[id]', params: { id: tripId } })
        else router.push('/(tabs)')
        return
      }
      if (type === 'new_trip_in_queue' || type === 'room_dispatched' || type === 'room_expired') {
        // A new offer or room event — send the captain to the queue to act on it.
        router.push('/(tabs)')
        return
      }
      // Unknown/other (e.g. captain_approval_decision): no deep-link, just open the app.
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
