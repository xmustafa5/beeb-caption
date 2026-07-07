# FCM Push Notifications — Setup & Handoff (Captain app)

In-ride chat delivers messages **live over WebSocket** while the app is open. FCM
push covers the gap: when the counterparty is **backgrounded / phone locked / app
killed**, the backend sends an offline push (`notification_type: "chat_message"`,
title "New message from your captain/rider", body = first 120 chars).

The **app-side code is done** (this repo). What remains needs a Firebase account
and can only be done by the project owner — steps below.

---

## What's already implemented (captain app)

- `expo-notifications` + `expo-device` installed; config plugin + `POST_NOTIFICATIONS`
  permission added to `app.json`.
- `services/push.ts` — `registerFcmToken(token)` / `clearFcmToken()` →
  `POST /api/me/fcm-token { fcm_token }` (verified live: 204).
- `providers/push-provider.tsx` — mounted in `app/_layout.tsx` inside
  `CaptainPresenceProvider`:
  - On login: asks notification permission, gets the **native FCM device token**
    (`getDevicePushTokenAsync`), registers it, creates the Android `chat` channel.
  - On logout (token cleared): clears the token backend-side.
  - Foreground policy: suppresses the banner for the chat thread you're **already
    viewing** (WS already showed it); shows it everywhere else.
  - Tap-to-open: a `chat_message` push routes to `/(chat)/[tripId]` (also handles
    cold-start launch-from-push).
- `app/(chat)/[tripId].tsx` sets/clears the "foreground chat trip" so suppression
  works.

Degrades gracefully with no Firebase configured — the app runs, just without
offline push. The live WS path is unaffected.

---

## What YOU need to do (one-time, needs a Google/Firebase account)

### 1. Firebase project
- <https://console.firebase.google.com> → create or reuse the Beeb project.
- **Add an Android app** with package name **`com.xmustafa5.beebcaptain`** (exact —
  it's in `app.json` → `android.package`).
- The **rider app** (`com.beeb.rider`, other repo) can live in the **same**
  Firebase project — just add it as a second Android app.

### 2. Download `google-services.json`
- Put it at the repo root: `beeb-caption/google-services.json`
  (`app.json` already points at `./google-services.json`).
- ⚠️ **Do not commit it** — add `google-services.json` to `.gitignore`; supply it
  to EAS as a secret/file when building.

### 3. Backend FCM credentials
- Backend needs a **service-account key** from the same Firebase project:
  Project Settings → Service accounts → *Generate new private key* → hand the JSON
  to the backend team.

### 4. Build a dev/preview client and test on a real device
- `eas build --profile development --platform android` — push needs a real build,
  not Expo Go, and a **physical device** (emulators don't get FCM tokens).
- Log in → accept prompt → background the app → have the rider send a chat message
  → banner appears → tap → lands on the chat thread.

---

## ⚠️ Open question for the backend team

Tap-to-open reads the **trip id** from the push **data payload**. The OpenAPI
`payload` is untyped, so our handler accepts `trip_id` / `tripId` / `tripID`
(`providers/push-provider.tsx` → `tripIdFromData`). **Please confirm the backend
includes the trip id (ideally `trip_id`) AND `notification_type: "chat_message"`
in the FCM `data` block** (Android only delivers `data` to a killed app). Different
key → one-line change.

---

## Files touched
- `app.json` (plugin, permission, `googleServicesFile`)
- `services/push.ts` (new)
- `providers/push-provider.tsx` (new)
- `app/_layout.tsx` (mount `PushProvider`)
- `app/(chat)/[tripId].tsx` (foreground suppression)
- `package.json` (`expo-notifications`, `expo-device`)
