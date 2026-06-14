# Beeb Captain App — Build Roadmap

> Generated 2026-06-09 from the **Captain App PRD** (`docs/prd/Beep_Module_Captain_App_PRD_V1_0_0.md`),
> the backend handoff (`docs/frontend-summary.md` → *Captain App* section), the live
> OpenAPI spec (`docs/openapi.json`), and the current scaffold (forked from the Beeb
> Customer App template). This is the **driver-facing** counterpart to the Customer App;
> it talks to the same backend (`https://beeb.madebyhaithem.com`, all 13 phases Live).

## 0. What this app is

The **Captain App** is Beep's driver-facing mobile surface. A captain registers, uploads
documents, waits for admin approval, then each day: **activates** (pays the daily fee) →
goes **online** (streams GPS) → receives a **queue** of trip/room offers → **accepts** →
drives the **live trip** through its legs → sees **earnings**. Built on the same
RN/Expo/Expo-Router stack as the Customer App.

The scaffold is the Customer App template with rider screens stubbed. We **reuse** the
infra (api client, auth store shape, design system, i18n/RTL, forms, tab bar, trip-map,
location/distance hooks, wallet service) and **adapt the rider OTP `(auth)` flow into the
captain onboarding flow**. We do **not** touch the Customer App repo.

## 1. Reuse inventory (keep — don't rebuild)

| Asset | Status | Captain use |
|---|---|---|
| `lib/api.ts` | ✅ reuse as-is | axios + Bearer interceptor + 401→clear + `parseApiError`/`apiErrorKey`. Already points at the Beeb base + exposes `WS_BASE_URL`. |
| `store/auth-store.ts` | 🔧 **rework in place** | Replace rider `User` with a `Captain` shape (id, phone, name, name_ar, gender, car_*, **status**). Keep `token`/`setSession`/`clear`/`hasHydrated`/SecureStore. |
| `services/auth.ts` | 🔧 rework | Keep `requestOtp` + `normalizePhone` + gender mappers; replace `verifyOtp` (captain verify endpoint) and `getMe` (`GET /api/captains/{id}`, not `/riders/me`). |
| `app/(auth)/*` | 🔧 adapt | `phone.tsx`/`otp.tsx` mostly reusable (same OTP send + a different verify); `profile-setup.tsx` → replaced by the multi-step **registration** wizard. |
| `app/_layout.tsx` `AuthGate` | 🔧 rework | Branch on captain **status** (unregistered → register, pending/rejected/blocked → status screen, approved → tabs), not on `user.name`. |
| Design system | ✅ reuse | `constants/Colors|Typography|Spacing`, `components/ui/*`, `components/forms/*`, `components/brand/*`. |
| `components/trip/trip-map.tsx` | ✅ reuse | Already supports `driver`, `pickup`, `dropoff`, `stops`, `routeCoords`, `zonePolygon`. Drives the live-trip map. |
| `components/trip/location-picker.tsx` | ✅ reuse | For any pin display/selection if needed. |
| `hooks/use-current-location.ts`, `use-distance.ts` | ✅ reuse | GPS + haversine for "X km away" on queue cards + the ping loop. |
| `hooks/use-me.ts` | 🔧 rework | Re-point at the captain profile query. |
| `services/wallet.ts` | ✅ reuse | `GET /api/me/wallet` + `topUp` — needed for the **402 insufficient-funds** path on Activate Today (top up, retry). |
| `services/places.ts`, `routing.ts` | ✅ reuse | Geocoding + OSRM route line for the live-trip map. |
| `lib/format-currency.ts`, `wkt.ts`, `point-in-polygon.ts` | ✅ reuse | IQD formatting, WKT parse (lng-first), zone containment. |
| `components/tab-bar/custom-tab-bar.tsx`, `app/(tabs)/_layout.tsx` | 🔧 retheme | Re-label the 4 tabs for the captain (Home/Drive, Queue, Earnings, Profile). PagerView pattern stays. |

