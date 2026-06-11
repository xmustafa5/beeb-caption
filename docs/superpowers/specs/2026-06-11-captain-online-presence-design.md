# Captain App — Area 3: Online Toggle, Location & Real-time — Design

> Spec for the third build area of the Beeb Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-11. Grounded in the Captain App PRD (§3.4 Online Toggle, §4.5 idle timeout,
> §4.7 offline ping queue), the backend handoff (`docs/frontend-summary.md` → Real-Time Delivery /
> Captain App), the live OpenAPI spec, and live probes against `https://beeb.madebyhaithem.com`
> (2026-06-11, test captain `9647000000098`). Builds on Area 2 (an activated captain reaches the
> online toggle).

## 1. Goal

An **activated** captain can go **online**: the app marks them online server-side, streams their GPS
every ~10s (queuing pings across network drops and flushing on reconnect), and holds a
`/ws/captain` WebSocket for the captain's location echo + active-trip frames. A connection-health
indicator reflects live/stale/offline. The realtime lifecycle is owned by a single
`CaptainPresenceProvider` so Areas 4 (trip queue) and 5 (live trip) consume the same socket.

Foreground-only GPS for v1; FCM push deferred (needs a dev build).

## 2. Scope

**In scope**
- `services/captain-location.ts`: online toggle + location ping/flush/read.
- `services/captain-socket.ts`: a framework-agnostic `/ws/captain` client (keep-alive, reconnect, frame parsing).
- `providers/captain-presence.tsx`: context owning online state, the GPS ping loop, the offline
  queue, the socket, connection health, and the latest parsed frames (offer + trip_update) exposed for Areas 4/5.
- Mount the provider in `app/(tabs)/_layout.tsx`.
- Extend the Area 2 activated card with the **online toggle** + connection-health pill.
- EN + AR i18n under `captain.online.*`; RTL-aware.

**Out of scope (later areas / tasks)**
- Rendering the trip queue (Area 4) or live trip (Area 5) — the provider only *exposes* frames; no queue/trip UI here.
- FCM push registration + background offer delivery + deep-linking (deferred task; needs a dev build).
- **Background location** (app minimized) — foreground-only for v1; deferred per roadmap (needs
  expo-location background mode + config plugin + dev build).
- Admin staleness/stuck-item handling (admin surface).

## 3. Backend contract (verified live 2026-06-11)

Captain Bearer token. Operational endpoints require the captain be **approved** (Area 1) and online
requires **activated today** (Area 2).

| Endpoint | Behavior (verified) |
|---|---|
| `PUT /api/captain/online {online: bool}` | → `200 {ok:true}`. Going online **enforces today's activation gate** → `403` if not activated. Going offline always allowed. (Verified: 200 online true/false with the activated test captain.) |
| `POST /api/captain/location {longitude, latitude}` | → `200 {captain_id, longitude, latitude, last_ping_at, online}`. Sets the captain **online** (presence) + fans out. Coords out of `[-180,180]`/`[-90,90]` → **400**. (Verified: 200 valid; 400 out-of-range.) Pings do not write audit rows. |
| `POST /api/captain/location/flush {pings: [{longitude, latitude}, ...]}` | → `200 CaptainLocationResponse`. On reconnect, submit the queued pings; backend stores **only the last** (last-known policy). Empty list → 400. |
| `GET /api/captain/location` | → `200 CaptainLocationResponse` (or **404** if the captain has never pinged). Used on launch to re-derive online intent. (Verified: 200 after a ping.) |
| `GET /ws/captain?token=<jwt>` | WebSocket upgrade. Subscribes to the captain's own location channel + active-trip channel; forwards Redis events as JSON text frames. Non-captain token → 403; bad token → 401. (Endpoint live; full handshake hit an edge 429 during probing — connection logic built to the documented contract + CLAUDE.md WS pattern.) |

**CaptainLocationResponse** fields: `{ captain_id, longitude, latitude, last_ping_at (RFC3339), online (bool) }`.

### 3.1 WebSocket frame contract (captain socket)

