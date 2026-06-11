# Captain App — Area 5: Live Trip Legs — Design

> Spec for the fifth build area of the Beeb Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-11. Grounded in the Captain App PRD (§3.6 Live Trip), the backend handoff
> (`docs/frontend-summary.md` → Regular Trips / Abriyah / Privacy), the live OpenAPI spec, and live
> probes against `https://beeb.madebyhaithem.com`. Replaces the Area 4 placeholder
> `app/(trip)/[id].tsx` with the real driving screen. Consumes Area 3's `lastTripUpdate`.

## 1. Goal

Drive an accepted trip to completion: a map + a status-driven action button
(arrive → start → complete), masked call, navigate-out, cancel (accepted-only), an Abriyah member
roster, a (gated) multi-stop reach panel, and a completion summary with an optional captain→rider
rating. Status syncs from `GET /api/trips/{id}` on mount + Area 3 `lastTripUpdate` WS frames.

## 2. Scope

**In scope**
- `services/captain-trips.ts`: getTrip, arrive, start, complete, cancel, getProxy, rateRider.
- `services/abriyah-members.ts`: getRoomMembers (Abriyah roster).
- `services/captain-stops.ts`: reachStop + a `getStops` that is **inert until the backend gap closes**
  (BACKEND_ISSUES #7 — no captain stops-list endpoint exists yet).
- `hooks/use-live-trip.ts`: GET-on-mount query + `lastTripUpdate` merge + leg mutations (optimistic + refetch).
- Rework `app/(trip)/[id].tsx` into the live screen (map + staged button + action bar + roster/stops + completion).
- Components: `trip-action-bar` (call/navigate/cancel), `cancel-sheet` (reason), `rating-stars`,
  `member-roster` (Abriyah), `stops-list` (gated).
- EN + AR i18n under `captain.live.*`; RTL-aware.

**Out of scope (later / gap)**
- **Multi-stop "reached" is built but inert** — the captain cannot list stop ids (BACKEND_ISSUES #7).
  The `stops-list` panel renders only if a stop source exists; until the backend adds a captain
  stops-list (or embeds stops in the Trip), it shows nothing. Wiring is in place for a one-line activation.
- In-app chat (no backend endpoint — masked call only).
- Earnings (Area 6).

## 3. Backend contract (verified live 2026-06-11)

Captain Bearer token. Identity from the JWT.

| Endpoint | Behavior (verified) |
|---|---|
| `GET /api/trips/{id}` | → `200 Trip`. Source of truth on mount. No `stops` field embedded. |
| `POST /api/trips/{id}/arrive` | → `200` (cue only — **no status change**). Verified. |
| `POST /api/trips/{id}/start` | → `200` (`accepted → in_progress`). Verified. |
| `POST /api/trips/{id}/complete` | → `200` (`in_progress → completed`; charges the rider best-effort). Verified. |
| `POST /api/trips/{id}/cancel` | body `CancelTripDto { reason (required), comment? }`. Captain allowed from `requested`/`accepted` **only** (not in_progress) → else 400. Reason enum (captain-relevant subset of): `changed_mind, wait_too_long, wrong_pickup, safety, other`. |
| `GET /api/captain/trips/{id}/proxy` | → `200 ProxySession { rider_proxy_number, captain_proxy_number, provider, expires_at, ... }`. Masked `+964…` numbers; lazily allocated; trip must be `accepted`/`in_progress` + have a captain (else 409). Verified: `captain_proxy_number:"+964701…"`. |
| `POST /api/trips/{id}/ratings` | body `CreateRatingDto { stars (1-5, required), comment? }` → 201 Rating. One per rater per trip (409 repeat); only after completion. |
| `GET /api/abriyah/rooms/{id}/members` | → `{ room_id, members: [{ rider_id, name, phone, pickup_wkt, dropoff_wkt, fare_iqd, distance_km, joined_at }] }`. Assigned captain only (403 otherwise). |
| `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach` | body `ReachStop { reached_at? }` → TripStop `status:"reached"`. **Captain has no way to LIST stops (gap #7).** |

**Trip** (key fields): `id, trip_type ("regular"|"abriyah"), status, rider_id, captain_id?, zone_id?, room_id?, pickup_lat/lng, dropoff_lat/lng, fare_iqd, distance_km, fare_per_rider_iqd?, cancellation_reason?, requested_at, accepted_at?, started_at?, completed_at?, cancelled_at?, version`.

### 3.1 Verified leg sequence (live, 2026-06-11)

On a real accepted trip (`b96dc406-…`): GET → `accepted` → `arrive` 200 → `start` 200 (→in_progress)
→ `proxy` 200 (masked numbers) → `complete` 200 (→completed, `completed_at` set). The whole flow the
screen drives is confirmed against prod.

## 4. Architecture — units

### 4.1 `services/captain-trips.ts` (new)

```ts
export type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
export type TripType = 'regular' | 'abriyah'

export interface Trip {
  id: string
  tripType: TripType
  status: TripStatus
  riderId: string
  captainId?: string | null
  roomId?: string | null
  pickupLat: number; pickupLng: number
  dropoffLat: number; dropoffLng: number
  fareIqd: number
  distanceKm: number
  cancellationReason?: string | null
  completedAt?: string | null
}

export interface ProxySession {
  riderProxyNumber: string
  captainProxyNumber: string
  expiresAt: string
}

export type CancelReason = 'changed_mind' | 'wait_too_long' | 'wrong_pickup' | 'safety' | 'other'

getTrip(id): Promise<Trip>                                  // GET /api/trips/{id}
arriveTrip(id): Promise<void>                               // POST .../arrive
startTrip(id): Promise<void>                                // POST .../start
completeTrip(id): Promise<void>                             // POST .../complete
cancelTrip(id, reason: CancelReason, comment?): Promise<void> // POST .../cancel
getProxy(id): Promise<ProxySession>                         // GET /api/captain/trips/{id}/proxy
rateRider(id, stars: number, comment?): Promise<void>       // POST .../ratings
```

### 4.2 `services/abriyah-members.ts` (new, small)

```ts
export interface RoomMember { riderId: string; name: string; fareIqd: number; distanceKm: number }
getRoomMembers(roomId): Promise<RoomMember[]>   // GET /api/abriyah/rooms/{id}/members
```

(WKT pickup/dropoff are not parsed for v1 — the roster shows name + fare + distance only.)

### 4.3 `services/captain-stops.ts` (new, small — gated)

```ts
export interface TripStop { id: string; lat: number; lng: number; seq: number; status: string; reachedAt?: string | null }
getStops(tripId): Promise<TripStop[]>     // NO captain endpoint yet (gap #7) → returns [] for now
reachStop(tripId, stopId): Promise<void>  // POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach
```

> `getStops` currently returns `[]` (there is no captain stops-list endpoint — BACKEND_ISSUES #7). The
> implementation is a single stub returning `[]` with a comment pointing at the gap; when the backend
> ships the endpoint, `getStops` becomes one real `api.get` call and the `stops-list` panel activates.
> `reachStop` is fully wired and ready.

### 4.4 `hooks/use-live-trip.ts` (new)

```ts
useLiveTrip(id): {
  trip: Trip | undefined
  isLoading: boolean
  arrived: boolean              // local cue flag (arrive has no status change)
  arrive(): Promise<void>
  start(): Promise<void>
  complete(): Promise<void>
  cancel(reason, comment?): Promise<void>
  busy: boolean                 // any leg mutation in flight
}
```

- `useQuery(['trip', id], () => getTrip(id))` — GET on mount, source of truth.
- An effect: when `useCaptainPresence().lastTripUpdate?.id === id`, patch the cached trip's `status`
  (`queryClient.setQueryData`) — covers a rider/admin cancel arriving over WS.
- Leg mutations call the service, optimistically set status where deterministic (start→in_progress,
  complete→completed), and `invalidateQueries(['trip', id])` on settle. `arrive` sets a local
  `arrived` flag (no status change).

### 4.5 `app/(trip)/[id].tsx` (rework the placeholder)

The live screen, branching on `trip.status` + `trip.tripType`:
- **Map** (top ~55%): `trip-map` with `driver` = captain's `useCurrentLocation`, `pickup`, `dropoff`,
  `routeCoords` from `services/routing.ts` (OSRM, captain→pickup pre-start, pickup→dropoff post-start),
  `stops` if any.
- **Info card + staged action button** (bottom sheet-ish): fare, distance; the **single primary
  button** (status-driven):
  - `accepted` + !arrived → "Arrived at pickup" (arrive).
  - `accepted` + arrived → "Start trip" (start).
  - `in_progress` → "Complete trip" (complete).
  - `completed` → **completion summary** (fare collected) + **rating-stars** (optional) + Done → back to queue.
  - `cancelled` (from WS or own cancel) → "Trip cancelled" + back to queue.
- **`trip-action-bar`**: Call (proxy → `tel:`), Navigate (Google Maps / Waze deep-link), Cancel
  (only when `status==='accepted'` → `cancel-sheet`). **Navigate target = pickup while
  `status==='accepted'`, dropoff once `in_progress`** (the captain is driving to pickup pre-start,
  to dropoff post-start). The deep-link uses `https://www.google.com/maps/dir/?api=1&destination=lat,lng`
  (and a Waze `https://waze.com/ul?ll=lat,lng&navigate=yes` alternative if offered as two buttons; v1
  may ship Google Maps only and add Waze if trivial).
- **Abriyah** (`tripType==='abriyah'` + `roomId`): a `member-roster` panel.
- **Multi-stop** (`stops.length > 0`): a `stops-list` with per-stop "Reached" → `reachStop`. **Inert
  until gap #7** (`getStops` returns `[]`, so the panel is hidden).

### 4.6 Components (new)

- `components/captain/trip-action-bar.tsx` — Call / Navigate / Cancel row (RTL).
- `components/captain/cancel-sheet.tsx` — reason chips (the `CancelReason` enum) + optional comment + confirm.
- `components/captain/rating-stars.tsx` — 1–5★ tappable + submit/skip.
- `components/captain/member-roster.tsx` — Abriyah member rows.
- `components/captain/stops-list.tsx` — numbered stop rows + "Reached" (gated).

### 4.7 i18n — `captain.live.*` (EN + AR)

Keys: leg labels (`arrivedAtPickup`, `startTrip`, `completeTrip`), `navigate`, `call`, `cancel`,
`cancelTitle`, reason labels (`reason_changed_mind`, …), `cancelConfirm`, `completedTitle`,
`fareCollected`, `rateRider`, `submitRating`, `skip`, `cancelledTitle`, `cancelledBody`, `done`,
`riders` (roster), `stop`, `reached`, error keys (`legFailed`, `cancelFailed`, `callFailed`).

## 5. Data flow

```
mount → getTrip(id) → render by status + trip_type
  lastTripUpdate(id match) → setQueryData status; if 'cancelled' → cancelled screen
  button: accepted(!arrived) → arrive → accepted(arrived) → start → in_progress → complete → completed
  completed → summary + optional rateRider → Done → router back to queue
  Call → getProxy → Linking.openURL('tel:'+captainProxyNumber)
  Navigate → Linking.openURL(maps/waze deep-link to current target coords)
  Cancel (accepted only) → cancel-sheet(reason) → cancelTrip(id,reason) → back to queue
  Abriyah → getRoomMembers(roomId) roster
  stops (gap-gated) → reachStop per stop
```

## 6. Error handling

Via `parseApiError`.

| Status | Context | UX |
|---|---|---|
| 400 | leg (wrong state) | "Couldn't update the trip" + refetch (the status corrects). |
| 400 | cancel (not cancellable) | Hide cancel + refetch. |
| 409 | proxy (wrong state / no captain) | "Calling isn't available yet." |
| 409 | rating (already rated) | Treat as done (proceed to Done). |
| 403 | members (not assigned) | Hide roster. |
| 401 | any | Interceptor → login. |
| 429 / network | any | standard keys. |

## 7. i18n / RTL

Arabic-primary. Invoke the `react-native-rtl-positioning` skill for the action bar, cancel sheet,
rating row, roster, stops, and completion card (flexDirection ternary, no physical margins). The map
overlay/info card is RTL-aware. IQD via `format-currency`.

## 8. Verification (no unit-test runner)

Test captain `9647000000098` / rider `9647000000099`.

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (**already verified the core legs 2026-06-11**): GET → accepted; arrive 200; start 200
  (in_progress); proxy 200 (masked); complete 200 (completed). Cancel + rating verified on a fresh
  accepted trip during build (paced for 429). Abriyah roster needs a seeded Abriyah trip with the
  captain assigned (best-effort).
- Manual (Expo Go): accept a trip (Area 4) → live screen → arrive → start → complete → summary →
  rate → Done; Call opens dialer with masked number; Navigate opens maps; Cancel (accepted) returns.

## 9. Open dependencies / notes

1. **Multi-stop reach is gated on BACKEND_ISSUES #7** (no captain stops-list). `getStops` returns `[]`;
   the panel is hidden until the backend ships the endpoint, then it's a one-line activation.
2. **Cancel reason enum** — using the captain-relevant subset (`changed_mind, wait_too_long,
   wrong_pickup, safety, other`); the backend accepts the full rider enum, these are the ones a captain
   would pick.
3. **Abriyah roster** WKT pickup/dropoff not parsed for v1 (name + fare + distance shown).
4. **lastTripUpdate seam** (Area 3) drives live status (esp. a rider/admin cancel); GET is the mount
   source of truth.
