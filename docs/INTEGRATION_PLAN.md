# Beeb Customer (Rider) App — Backend Integration Study & Roadmap

> Generated 2026-06-05 from a study of the PRD suite (`docs/prd/`), the backend handoff (`docs/frontend-summary.md`), the live OpenAPI spec (`docs/openapi.json`), the current app source, and live curl tests against `https://beeb.madebyhaithem.com`.

## 1. Which app is this? — Definitive answer

**This repo is the Beeb Customer (Rider) App.** High confidence.

The PRD describes one platform with **three surfaces**: an Admin Dashboard (web), a **Customer App**, and a **Captain App**. This repo is the Customer App.

**Evidence:**
- Route groups are `(auth)`, `(booking)`, `(abriyah)`, `(tabs)` = Home / Trips / Notifications / Profile. No captain surfaces exist.
- The persona is the **passenger**, never the driver. `app/(booking)/driver-assigned.tsx` shows the user *being assigned* a driver (a `DriverCard` with ETA). The Captain App is the inverse — the driver *receives* requests.
- Onboarding (`app/(auth)/profile-setup.tsx`) collects only **name + gender**. There's no national ID, no vehicle make/model/plate, and no 5-document upload — all required by the Captain App. No Approval-Pending, Activate-Today, or Online-Toggle screens.
- `app/(abriyah)/room-waiting.tsx` is the **rider** waiting inside a room (count + countdown) then receiving a driver — the captain side would *accept/dispatch* the room.

The **Captain App** and **Admin Dashboard** are separate, not-yet-built surfaces (the PRD targets Flutter for mobile; this repo is React Native / Expo, which is fine — the surface identity is what matters).

## 2. Current state — what's built and how

**The app is a polished UI prototype that is ~100% mock-driven. There is no real API layer.**

- `axios` is installed but **unused**. There is **no `lib/api.ts`**, no HTTP client, no token interceptor, no `EXPO_PUBLIC_API_URL`.
- TanStack Query is wired at the root but only used for mutation UI state — **no queries**.
- The only real network calls are **OSRM** (`services/routing.ts`, public demo server, for route polylines) and **Expo Location** geocoding (`services/places.ts`).

Everything else is simulated with `delay()`:
- `services/auth.ts` — fake OTP + **mock token** (`mock.${Date.now()}...`), always `isNewUser: true`.
- `services/trips.ts` — **local** haversine + a `beeb_go/comfort/xl` rate table; `createRegularTrip` makes a local trip ID.
- `services/abriyah.ts` — local fare; `simulateRoom()` is a client-side `setInterval` faking 1–2 riders joining then auto-dispatch.
- `services/mock-driver.ts` — animates a fake driver along a real OSRM polyline.

**Already correct / reusable:**
- `store/auth-store.ts` — Zustand + **SecureStore**, persists `{token, user}`, has `setSession`/`clear`/`hasHydrated`. Ready for a real JWT.
- `store/trip-store.ts` — Zustand + AsyncStorage active-trip + history cache.
- Map, geocoding, route-drawing, and the whole screen flow are built — we mostly **swap the data source**, not rebuild UI.

## 3. Backend readiness (live test results)

Backend `https://beeb.madebyhaithem.com` is **UP, all 13 phases Live, partially usable today.**

| Test | Result |
|---|---|
| `GET /api/health` | `200 {"status":"ok","version":"0.1.0"}` ✅ |
| `GET /api/trips/estimate?...` | `200 {"fare_iqd":2449,"distance_km":2.898…,"base_fare_iqd":1000,"currency":"IQD"}` ✅ **public — usable now** |
| `POST /api/auth/otp/send {phone}` | `200 {"message":"OTP sent"}` ✅ |
| `GET /api/zones` | ~~`200 []` zero zones~~ → **2026-06-07: seeded.** Returns `Central Abriyah` (abriyah_enabled) + `East Regular` in one Baghdad city ✅ **Abriyah unblocked** |
| `GET /api/zones/{bad-uuid}` | `404 {"error":"not found"}` |
| `GET /api/trips`, `GET /api/me/wallet`, `POST /api/abriyah/validate-pins` | `401` **empty body** (auth-gated as expected) |