## 2. Backend contract — the Captain surface (source of truth)

All under `https://beeb.madebyhaithem.com`. Captain token from `POST /api/auth/captain/otp/verify`
(JWT `role:"captain"`, `sub` = **captain id**, 30-day exp, no refresh). Error envelope
`{ "error": "<msg>" }`; **401 has an empty body** — branch on status. Money is integer IQD.

| Area | Endpoints |
|---|---|
| **Auth** | `POST /api/auth/otp/send {phone}` → `POST /api/auth/captain/otp/verify {phone,code}` → `{token, user_id}`. **404** = no captain for phone (→ register); **403** = not approved (→ status screen). `POST /api/me/fcm-token {fcm_token}` (push register; `null` on logout). |
| **Register + docs** | `POST /api/captains/register` (public) `{phone,name,name_ar,gender("m"\|"f"),car_make,car_model,car_plate,city_id,car_color?,national_id?}` → 201 Captain (pending). Presigned upload: `POST /api/captains/{id}/documents/upload-url {doc_type}` → `{upload_url,object_key,expires_in}` → **PUT bytes** to `upload_url` (no auth header) → `POST /api/captains/{id}/documents {doc_type,object_key}`. `GET /api/captains/{id}/documents`, `GET .../documents/completeness` → `{complete,uploaded[],missing[]}`. |
| **Approval status** | `GET /api/captains/{id}` → Captain `{status: pending\|approved\|rejected\|blocked, rejection_reason?, blocked_reason?, ...}`. |
| **Activate Today** | `GET /api/captain/activation/today` → `{activated, activation}`; `POST /api/captain/activation/today {}` → 201 `CaptainDailyActivation`. **P10: POST charges the captain wallet** — paid → `status:"paid"`+`collected_at`; **insufficient funds → 402** + row `status:"failed"`/`charge_error` (CTA persists; top up then retry). Idempotent same day. |
| **Online + location** | `PUT /api/captain/online {online}` (**403 if not activated today**); `POST /api/captain/location {longitude,latitude}` (sets online, fans out); `POST /api/captain/location/flush {pings:[...]}` (last-wins on reconnect); `GET /api/captain/location`. Live stream: `GET /ws/captain?token=<jwt>` (own location echo + active-trip frames). |
| **Queue + accept** | `GET /api/captain/trip-queue` → `{offers: CaptainOffer[]}` (pending regular trips + open rooms, oldest-first; **women-only rooms hidden unless captain.gender = f**). `POST /api/trips/{id}/accept`. `POST /api/abriyah/rooms/{id}/accept` (room → dispatched). `GET /api/abriyah/rooms/{id}/members` (assigned captain only). |
| **Live trip legs** | `POST /api/trips/{id}/arrive` (cue, no status change), `.../start` (accepted→in_progress), `.../complete` (in_progress→completed, charges rider). `POST /api/trips/{id}/cancel {reason,comment?}` (captain: from `requested`/`accepted` only). Multi-stop: `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach`. Masked call: `GET /api/captain/trips/{id}/proxy`. |
| **Earnings** | `GET /api/captains/{id}/earnings?period=today\|week\|month` → `{gross_iqd,activation_fee_iqd,net_iqd,trip_count,period}`. `GET /api/captains/{id}/earnings/history?period=…` → `{items:[{trip_id,fare_iqd,trip_type,completed_at}]}`. |

### CaptainOffer shape (queue)
`{ offer_type ("trip"|"room"), id, zone_id?, room_type? ("mixed"|"women_only"|null), pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_iqd, created_at }`

### WebSocket frames (captain socket)
No envelope; correlate by **(channel, payload fields)**. High-traffic frames now carry an
additive `event`: trip lifecycle → `trip_update` (watch `status`); GPS → `captain_location`
(has `longitude`/`latitude`). **Room frames carry no `event`** — field-sniff
(`rider_count`/`status`). Dispatch offers fan out on `rt:captain:{id}`; durable
`new_trip_in_queue` FCM push is the backgrounded path (FCM deferred — see Area 3).

