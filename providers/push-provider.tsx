import { useEffect } from 'react'
import { AppState } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/auth-store'
import { ACTIVE_TRIP_KEY } from '@/hooks/use-active-trip'
import { TRIP_QUEUE_KEY } from '@/hooks/use-remote-trip-cancel'
import { registerFcmToken, clearFcmToken } from '@/services/push'
import { createPushRegistrar } from '@/lib/push-registration'
import type { Trip } from '@/services/captain-trips'
import {
  LOCAL_PUSH_FLAG,
  pushNotificationType as notificationType,
  roomOfferContent,
  roomOfferFromPush,
} from '@/lib/room-offer-push'

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
  return notificationType(data) === 'chat_message'
}

// Push kinds that, on tap, should open a specific trip screen (the captain is a
// participant). `new_trip_in_queue` and room pushes route to the home queue instead.
// One `trip_cancelled` covers every actor (rider / captain / system / admin) — the
// backend no longer sends the per-actor trip_cancelled_by_* variants.
const TRIP_PUSH_TYPES = new Set(['trip_accepted', 'captain_arriving', 'trip_completed', 'trip_cancelled'])

/** The room screen's per-room trip caches (use-nafarat-room): ['nafarat', 'trips', roomId]. */
const NAFARAT_TRIPS_KEY = ['nafarat', 'trips'] as const

/**
 * True when `tripId` is a seat of a Nafarat room whose screen is open: its
 * trips query is in the cache AND observed (the room screen is mounted). A
 * cache left behind by a room screen that has since closed does not count.
 */
function onRoomScreen(queryClient: QueryClient, tripId: string): boolean {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: NAFARAT_TRIPS_KEY })
    .some(
      (q) =>
        q.getObserversCount() > 0 &&
        (q.state.data as readonly Trip[] | undefined)?.some((trip) => trip.id === tripId) === true,
    )
}

const HIDDEN = { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }

// Foreground display policy: show banner + play sound EXCEPT for a chat message
// on the thread the user is already viewing (the WS already rendered it).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data
    // The backend writes every push in the language this app last reported
    // (see the registrar below), the room offer included. In the foreground the
    // room offer is still re-presented from the app's own copy, with the room's
    // size and total ("3 riders · 7,500 IQD"), so it is in the language on
    // screen even when a switch has not reached the backend yet, or on a backend
    // from before localized pushes. The backend's copy is hidden, so the offer
    // shows once. A backgrounded app shows the backend's copy; tapping either
    // one opens the queue.
    const roomOffer = roomOfferFromPush(data)
    if (roomOffer) {
      Notifications.scheduleNotificationAsync({
        content: {
          ...roomOfferContent(roomOffer, (key, options) => i18n.t(key, options), i18n.language),
          data: { ...data, [LOCAL_PUSH_FLAG]: true },
          sound: true,
        },
        trigger: process.env.EXPO_OS === 'android' ? { channelId: 'trips' } : null,
      }).catch(() => {
        // Could not re-present; the offer still reaches the queue over the WS / poll.
      })
      return HIDDEN
    }
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

/** Android channels the backend's pushes target. Idempotent. */
async function prepareChannels(): Promise<void> {
  if (process.env.EXPO_OS !== 'android') return
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

// One registrar for the app run: it remembers what the backend was told, so a
// re-render never re-sends, a login / logout / language switch that lands
// mid-registration is queued rather than raced, and a logout clear that did not
// land is kept and retried.
const registrar = createPushRegistrar({
  canUsePush: () => Device.isDevice, // emulators/simulators can't get FCM tokens
  ensurePermission: async (mayPrompt) => {
    const settings = await Notifications.getPermissionsAsync()
    if (settings.granted) return true
    if (!mayPrompt || !settings.canAskAgain) return false
    return (await Notifications.requestPermissionsAsync()).granted
  },
  getDeviceToken: async () => {
    await prepareChannels()
    const device = await Notifications.getDevicePushTokenAsync()
    return typeof device.data === 'string' ? device.data : String(device.data)
  },
  register: registerFcmToken,
  clear: clearFcmToken,
})

export function PushProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  // Re-renders on every language switch. Arabic <-> Kurdish switches live; a
  // switch to or from English restarts the app, and the launch after it reports
  // the new language (this provider mounts only once i18n has loaded it).
  const { i18n: i18nInstance } = useTranslation()
  const language = i18nInstance.language
  const router = useRouter()
  const queryClient = useQueryClient()

  // Register the device token (with the app language) whenever we have a
  // session, again whenever the language changes, and clear it on logout.
  useEffect(() => {
    void registrar.sync({ session: token, language })
  }, [token, language])

  // A report or logout clear that failed (offline, backend down) is retried on a
  // slow timer by the registrar, and at once when the captain comes back to the
  // app; one that landed is not re-sent.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void registrar.retry()
    })
    return () => sub.remove()
  }, [])

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
        // One rider of the Nafarat room on screen cancelled: the room screen marks
        // that seat cancelled (refreshed here in case the socket missed the frame,
        // whose arrival is what useRemoteTripCancel alerts on). Opening the seat's
        // own screen on top of the room would add nothing but a detour.
        if (type === 'trip_cancelled' && tripId && onRoomScreen(queryClient, tripId)) {
          queryClient.invalidateQueries({ queryKey: NAFARAT_TRIPS_KEY })
          return
        }
        // Open the trip if we have its id; otherwise fall back to the home queue.
        if (tripId) router.push({ pathname: '/(trip)/[id]', params: { id: tripId } })
        else router.dismissTo('/(tabs)')
        return
      }
      if (type === 'new_trip_in_queue' || type === 'room_dispatched' || type === 'room_expired') {
        // A new offer or room event — send the captain to the queue to act on it.
        // Back to the Home already in the stack, not a second one on top (a push
        // stacks another (tabs): a second map, poll and launch resume). With no
        // Home in the stack, POP_TO replaces the current screen with it.
        router.dismissTo('/(tabs)')
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
  }, [router, queryClient])

  // Arrival (as opposed to tap): a banner alone changes nothing on screen, so a
  // cancel that lands while the captain is driving would sit there until the next
  // poll. Invalidating is enough — the trip screen and the tabs-level hook own the
  // alert, and going through the cache keeps this the same one announcement.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data
      // A new offer (trip or Nafarat room): pull the queue now so the card shows
      // up with the push instead of on the next poll.
      if (notificationType(data) === 'new_trip_in_queue') {
        queryClient.invalidateQueries({ queryKey: TRIP_QUEUE_KEY })
        return
      }
      if (notificationType(data) !== 'trip_cancelled') return
      const tripId = tripIdFromData(data)
      queryClient.invalidateQueries({ queryKey: ACTIVE_TRIP_KEY })
      if (tripId) queryClient.invalidateQueries({ queryKey: ['trip', tripId] })
    })
    return () => sub.remove()
  }, [queryClient])

  return <>{children}</>
}