No envelope; correlate by `(channel, payload fields)`. High-traffic frames carry an **additive `event`**:
- **`captain_location`** — `{ event, captain_id, longitude, latitude, last_ping_at, online }` (the captain's own echo).
- **`trip_update`** — the trip lifecycle object `{ event, id, rider_id, status, fare_iqd, distance_km }` (watch `status`).
- Offer broadcasts on `rt:captain:{id}` — `{ trip_id, captain_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_iqd, distance_km }` (no `event` discriminator guaranteed; **field-sniff** by `trip_id` + `pickup_lat`).

Parsing strategy: prefer `event` when present; else field-sniff (`longitude`/`latitude` → location; `status` → trip lifecycle; `pickup_lat`+`trip_id` → offer). Tolerate unknown extra keys. **Client→server frames are ignored** by the backend; the socket is read-only (all actions are REST). Send a WS Close to disconnect.

### 3.2 Staleness (PRD §4.5)

The backend force-offlines an online captain after **5 min** with no ping (60s sweep). The client
should show a "stale" indicator at ~60s of no location echo and treat the captain as effectively gone
at 5 min. The client's own ping loop (~10s) keeps presence alive while foregrounded.

## 4. Architecture — units

### 4.1 `services/captain-location.ts` (new)

```ts
export interface CaptainLocation {
  captainId: string
  longitude: number
  latitude: number
  lastPingAt: string
  online: boolean
}

export interface PingCoords { longitude: number; latitude: number }

setOnline(online: boolean): Promise<void>            // PUT /api/captain/online {online}; throws on 403
pingLocation(c: PingCoords): Promise<CaptainLocation> // POST /api/captain/location
flushPings(pings: PingCoords[]): Promise<CaptainLocation> // POST /api/captain/location/flush
getLocation(): Promise<CaptainLocation | null>       // GET /api/captain/location; 404 → null
```

- A `toCaptainLocation(backend)` snake→camel mapper. `getLocation` catches a 404 and returns `null`
  (never-pinged is not an error). `setOnline` lets a 403 propagate for the caller to surface.

### 4.2 `services/captain-socket.ts` (new — framework-agnostic)

A small class `CaptainSocket` (no React), following the CLAUDE.md WebSocket pattern:

```ts
type ConnState = 'connecting' | 'open' | 'closed'

interface CaptainSocketHandlers {
  onLocationEcho?: (loc: { longitude: number; latitude: number; lastPingAt?: string; online?: boolean }) => void
  onTripUpdate?: (trip: { id: string; status: string; [k: string]: unknown }) => void
  onOffer?: (offer: { tripId: string; [k: string]: unknown }) => void
  onState?: (state: ConnState) => void
}

class CaptainSocket {
  constructor(token: string, handlers: CaptainSocketHandlers)
  connect(): void   // opens ${WS_BASE_URL}/ws/captain?token=...
  close(): void     // clean close; stops reconnect
}
```

- **Keep-alive:** a 25s timer sends a WS ping frame (or a no-op text frame) to hold the connection
  (the backend ignores client frames; this is just to keep intermediaries from idling the socket).
- **Reconnect:** exponential backoff 1s → 30s on unexpected close, reset on a successful open.
  `close()` cancels reconnection.
- **Frame parsing:** JSON-parse each text frame; route by `event` then field-sniff (§3.1). Unknown
  frames are ignored. Never throws on a bad frame (log in `__DEV__` only).
- Token is read once at construction (the WS URL needs it as a query param — `WS_BASE_URL` from `lib/api.ts`).

### 4.3 `providers/captain-presence.tsx` (new)

`CaptainPresenceProvider` (React context) + `useCaptainPresence()` hook. Mounted once in the tabs
layout so it persists across tab switches and is the single owner of the realtime session.

```ts
type ConnectionHealth = 'offline' | 'connecting' | 'live' | 'stale'

interface CaptainPresence {
  online: boolean
  connection: ConnectionHealth
  goingOnline: boolean          // PUT in flight
  error: string | null          // last setOnline error key (e.g. permission / 403)
  setOnline: (online: boolean) => Promise<void>
  // Exposed for Areas 4/5 (read-only):
  lastTripUpdate: { id: string; status: string } | null
  lastOffer: { tripId: string } | null
}
```

Internals (all in the provider, in-memory — not persisted):
- **Going online** (`setOnline(true)`): request foreground location permission (via `expo-location`);
  if denied → set `error: 'permission'`, stay offline. Else `setOnline(true)` REST (403 → `error`,
  stay offline) → start the **ping loop** + open the **socket** → `online = true`.
- **Ping loop:** a `~10s` interval that reads the current position (an `expo-location`
  `watchPositionAsync` subscription feeds the latest coords; the interval posts the latest via
  `pingLocation`). If a ping fails because the network is down, push the coords onto an **offline
  queue**; on the next successful connection, `flushPings(queue)` and clear it. (Use the same
  `expo-location` API the existing `use-current-location` hook uses; the provider manages its own
  subscription lifecycle rather than reusing that always-on hook.)
- **Socket:** `new CaptainSocket(token, handlers)`; `onState` maps to `connection`
  (connecting/live); `onLocationEcho` refreshes a "last echo at" timestamp; `onTripUpdate`/`onOffer`
  update the exposed fields. A **stale timer** flips `connection` to `'stale'` after ~60s with no
  echo; a fresh echo restores `'live'`.
- **Going offline** (`setOnline(false)`): `setOnline(false)` REST (best-effort), stop the ping loop +
  location subscription, `close()` the socket, clear the queue → `online = false`, `connection = 'offline'`.
- **On mount / launch:** call `getLocation()`. If it returns `online: true` and `last_ping_at` is
  within 5 min → **resume** (re-run the online startup without re-toggling). Otherwise start offline.
- **Cleanup on unmount:** stop loop, remove subscription, close socket.

> **Online vs. socket health are independent.** `online` is true once the `PUT /online` succeeds and
> the ping loop is running — that is what makes the captain dispatchable server-side (presence comes
> from pings, not the socket). The WebSocket is purely a *receive* channel for echoes/offers/trip
> frames; if it fails to open or drops, the captain stays **online** and `connection` reflects the
> socket health (`connecting`/`stale`) separately. So a socket problem never silently takes the
> captain offline — only an explicit toggle-off or the backend's 5-min ping staleness does.

### 4.4 `app/(tabs)/index.tsx` (extend Area 2)

On the **activated** ready card, replace the "online coming soon" placeholder line with the **online
toggle**:
- An RN `<Switch>` (online ↔ offline) bound to `useCaptainPresence()`. `onValueChange` →
  `setOnline(v)`. Disabled while `goingOnline`.
- A **connection-health pill** next to it: offline (grey) / connecting (amber, spinner) / live
  (green) / stale (amber "reconnecting"). Text from `captain.online.*`.
- A small hint line: "GPS shared every 10s while online" / on `error` show the permission/403 message.
- The not-activated path is unchanged (no toggle until activated — already gated).

### 4.5 `app/(tabs)/_layout.tsx` (modify)

Wrap the existing `<PagerView>` + `<CustomTabBar>` tree in `<CaptainPresenceProvider>` so the session
persists across tabs. No other layout change.

### 4.6 i18n — `captain.online.*` (EN + AR)

Keys: `toggleLabel`, `online`, `offline`, `connecting`, `live`, `stale`, `gpsHint`,
`permissionNeeded`, `notActivated` (defensive 403), `onlineFailed`.

## 5. Data flow

```
activated home → <Switch> on → presence.setOnline(true)
  → request FG location permission (denied → error 'permission', stay offline)
  → PUT /api/captain/online {online:true}  (403 → error 'notActivated', stay offline)
  → start watchPosition + 10s ping loop (POST /location)  +  open /ws/captain socket
  → socket 'open' → connection 'connecting' → first captain_location echo → 'live'
  → no echo ~60s → 'stale';  network drop → queue pings → reconnect → flushPings + reopen
toggle off → PUT online:false → stop loop + close socket → 'offline'
launch/mount → GET /location → (online && last_ping_at <5min) ? resume : offline
trip_update / offer frames → parsed + exposed via context (Areas 4/5 consume; not rendered here)
```

## 6. Error handling

Via `parseApiError`.

| Case | UX |
|---|---|
| Location permission denied | Can't go online; `error: 'permission'` hint; Switch stays off. |
| `PUT /online` 403 (not activated) | Defensive (gate should prevent); `error: 'notActivated'`; stay offline. |
| `POST /location` 400 (bad coords) | Skip that ping; keep the loop running (don't toggle offline). |
| `POST /location` network fail | Queue the ping; flush on reconnect. |
| WS unexpected close | Reconnect (backoff); `connection: 'connecting'`/`'stale'`; no user error. |
| 401 anywhere | Interceptor clears session → AuthGate → login. |

## 7. i18n / RTL

Arabic-primary. Invoke the `react-native-rtl-positioning` skill for the toggle row + health pill
(`flexDirection` ternary, no physical margins). The RN `<Switch>` is direction-agnostic; the row
ordering (label / switch / pill) flips via `flexDirection: isRTL ? 'row-reverse' : 'row'`.

## 8. Verification (no unit-test runner)

Test captain: `9647000000098` / `16001600` (approved + activated today).

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (verified 2026-06-11): `PUT /online {online:true}` → 200; `POST /location` (Baghdad) → 200
  `online:true`; `GET /location` → 200; out-of-range coords → 400; `PUT /online {online:false}` → 200.
- WS: handshake endpoint reachable (full frame capture deferred — hit an edge 429 while probing; the
  socket is built to the documented frame contract). A best-effort live WS smoke (open + receive one
  `captain_location` echo) can be run when not rate-limited.
- Manual (Expo Go): on the activated home, flip the Switch → permission prompt → online; observe
  pings posting (dev network log) and the health pill going live; flip off → offline.

## 9. Open dependencies / notes

1. **Reuse** `WS_BASE_URL` (`lib/api.ts`) and the `expo-location` API (already a dep). The existing
   `use-current-location` hook is NOT reused directly (its watch is tied to its own mount); the
   provider manages its own subscription so it starts/stops with online state.
2. **FCM deferred** — `POST /api/me/fcm-token` + background offer push + tap deep-linking is a later
   task; WS (foreground) covers offers/trip frames for v1. Documented as a known gap.
3. **Background location deferred** — foreground-only; the backend's 5-min staleness sweep offlines a
   backgrounded captain, which is acceptable for v1.
4. **Frames exposed, not rendered** — `lastOffer`/`lastTripUpdate` on the context are the seam for
   Areas 4/5; this area renders only the toggle + health.