## 3. PRD ↔ backend reconciliation (gaps to respect)

The PRD is the aspirational product spec; the **live backend wins** where they differ. Build to the API.

| PRD says | Backend reality | Decision |
|---|---|---|
| **3 required documents** (license, registration, selfie-with-car) | **5 required**: `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back` | Build **5**. PRD is stale; contract + task agree on 5. |
| Activate Today: "fee recorded, collected weekly" (v1) | **P10 live: real wallet charge**, 402 on insufficient funds | Build the **real charge + 402** path (top-up → retry). This is the M3/v2 behavior, already live. |
| Room **Accept (partial) → LOCKED → 60s confirm → DISPATCHED**; "Wait for full" | Backend `POST /api/abriyah/rooms/{id}/accept` goes **open → dispatched** immediately. No captain locked-confirm window (force-dispatch from `locked` is **admin-only**). | Accept = immediate dispatch. **No** locked/confirm/"wait for full" UI. Flag in spec. |
| Live Trip: **per-rider Boarding / per-rider Drop-off** check-in | Backend legs are only `arrive` / `start` / `complete` (+ multi-stop `stops/{id}/reach`). No per-rider boarding endpoint. | Single arrive/start/complete. For Abriyah show the member roster (read-only) + per-stop "reached"; no per-rider board/drop. Flag in spec. |
| Idle timeout: client auto-offline after 5 min no-ping | Backend **also** force-offlines after 5 min (60s sweep) | Client shows "stale" ~60s, treats gone at 5 min; rely on backend as source of truth. |
| In-app chat + WhatsApp with rider | Backend exposes only the **masked proxy call** (`GET /api/captain/trips/{id}/proxy`); no chat endpoint | v1: masked **call** only (tel: deep-link to proxy number). No chat. Flag. |
| Earnings "gross = cash collected; fees accrued not deducted" (v1) | `earnings` returns `net = gross − activation fee` already | Render the endpoint's `gross/activation_fee/net` as-is. |

## 4. Build sequence (dependency order)

Each area = one **brainstorm → spec → plan → build → verify (`tsc` + `expo lint`) → commit** cycle,
mirroring the customer app (`docs/superpowers/specs/<date>-<feature>-design.md` + `plans/<date>-<feature>.md`).
Strict dependency order: **nothing works without a captain token, so onboarding/auth ships first.**

Test rigs (staging, MockSms fixed code): male captain plate **STG-1001**, female **STG-1002**
(both already approved + activated + online). Use these to E2E the *approved-captain* path
(activate/online/queue/trip/earnings) **today**. The *register → pending → approved*
transition needs an admin action, so that leg is verified up to "pending" from the app alone.

---

### Area 1 — Onboarding & Auth  *(foundation — unblocks everything)*

**Goal:** A captain can log in (approved → tabs), or be routed to register / approval-pending
based on backend status. Persist a real captain JWT.

- **Store rework:** `Captain` shape in `store/auth-store.ts` (id, phone, name, name_ar, gender,
  car_make/model/plate/color, status, avg_rating, trip_count). Keep token/SecureStore/hydration.
- **Service rework (`services/captain-auth.ts` or extend `auth.ts`):**
  `requestOtp` (reuse), `verifyCaptainOtp(phone,code)` → POST `captain/otp/verify`, mapping
  **404 → "no account, register"**, **403 → "pending/blocked, status screen"**, 200 → token +
  hydrate via `GET /api/captains/{user_id}`. `getCaptain(id)`, `registerCaptain(payload)`.
- **Registration wizard** (`app/(auth)/register/*` or a stepped screen): Personal (name EN+AR,
  gender m/f **locked**, national_id?) → Vehicle (make/model/color/plate) → **5-document upload**
  (presigned PUT via `expo-image-picker`, per-doc progress, completeness check) → Review & Submit
  → `POST /api/captains/register` → set session-less captain id → Approval Pending.