**Contract essentials the rider app must respect:**
- **Auth:** OTP → JWT (HS256, `role=rider`, `sub=user_id`, **exp 30 days, no refresh token**). Send `Authorization: Bearer`. On `401`, re-authenticate from scratch.
- **Error envelope:** public/404 paths return `{"error":"…"}`, but **auth `401`s return an EMPTY body** — branch on the **status code**, not a body. Codes: 400 validation · 401 unauth/expired · 403 wrong role · 404 not found · 409 conflict · **402 wallet insufficient** · 429 rate-limited.
- **Money:** integer **IQD**, no decimals. `distance_km` is an unrounded float — format client-side.
- **Geo:** zone polygons are **WKT, longitude-first** (`POLYGON((lng lat, …))`, SRID 4326).
- **Realtime:** `GET /ws/subscribe?token=<jwt>&channel=<channel>` (`rt:trip:{id}` / `rt:room:{id}`). JWT is a **query param**. Frames have **no event-type field** — sniff by payload: trip frames carry `status`; captain GPS pings carry `longitude`/`latitude`; room frames carry `rider_count`/`max_riders`/`status`.
- **Pagination:** `page`/`per_page` for lists (`{items,total,…}`); `limit`/`offset` for transactions (bare array).
- **Other:** OTP limit 10/phone/10min (429); cancel penalty flat 2000 IQD *after* captain accepts (free at requested/matched); ratings editable 7 days via PUT.

## 4. Gap matrix

| Customer flow | PRD requires | Current code | Backend endpoint(s) | Integration work |
|---|---|---|---|---|
| **Onboarding** | Phone → OTP (6-digit) → gender → name | `(auth)/*` + `services/auth.ts` all mock | `POST /api/auth/otp/send`, `POST /api/auth/otp/verify` → `{token,user_id}`, `PATCH /api/riders/me` | Wire real OTP; store real JWT; `GET /api/riders/me` to hydrate; map gender `male/female`↔`m/f`; handle 429 |
| **Home** | Dual CTAs, persistent session | `(tabs)/index.tsx` | `GET /api/riders/me` | Hydrate profile via query; gate women-only on real gender |
| **Regular booking** | Pins, fare estimate, request, cancel | `destination`(real geo), `ride-options`(local fares), `searching`(sim) | `GET /api/trips/estimate` (**works now**), `POST /api/trips`, `GET /api/trips/{id}`, `POST /api/trips/{id}/cancel` | Replace local fare + mock create; subscribe `rt:trip:{id}`; cancel reason enum + penalty disclosure |
| **Live trip** | Captain card, moving pin, ETA, call/chat | `driver-assigned` + `in-progress`, 100% `mock-driver.ts` | `GET /api/trips/{id}`, **WS** `rt:trip:{id}`, `POST /api/trips/{id}/cancel`, `GET /api/rider/trips/{id}/proxy` | Replace `startMockDriver` with WS; render pin from lat/lng frames; cancel only at ACCEPTED |
| **Abriyah booking** | Zone detect, pin-in-zone, room type, per-rider fare | `intro`,`zone-select`(local zones), `pickup-dropoff`(real geo), `room-type`(mock gate) | `GET /api/zones` (**`[]` — BLOCKED**), `GET /api/zones/{id}`, `POST /api/abriyah/validate-pins`, `GET /api/trips/estimate?zone_id=` | **Blocked on zone seeding.** Replace hardcoded zones; parse WKT lng-first; validate-pins on drag-stop |
| **Waiting room** | Live count, dispatch, expire | `room-waiting` + `simulateRoom` ticker | `POST /api/abriyah/join`, **WS** `rt:room:{id}`, `GET /api/abriyah/rooms/{id}`, `DELETE /api/abriyah/leave` | Replace join+sim with real join + room WS; cancel → leave |
| **Complete & rate** | Final fare (cash), 1–5★ | `complete.tsx` + mock `rateTrip` | `POST /api/trips/{id}/ratings`, `PUT …/{rating_id}` | Wire rating; show real final `fare_iqd`; 7-day edit |
| **Trip history** | List date/fare/captain/rating | `(tabs)/trips.tsx` local store only | `GET /api/trips?status=&page=&per_page=` | Paginated query; keep local cache as offline fallback |
| **Wallet** (M3) | cash-only at M1 | none | `GET /api/me/wallet`, topup, payment-methods, transactions | Later milestone; respect 402, `masked_last4` only |
| **Scheduled / multi-stop** (M3) | deferred | none | `/api/rider/scheduled-trips`, `/api/rider/trips/{id}/stops` | Later milestone |