- **Approval Pending / Rejected / Blocked screens** (`app/(auth)/status.tsx`): poll
  `GET /api/captains/{id}` (no token yet for pending — see open Q1), show submitted-ago + status;
  rejected shows reason + Contact Support; blocked → force-logout.
- **`AuthGate` rework:** route by `(token?, status)` not `(token?, name?)`.
- **Reuse:** `phone.tsx`/`otp.tsx` shells, `Input`/`Button`/`FormError`, gender mappers, presigned
  PUT pattern (lifted from `uploadRiderPhoto`).
- **Verify:** OTP send + verify against STG-1001 (approved → token + tabs); a fresh phone → 404 →
  register flow → 201 pending → Approval Pending. `tsc` + lint. **Commit.**

**Deps:** none. **Blocks:** all other areas.

---

### Area 2 — Activate Today

**Goal:** Approved captain sees today's activation state; can activate (charge wallet); 402 →
top-up → retry.

- `services/activation.ts`: `getTodayActivation()`, `activateToday()`.
- `hooks/use-activation.ts`: query `['captain','activation','today']` + mutation.
- **Screen** (home/drive surface or modal): fee notice (2,000 IQD), Activate CTA; on **402**
  show insufficient-funds + a Top-Up entry (reuse `services/wallet.ts` + a minimal top-up sheet)
  then retry. Idempotent re-tap returns the same row. Success enables the Online toggle.
- **Verify:** with STG-1001 (already activated) GET returns `activated:true`; simulate the CTA on
  a non-activated captain if available; exercise 402 by draining/!funding wallet if possible. `tsc`+lint. **Commit.**

**Deps:** Area 1. **Blocks:** Area 3 (online is gated on activation).

---

### Area 3 — Online toggle, location streaming & real-time

**Goal:** Activated captain toggles online (gated 403 if not activated), streams GPS every ~10s,
and holds a live WebSocket for offers + active-trip frames. **REST polling is the always-works baseline.**

- `services/captain-location.ts`: `setOnline(bool)` (PUT online), `pingLocation(lng,lat)`,
  `flushPings([...])`, `getLocation()`.
- **Location loop hook:** every ~10s while online ping `POST /api/captain/location`; queue pings
  while offline/network-down and `flush` on reconnect (PRD §4.7). Foreground only at v1.
- **WS provider** (`services/captain-socket.ts` + a context, mirroring the customer app's
  `trip-socket`): connect `GET /ws/captain?token=`, 25s ping keep-alive, exponential reconnect
  (1s→30s). Sniff frames: `captain_location` echo, `trip_update` (active-trip status). Expose
  current active-trip status + last echo.
- **Online toggle UI** on the home/drive surface: disabled until activated; shows online state +
  today's activation badge; "stale" indicator ~60s; respects backend 5-min force-offline.