## 5. Recommended integration roadmap

### Phase 0 — Foundation (no UI change; unblocks everything)
- `lib/api.ts`: axios instance, `baseURL: process.env.EXPO_PUBLIC_API_URL`, `timeout 30000`. Request interceptor injects `Authorization: Bearer <token>` from `useAuthStore.getState()`. Response interceptor: on `401` with Authorization set → `useAuthStore.getState().clear()` (no refresh token). **Branch on status, not body.**
- `.env` + `app.json` extra: `EXPO_PUBLIC_API_URL=https://beeb.madebyhaithem.com`. Externalize the OSRM base URL too.
- Start using TanStack **queries** with hierarchical keys (`['riders','me']`, `['trips']`, `['trips',id]`, `['zones']`).
- Helpers: `parseApiError` (empty-body 401/402/429), integer-IQD formatter, `distance_km` rounding.

### Phase 1 — Real OTP auth
- Real `requestOtp` → `/api/auth/otp/send`; `verifyOtp` → `/api/auth/otp/verify {phone,code,name?}` → store `{token,user_id}`; `PATCH/GET /api/riders/me`. Map gender `male/female`↔`m/f`. Handle 429 + offline.
- Replaces: `services/auth.ts`. *(Independently testable now — send works.)*

### Phase 2 — Core happy path (estimate → regular booking → live trip)
- Swap fare to `GET /api/trips/estimate` (**works today**). Swap create to `POST /api/trips`; fetch `GET /api/trips/{id}`.
- Replace `mock-driver.ts` with a **WS provider** on `rt:trip:{id}` — captain pin from lat/lng frames, transitions from `status` frames. Keep OSRM only for the static route line.
- Cancel: `POST /api/trips/{id}/cancel {reason,comment?}`; enforce ACCEPTED-only + 2000 IQD penalty disclosure.
- Replaces: `services/trips.ts`, `services/mock-driver.ts`.

### Phase 3 — Abriyah (✅ DONE 2026-06-07 · live-verified 2026-06-08)
- **Live-verified 2026-06-08** with the test rider: validate-pins (in-zone), join (room `open`, per-rider fare 7,719 IQD), room detail, leave — all shapes match the client mappers.
- Zones from `GET /api/zones[/{id}]` (WKT parsed lng-first in `lib/wkt.ts`); server-side `validate-pins` on the review step; `POST /api/abriyah/join`; room realtime via `rt:room:{id}` (`services/room-socket.ts`, WS + 10s poll backstop, field-sniffed since room frames carry no `event`); `DELETE /api/abriyah/leave` on cancel.
- Done: new `services/zones.ts` + `hooks/use-zones.ts`; rewrote `services/abriyah.ts` (real join/leave/getRoom, dropped `simulateRoom`); rewired all 4 `(abriyah)/*` screens; deleted `constants/zones.ts`; decoupled `lib/point-in-polygon.ts`. On room dispatch the member trip flips to `accepted` and hands off to the existing trip channel → `driver-assigned`.
- Vehicle tiers: already absent (removed in Phase 2) — no change needed.
- `services/mock-driver.ts` retained: only its `cancelActiveSim` is still referenced (defensively, by the regular-booking screens); the room/driver simulators it also exports are now dead but harmless.

### Phase 4 — History & ratings
- `GET /api/trips?…` paginated history; rating POST + 7-day PUT edit.
- Replaces: `rateTrip`, the local-only source in `(tabs)/trips.tsx`.

### Phase 5 — Wallet & scheduled/multi-stop (M3) — ✅ COMPLETE 2026-06-08
- **Phase 5a — Wallet: ✅ DONE 2026-06-07.** `services/wallet.ts` + hooks (`use-wallet`, `use-payment-methods`, `use-transactions`) + `app/(wallet)/` screens (home/top-up/payment-methods), linked from Profile. Balance, top-up (cash + card via MockGateway, preset chips), card-on-file CRUD (add/default/delete), transaction ledger (infinite scroll). Respects 402/400; `masked_last4` only; `gateway_token` never read. Spec: `docs/superpowers/specs/2026-06-07-wallet-design.md`; plan: `docs/superpowers/plans/2026-06-07-wallet.md`. **✅ Live-verified 2026-06-08** with the test rider: wallet auto-provision, cash top-up (10k→balance), card add (`masked_last4:"4242"`, no `gateway_token`), card top-up, bad-amount→400.
- **Phase 5b — Scheduled trips: ✅ DONE 2026-06-07.** `services/scheduled-trips.ts` + hooks (`use-scheduled-trips`) + `app/(scheduled)/create.tsx` (pickup/dropoff via `LocationPicker`/`FromToReview` → `when-picker`) + Trips-tab Upcoming/Past segments with a Schedule FAB, reschedule modal, and cancel. `@react-native-community/datetimepicker` clamps `scheduled_for` to now+30min..now+7d (regular only); promoted trips hydrate the active trip (`getTrip` + `setActive`) and deep-link to the live screen. Respects 400/403/409. Spec: `docs/superpowers/specs/2026-06-07-scheduled-trips-design.md`; plan: `docs/superpowers/plans/2026-06-07-scheduled-trips.md`. **✅ Live-verified 2026-06-08** with the test rider: create (pending), list, reschedule (time updated), cancel (→cancelled), and the 30min–7d window guard (now+5min→400).
- **Phase 5c — Multi-stop: ✅ DONE 2026-06-08.** `services/trip-stops.ts` + `hooks/use-trip-stops.ts` (10s poll while live + add mutation) + `components/trip/stops-panel.tsx` (numbered pending/reached/skipped list + Add-stop) on both live-trip screens (`driver-assigned`/`in-progress`); `TripMap` gained a `stops` marker prop. Add opens the existing `LocationPicker`; max 3, regular-only (Abriyah hides the button). Respects 409 (max)/400 (wrong state). Spec: `docs/superpowers/specs/2026-06-08-multi-stop-design.md`; plan: `docs/superpowers/plans/2026-06-08-multi-stop.md`. **Live-verified 2026-06-08 (rider scope):** GET stops → `[]`; POST on a `requested` trip → `400 "Trip must be accepted or in_progress to add stops"` (state guard). **Full add happy-path (stop on an accepted trip, captain marks reached) needs the captain side — rider cannot accept (403), so it is not drivable from this app alone.**
- FCM via `POST /api/me/fcm-token` once push is added (needs a custom dev build).

## 6. Risks & open decisions

- **Vehicle tiers don't exist in the backend.** The app has `beeb_go/comfort/xl`; the backend is single-fare per zone/city. **Decision:** keep tiers as cosmetic-only (one estimate for all) or drop them.
- ~~**Empty zones (hard blocker).**~~ **RESOLVED 2026-06-07** — staging/prod seeded with an `abriyah_enabled` + a `regular_only` zone in one Baghdad city, plus 2 approved/online captains and a test rider (`scripts/seed_staging.sh`). Abriyah is now fully testable E2E.
- **WS vs FCM in Expo Go.** PRD says FCM push drives transitions; FCM needs a custom dev build (not Expo Go). **Recommendation:** use **WebSocket** for live trip/room state at M1 (works in Expo Go); defer FCM to a custom build. **2026-06-07:** trip/captain-location frames now carry an additive `event` discriminator (`trip_update`/`captain_location`); **room (`rt:room:*`) frames still don't** — field-sniff (`rider_count`/`status`) for the Phase 3 room socket.
- **`validate-pins` is auth-gated** while `estimate` is public — confirm with backend whether pin validation also needs seeded zones.
- **No refresh token / 30-day JWT** — on expiry the user drops to OTP login. Confirm UX.
- **OSRM** is the public demo server (rate-limited, no SLA). Confirm production routing source.
- **RTL** — Arabic-primary. New map overlays/callouts/fare rows/progress bars need RTL-aware layout (invoke the `react-native-rtl-positioning` skill when building those).