- **FCM deferred:** `POST /api/me/fcm-token` + `expo-notifications` + background offer push +
  deep-linking is a **later dedicated task** (needs a custom dev build; doesn't work in Expo Go).
  Until then, foreground WS + queue polling cover offers. Documented as a known gap.
- **Verify:** STG-1001 → online 200, ping 200, WS opens + receives location echo; toggle online on
  a non-activated captain → 403. `tsc`+lint. **Commit.**

**Deps:** Areas 1–2. **Blocks:** Area 4 (queue) benefits from the socket but also works via polling.

---

### Area 4 — Trip queue & accept

**Goal:** Online captain sees the offer feed (regular trips + open rooms, women-only hidden for
male captains) and can accept.

- `services/captain-queue.ts`: `getTripQueue()` → `CaptainOffer[]`; `acceptTrip(id)`;
  `acceptRoom(id)`; `getRoomMembers(id)`.
- `hooks/use-trip-queue.ts`: query `['captain','trip-queue']` with a ~5–10s poll (refreshed live
  by the WS offer frames from Area 3 when present).
- **Queue screen** (a tab): offer cards — regular (pickup/dropoff distance via `use-distance`,
  fare) and room (zone, room_type, fare). Accept → on success route to Live Trip. **No
  locked/confirm/"wait for full"** (backend goes straight to dispatched — see §3). Handle 409
  (someone else took it / captain already on a trip) by refetching.
- **Verify:** STG-1001 (male) never sees women_only offers; STG-1002 (female) does; accept a
  seeded `requested` trip → 200 → Live Trip. `tsc`+lint. **Commit.**

**Deps:** Areas 1–3. **Blocks:** Area 5.

---

### Area 5 — Live trip legs

**Goal:** Drive an accepted trip through arrive → start → complete (+ per-stop reach for
multi-stop), with map + navigation deep-link + masked call.

- `services/captain-trips.ts`: `getTrip(id)`, `arrive(id)`, `start(id)`, `complete(id)`,
  `cancel(id, reason, comment?)`, `reachStop(tripId, stopId)`, `getProxy(id)`.
- **Live Trip screen** (`app/(trip)/[id].tsx`): reuse `trip-map` (route to pickup → dropoff via
  OSRM line, own-location marker), staged action button (`Arrived` → `Start` → `Complete`),
  **Cancel only in `accepted`** (reason enum), navigate-out deep-link (Google Maps / Waze),
  masked call (`tel:` to proxy number). For **Abriyah**: read-only member roster
  (`GET /api/abriyah/rooms/{id}/members`) + per-stop "reached"; **no per-rider board/drop** (see §3).
- Drive trip state from the Area 3 WS `trip_update` frames + `GET /api/trips/{id}` on mount.
- **Verify:** full leg cycle on a seeded accepted trip (arrive 200 → start in_progress →
  complete completed); cancel a still-`accepted` trip; proxy returns masked `+964…`. `tsc`+lint. **Commit.**

**Deps:** Areas 1–4. **Blocks:** Area 6 (earnings update on complete).

---

### Area 6 — Earnings

**Goal:** Read-only earnings summary (today/week/month) + trip history.

- `services/earnings.ts`: `getEarnings(period)`, `getEarningsHistory(period)`.
- `hooks/use-earnings.ts`: queries keyed `['captain','earnings',period]`.
- **Earnings tab:** today/week/month cards (gross − activation fee = net, IQD-formatted,
  tabular-nums); "Trip History →" list of completed trips (fare, type, completed_at).
- **Verify:** STG-1001 earnings 200 for all three periods; history lists the seeded completed
  trip(s). `tsc`+lint. **Commit.**

**Deps:** Areas 1, 5. **Blocks:** none.

---

### Status: Areas 1–6 BUILT & verified on `main` (2026-06-11)

All six v1 areas are complete (`tsc` clean, lint 0 errors, live-verified). Specs + plans in
`docs/superpowers/{specs,plans}/`. The items below are **deferred follow-ups**, not part of v1.

### Deferred — needs a custom dev build (NOT testable in Expo Go)

These were intentionally pushed past v1 because they require native modules / native config that
Expo Go doesn't include. They need: native config in `app.json` (+ config plugins), an EAS account
or local native toolchain (Xcode / Android Studio), real FCM `google-services.json` / APNs key from
the backend/Firebase, and a `npx expo run:ios|android` (or EAS) build — after which you test on a
device/simulator, **not Expo Go**.

- **FCM push** (the bigger win). Backend already supports it (`POST /api/me/fcm-token`; sends
  `new_trip_in_queue`, `trip_cancelled`, `captain_approval_decision`, `trip_accepted/arriving/
  completed`, `room_dispatched/expired`). Client work, in order:
  1. `npx expo install expo-notifications`; add the config plugin + FCM/APNs creds to `app.json`.
  2. On login → get the push token → `POST /api/me/fcm-token {fcm_token}`; send `null` on logout
     (wire into the captain-auth flow / AuthGate).
  3. `setNotificationHandler` for foreground display.
  4. `addNotificationResponseReceivedListener` → deep-link on `data.type`: `new_trip_in_queue` →
     Queue tab, `trip_cancelled` → the trip, `captain_approval_decision` → status screen.
  5. Android: a high-importance notification channel for trip offers.
  - **Buys:** a backgrounded/closed captain is woken for new offers + approval decisions. Today
    (WS-only, foreground) the captain only receives offers while the app is open on the Queue tab.
- **Background location.** The Area-3 GPS ping loop is **foreground-only**; a backgrounded captain
  is force-offlined by the backend's 5-min staleness sweep. Background tracking needs
  `expo-location` background mode + TaskManager + the "Always" location permission + config plugin.

### Deferred — backend gap (BACKEND_ISSUES #7)

- **Multi-stop "reach"** is built but **inert**: the captain can't list a trip's stops (no
  captain stops-list endpoint; rider one 403s for captains; Trip embeds no stops). `getStops` returns
  `[]`; the stops panel is hidden. One-line activation once the backend ships a captain stops-list.

### Deferred — minor / Horizon 2

- `captain.earnings.tripCount` i18n **plural forms** (EN/AR) — cosmetic ("1 trips" / Arabic plural rules).
- Earnings analytics / trend graphs (Horizon 2).
- Self-service zone preference / availability (Horizon 2).
- Cleanup: rider-only leftovers from the template (e.g. `services/places.ts`/`routing.ts` are reused;
  audit for any unused rider code once all areas are stable).

## 5. Cross-cutting conventions

- **Stack/style:** follow `CLAUDE.md` exactly — inline styles, `borderCurve:'continuous'`,
  `boxShadow`, theme via `useThemeColors()`, kebab-case files, interfaces over types, named exports.
- **i18n/RTL:** every string through `t()`, add EN+AR keys; invoke the `react-native-rtl-positioning`
  skill for any new layout. Captain UI is Arabic-primary.
- **Data:** TanStack Query for all reads/mutations (no `fetch`+`useState`); hierarchical keys
  (`['captain',...]`). Money integer IQD via `format-currency`.
- **Errors:** `parseApiError`/`apiErrorKey`; remember **401 has an empty body** (branch on status);
  map 402/403/404/409 to specific captain copy.
- **Backend bugs:** log in `BACKEND_ISSUES.md`, don't work around in the client.
- **Verify:** `npx tsc --noEmit` + `npx expo lint` per task (no unit-test runner). Commit per task.
  Don't touch the Customer App repo.

## 6. Open questions / risks

1. **Pending-status polling needs identity.** `POST /api/auth/captain/otp/verify` returns **403**
   (no token) for a pending captain, but the Approval-Pending screen must poll
   `GET /api/captains/{id}` (auth-gated?). Confirm whether a pending captain can read their own
   record, and with what credential — else the screen can only show "submitted, await push" and
   relies on re-attempting OTP verify to detect approval. **Verify against backend before Area 1 build.**
2. **`city_id` for registration.** `register` needs a `city_id`. Confirm how the app obtains it —
   `GET /api/zones` exposes a city via zones, but a dedicated active-cities list for the picker may
   be needed. (Customer app only ever had one Baghdad city seeded.)
3. **402 top-up reachability for captains.** Activate-Today charges the *captain* wallet; confirm
   captains can `GET/POST /api/me/wallet[/topup]` (owner_type derived from the captain JWT role) so
   the top-up-then-retry loop works in-app.
4. **Women-only filtering is server-side** (queue pre-filters) — trust it, but also gate any
   room-accept UI on `captain.gender === 'female'` defensively.
5. **WS in Expo Go** works (no native push); **FCM does not** — hence FCM is deferred to a dev build.
6. **Seed limits:** STG-1001/1002 are already approved+activated+online, so the *register→approve*
   transition and the *not-activated→activate* CTA can't both be exercised on the same rig without
   admin help or a fresh phone. Plan verification around that.
