# Beep Backend — API Handoff for Client Teams

Cross-team handoff for the **Customer App**, **Captain App**, and **Admin Dashboard** teams. This is the API-contract summary; full request/response schemas live in Swagger UI (`http://localhost:3000/swagger-ui`) and the OpenAPI spec, generated from the utoipa annotations.

> Per `.claude/rules/planning.md`, this file is updated after EACH phase completes, not batched. **All 13 phases (0–12) are Live** — this is the implemented contract, not a forward plan.

---

## Getting Started (read this first)

- **Base URL.** All REST endpoints are under `/api` (a few WebSocket endpoints are at the root `/ws/...` — see [WebSocket frame contract](#websocket-frame-contract)). The host depends on environment:
  - Local dev: `http://localhost:3000`
  - Staging: `https://<staging-host>` _(fill in your deployed host; the API serves plain HTTP behind a TLS-terminating proxy, so clients always use `https://` in deployed environments)_
  - Production: `https://<prod-host>`
- **OpenAPI / Swagger.** The full, always-current request/response schema for every REST endpoint is at `GET /swagger-ui` (interactive) and the raw spec at `GET /api-docs/openapi.json`. **Import that spec into Postman or an API codegen tool** (e.g. openapi-generator, orval, swagger-codegen) to generate typed clients — it is the source of truth and supersedes any prose in this file where they disagree. This file is the narrative/flow overview; the spec is the field-level contract.
- **Auth.** Every protected endpoint takes `Authorization: Bearer <jwt>`. There are three token kinds (rider, captain, admin) — see [Auth model](#auth-model-phase-1--live). WebSocket upgrades can't send headers, so they take the JWT as a `?token=` query param instead.
- **Content type.** Request bodies are JSON (`Content-Type: application/json`). The API itself has **no multipart/file-upload endpoint** — captain document images are uploaded **directly to storage** via a backend-issued presigned PUT URL, then referenced by object key (see [Captain document upload](#captain-document-upload-important-for-the-captain-app)).
- **Error envelope.** Every error response is a single-field JSON body `{ "error": "<human-readable message>" }`. There is no `message` field, no error `code` field, no nested structure. Status codes: `400` validation, `401` unauthenticated/expired/revoked token, `403` wrong role / not your resource, `404` not found, `409` conflict (duplicate, optimistic-lock loss, illegal state transition), `402` payment required (insufficient wallet balance / gateway reject), `429` rate-limited at the edge. Detail lives in the `error` string, e.g. `{ "error": "bad request: rate limited: too many OTP requests" }`.
- **Edge limits (enforced by the gateway, apply to every request).**
  - **Rate limit:** ~50 requests/second per client IP, burst 100. Exceeding it returns HTTP `429` (no JSON body guaranteed from the limiter layer). Back off and retry. High-frequency captain GPS pings stay well under this; design polling loops accordingly.
  - **Body size:** request bodies over **2 MiB** are rejected.
  - **Security headers** are present on every response (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`) — no client action needed, noted for completeness.
- **Money & units.** All money is **integer IQD** (Iraqi Dinar), no decimals/cents. Distances are kilometres (float). Coordinates are WGS84 lat/lng floats. Geo polygons are WKT, **longitude-first** (`POLYGON((lng lat, ...))`), SRID 4326.
- **Time.** Timestamps are RFC3339 / ISO-8601 (`TIMESTAMPTZ`). "Daily" semantics (captain daily activation, dashboard "today") roll over at **Asia/Baghdad midnight**, not UTC.

## Pagination conventions (three schemes — check per endpoint)

The API uses **three** pagination styles depending on the endpoint family. This is a known inconsistency; until it is unified, use the right one per endpoint (the Swagger spec lists the exact params for each):

| Scheme | Query params | Response wrapper | Used by (examples) |
|-|-|-|-|
| Page / per-page | `?page=&per_page=` (page 1-based; `per_page` default varies) | `{ items: [...], total, page, per_page }` | captains list, customers, trips list, admin rooms, payment methods |
| Page / page-size | `?page=&page_size=` (`page` default 1, `page_size` default 50, max 200) | `{ rows: [...], total, page, page_size, ... }` | daily-activation log (`/api/admin/activations`) |
| Limit / offset | `?limit=&offset=` | bare array `[...]` (newest-first) or capped list | transactions, scheduled-trips (admin), reports `limit`, search (`limit` only, capped 50) |

Rule of thumb: **list endpoints that return a `{ items, total }` wrapper use `page`/`per_page`; ledger/feed endpoints that return a bare array use `limit`/`offset`; the activation log is the one `page`/`page_size` outlier.** Always confirm against Swagger for a specific endpoint.

---

## Platform foundation (Phase 0 — Live)

No client-facing endpoints change in Phase 0; this is infrastructure the later phases build on. What client teams should know:

- **PostGIS active** — zone polygon containment / validity queries are available from Phase 2 onward (polygons exchanged as WKT).
- **Redis added** — backs pub/sub real-time fan-out and durable job queues. Clients never talk to Redis directly; only to the backend (HTTP now, WebSocket from Phase 7).
- **WebSocket hub initialized, no WS endpoint yet** — the `WsHub` is wired into app state, but the HTTP upgrade handler (`/ws/captain`, trip/room channels) ships in Phase 7. Do not attempt WS connections before then.
- **EventBus + audit trail** — every domain state transition will write an `audit_log` row and publish to its `rt:*` Redis channel. Audit data starts accumulating from Phase 1 (first domain that emits events). No public read endpoint for audit yet (admin audit views land with Phase 8).
- **Error envelope** — all errors return `{ "error": "<message>" }` with conventional status codes (400 validation, 401 unauthenticated, 403 wrong role, 404 not found, 409 conflict, 500 internal). This contract is stable from Phase 0.
- **Live endpoints today:** `GET /api/health` and the pre-existing `/api/users` CRUD stub (the real user model lands in Phase 1). Swagger UI: `http://localhost:3000/swagger-ui`.

---

## Auth model (Phase 1 — Live)

- **Riders:** phone + password. OTP is used **only** to prove phone ownership for registration and password reset — it never logs anyone in.
  - `POST /api/auth/otp/send` — body `{ "phone": "9647501234567" }` (international, with or without leading `+`, 10–15 digits). We generate a 6-digit code, store a hash, and deliver via OTPIQ (or log it in dev/MockSms). Response `200 { "message": "OTP sent" }`. Rate-limited to 10 sends per phone per 10 min (429-class → `400 { "error": "bad request: rate limited: too many OTP requests" }`). Used by riders **and** captains, for **both** registration and password reset.
  - `POST /api/auth/otp/verify` — body `{ "phone", "code", "purpose" }` where `purpose ∈ {"register","reset"}`. This **no longer logs anyone in**; on success it returns a short-lived **ticket** to redeem at register/reset: `200 { "ticket": "<uuid>", "purpose": "<register|reset>" }`. Wrong/expired code → `401`; >5 attempts, or bad phone/purpose → `400`. (No `name` field here anymore.)
  - `POST /api/auth/register` — rider signup. Body `{ "ticket", "phone", "password", "name?" }`. Consumes a verified `register` ticket and creates the rider with the password. Response `200 { "token": "<jwt>", "user_id": "<uuid>" }`. Weak password (min 8 chars) or bad phone → `400`; invalid/expired/already-used ticket → `401`; phone already registered → `409`.
  - `POST /api/auth/login` — rider login. Body `{ "phone", "password" }` → `200 { "token", "user_id" }`. Invalid credentials → `401`; blocked account → `403`; too many failed attempts (5) → `429` (per-phone lockout, 15 min, cleared on a successful login).
  - `GET /api/riders/me` (Bearer) → rider profile. `PATCH /api/riders/me` (Bearer) — body any of `{ "name", "photo_url", "gender" }`; `gender ∈ {"m","f","unset"}` (else `400`).
- **Admins:** `POST /api/auth/admin/login` — body `{ "email", "password" }` → `200 { "token", "user_id" }`. Wrong/unknown credentials → `401` (no user enumeration); disabled account → `403`. Seeded super-admin for dev: `admin@beep.iq` / `ChangeMe123!` (change before deploy).
  - Admin-user management (super_admin only): `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/{id}`. Guards: cannot delete your own account or the last super-admin (`400`); duplicate email (`409`). New admins get a server-generated temporary password (surfaced via the invite flow in Phase 8).
- **JWT claim shape:** `{ "sub": <uuid>, "role": "rider" | "captain" | "super_admin" | "operator" | "finance", "exp", "iat" }`. HS256. Rider + captain tokens last 30 days; admin tokens 8 hours. For a captain token, `sub` is the **captain id**; for a rider token, `sub` is the user id.
- All authenticated requests send `Authorization: Bearer <jwt>`. Role-gated endpoints return `403` for a valid token with insufficient role, `401` for a missing/invalid token.
- **Captains (LIVE):** phone + password, gated on admin approval. Registration requires a verified `register` ticket plus a password.
  - `POST /api/auth/otp/send` — same endpoint as riders (delivers the code to the phone). Used to prove the phone before `captains/register`, and for password reset.
  - `POST /api/captains/register` — now additionally requires `ticket` and `password` (consumes a verified `register` ticket so the phone is proven first), creating a `pending` captain **with a password**. See [Captain Lifecycle](#captain-lifecycle-phase-3--live).
  - `POST /api/auth/captain/login` — body `{ "phone", "password" }`. Returns `200 { "token", "user_id": <captain_id> }` with `role: "captain"`. Issued for **`approved` AND `pending`** captains (a pending captain can keep onboarding); `rejected`/`blocked` → `403` (CaptainNotApproved); a phone with no captain account → `404`; wrong password → `401`; too many failed attempts (5) → `429` (per-phone lockout, 15 min).
  - `POST /api/auth/password/reset` — rider **and** captain. Body `{ "ticket", "phone", "new_password" }`. Consumes a verified `reset` ticket and sets the new password for whichever account (rider or captain) owns the phone (rider wins if somehow both exist). Response `200 { "token", "user_id" }`. Weak password → `400`; invalid/expired/already-used ticket → `401`; no account for that phone → `404`.
- **Device push token:** `POST /api/me/fcm-token` (any rider or captain Bearer) — body `{ "fcm_token": "<token>" | null }` → `204`. Stores the token on the caller's row (rider → `users`, captain → `captains`) so the backend can deliver FCM pushes; send `null` on logout.
- **Seeded admin / production:** the dev super-admin `admin@beep.iq` / `ChangeMe123!` is seeded for local use. In production the server **refuses to start** while that default password still works; set `BOOTSTRAP_ADMIN_PASSWORD` to rotate it on first boot. See `docs/DEPLOYMENT.md`.

## Real-time (Phase 7 — Live)

- **Captain stream:** `GET /ws/captain?token=<jwt>` (WebSocket; the token is a **query param**, not an Authorization header — browsers can't set headers on a WS upgrade). On connect it subscribes the captain to their own location channel (`rt:captain:{id}:location`) and, if they have an active trip, that trip's channel. Frames are JSON text, one event per frame.
- **Rider/admin stream:** `GET /ws/subscribe?token=<jwt>&channel=<channel>`. `channel` is one of `rt:trip:{trip_id}`, `rt:room:{room_id}`, `rt:admin:ops`. A **rider** may only subscribe to a trip they own or a room they are a member of (else 403); an **admin** may subscribe to any trip/room channel and `rt:admin:ops`. Missing channel → 400; bad/expired token → 401.
- Channels are fanned out via Redis (`PSUBSCRIBE rt:*` bridge); clients talk only to the backend WebSocket, never to Redis. The same channels every phase has been publishing to (`rt:trip:*`, `rt:room:*`, `rt:captain:*`, `rt:admin:ops`) are now delivered live.

### WebSocket frame contract

**How to connect.** Open a WebSocket to the endpoint with the JWT as a `?token=` query param (browsers/mobile WS clients can't set an `Authorization` header on the upgrade). The reverse proxy must pass through the `Upgrade`/`Connection` headers for `/ws/*`.

- Captain: `GET /ws/captain?token=<captain-jwt>` — auto-subscribes to the captain's own location channel and, if they currently have an active trip, that trip's channel. No `channel` param.
- Rider/Admin: `GET /ws/subscribe?token=<jwt>&channel=<channel>` — subscribes to the one `channel` you name, after authorization. To watch several channels (e.g. a trip and a room), open one socket per channel.

**Upgrade-time errors** are returned as the HTTP response to the upgrade request (the socket never opens): missing/invalid token → `401`; non-captain token on `/ws/captain` → `403`; missing `channel` → `400`; a channel you're not allowed to see → `403` (rider may only watch their own trip or a room they're a member of; only admins may watch `rt:admin:ops` and arbitrary trips/rooms).

**Frame format — IMPORTANT.** Each message is a **JSON text frame containing the event payload object directly** (no outer envelope). The `beep.*` action name (e.g. `beep.trip.accepted`) is the audit/internal name and is **NOT** sent on the wire. **The most common rider-facing frames now carry an additive inline `event` discriminator** so you can switch on it instead of sniffing fields: trip lifecycle frames carry `"event": "trip_update"`, captain-location frames carry `"event": "captain_location"`, and zone cache-invalidation frames carry `"event": "beep.zone.updated"`. The field is **additive and optional** — not every channel/frame has one yet (room and admin-ops frames still rely on field-presence), so build tolerant handlers. The client correlates by:
1. **The `event` field when present** (prefer this), then
2. **The channel it subscribed to** (you already know if a frame is a trip vs room vs location vs ops event from which socket/channel it arrived on), and
3. **The fields in the payload** — for trip frames, the `status` field is the state signal (`requested` → `accepted` → `in_progress` → `completed`/`cancelled`).

Per-channel frame shapes (the keys actually published today):

| Channel | Typical frame payload (JSON object) | Notes |
|-|-|-|
| `rt:trip:{id}` | `{ "event": "trip_update", "id", "rider_id", "captain_id", "status", "fare_per_rider_iqd", "distance_per_rider_km", ... }` | Trip lifecycle. Carries `"event": "trip_update"`. Watch `status` for transitions. Treat extra keys as additive. |
| `rt:trip:{id}` (location during active trip) | a captain-location object: `{ "event": "captain_location", "captain_id", "longitude", "latitude", "last_ping_at", ... }` | The captain's GPS pings are forwarded onto the active trip's channel so the rider can animate the car. Carries `"event": "captain_location"` (also distinguishable by `longitude`/`latitude`). |
| `rt:captain:{id}` | offer broadcast: `{ "trip_id", "captain_id", "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "fare_iqd", "distance_km" }` | A dispatch offer to this captain. The Captain App should also rely on the durable FCM push (below) for backgrounded delivery. |
| `rt:captain:{id}:location` | `{ "event": "captain_location", "captain_id", "longitude", "latitude", "last_ping_at", "online" }` | The captain's own location echo (used by `/ws/captain`). Carries `"event": "captain_location"`. |
| `rt:room:{id}` | room object: `{ "id"/"room_id", "zone_id", "room_type", "status", "rider_count", "max_riders", ... }` | Abriyah room lifecycle (`open`/`locked`/`dispatched`/`expired`). |
| `rt:admin:ops` | mixed ops events (trip/room/city/location), each a plain object | Admin live map / ops feed. Admins infer kind from the fields present. |
| `rt:zone:{id}` | `{ "event": "beep.zone.updated", "zone_id", ... }` | Carries an inline `event`. Cache-invalidation signal — refresh cached zone pricing within ~30s. |

> Design note for clients: the high-traffic rider frames (`trip_update`, `captain_location`) and `rt:zone:*` now carry an inline **`event`** discriminator — prefer switching on it. Room (`rt:room:*`) and admin-ops (`rt:admin:ops`) frames don't yet, so keep a **(channel, payload fields)** fallback for those, and always tolerate unknown extra keys. If your team needs `event` on the remaining channels too, raise it with the backend team — it's a small additive change.

**Client→server frames are ignored.** The server does not accept commands over the socket; it only reads frames to detect disconnect/close. All actions are REST calls. Send a WS `Close` to disconnect cleanly.

### Push notifications (FCM) — payload shape

Both captains and riders register a device token via `POST /api/me/fcm-token` (stored on `captains.fcm_token` / `users.fcm_token`; send `{ "fcm_token": null }` on logout). Delivery is durable via `queue:notifications` with retry. The backend uses real **FCM HTTP v1** when `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` are configured, else a Mock sender (logs only). In **production a half-configured FCM is fatal** (the server refuses to start rather than silently dropping notifications).

The message the device receives is a standard FCM HTTP v1 message:
```json
{
  "message": {
    "token": "<device fcm token>",
    "notification": { "title": "<title>", "body": "<body>" },
    "data": { "...": "..." }
  }
}
```
- `notification.title` / `notification.body` are human display text (shown by the OS when backgrounded).
- **`data` is how the app deep-links on tap.** FCM requires all `data` values to be strings; numeric/UUID values arrive as strings. The keys per type:

| `notification_type` (in `data` is implicit by context; this is the push kind) | `data` keys | Recipient | Fired when |
|-|-|-|-|
| `trip_accepted` | `{ trip_id }` | rider | a captain accepts the trip |
| `captain_arriving` | `{ trip_id }` | rider | captain marks arrived |
| `trip_completed` | `{ trip_id }` | rider | trip completed |
| `trip_cancelled` | `{ trip_id }` | the **other** party | either side cancels |
| `new_trip_in_queue` | `{ trip_id }` | candidate captain | a new trip is dispatched nearby |
| `room_dispatched` | `{ room_id, trip_id }` | each room member (rider) | a captain takes the Abriyah room |
| `room_expired` | `{ room_id }` | each room member (rider) | no captain took the room before expiry |
| `captain_approval_decision` | `{ }` (no extra ids today) | captain | admin approves/rejects/blocks |

> Deep-link guidance: on notification tap, read `data.trip_id` (or `data.room_id`) and navigate to that trip/room screen, then fetch the current state via the matching REST endpoint (`GET /api/trips/{id}` / `GET /api/abriyah/rooms/{id}`) — the push is a wake-up, not the source of truth.

---

## Endpoint surface by client

### Customer App
| Capability | Phase | Key endpoints |
|-|-|-|
| Onboarding (phone + password) | 1 **Live** | **Register:** `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` `{purpose:"register"}` → `{ticket}` → `POST /api/auth/register` `{ticket,phone,password,name?}` → token. **Thereafter:** `POST /api/auth/login` `{phone,password}`. **Forgot password:** `otp/send` → `otp/verify` `{purpose:"reset"}` → `POST /api/auth/password/reset` `{ticket,phone,new_password}`. Profile: `GET/PATCH /api/riders/me`. Avatar upload: `POST /api/riders/me/photo/upload-url` → PUT to storage → `PATCH /api/riders/me` `{photo_url:"<object_key>"}` (see [Rider profile photo upload](#rider-profile-photo-upload)) |
| Service-area lookup (zones) | 2 **Live** | `GET /api/zones` (active only), `GET /api/zones/{id}` — polygons as WKT |
| Regular booking | 5 **Live** | `GET /api/trips/estimate` (public), `POST /api/trips` (regular), `GET /api/trips/{id}`, `POST /api/trips/{id}/cancel`. **On completion the fare is charged to the rider wallet** (best-effort: a debit failure is logged + recorded as a `failed` ledger row but never blocks completion). **Cancelling after a captain has accepted** incurs a flat penalty (admin-tunable `trip.cancellation_penalty_iqd`, default 2000 IQD); cancelling while still `requested`/`matched` is free. Card capture is still MockGateway (real PSP at v2) |
| Abriyah booking + waiting room | 6 **Live** | `POST /api/abriyah/validate-pins` (now returns `dropoff_zone_id`/`pickup_zone_id`, replacing the old `zone_id`; request `zone_id` deprecated/ignored), `POST /api/abriyah/join` (**request body UNCHANGED**), `GET /api/abriyah/rooms/{id}`, `DELETE /api/abriyah/leave` (+ `rt:room:{id}` events). **Matching is now by dropoff zone** with cross-zone pickup support — see [Abriyah Rooms](#abriyah-rooms-phase-6--live) |
| Live trip | 5 + 7 **Live** | `GET /api/trips/{id}`; **captain card:** `GET /api/rider/trips/{id}/captain` → `{name, car_make, car_model, car_color, car_plate, avg_rating, trip_count}` (rider must own the trip; **no phone** — use the proxy endpoint for calls); trip events on `rt:trip:{id}` live over `GET /ws/subscribe?channel=rt:trip:{id}` (captain location pings forwarded onto the active trip's channel) |
| Rate | 5 **Live** | `POST /api/trips/{id}/ratings` (editable 7 days via `PUT /api/trips/{id}/ratings/{rating_id}`) |
| Trip history | 5 **Live** | `GET /api/trips?rider_id={id}` |
| Wallet / pay (payment-ready) | 10 **Live** | `GET /api/me/wallet` (auto-provisions), `POST /api/me/wallet/topup` `{amount_iqd, payment_method_id?}`, `GET/POST /api/me/payment-methods`, `PUT /api/me/payment-methods/{id}/default`, `DELETE /api/me/payment-methods/{id}`, `GET /api/me/transactions`. MockGateway (no real PSP yet); `gateway_token` never returned |
| Card payment (QiCard checkout) | QiCard **Live** | `POST /api/payments/checkout` `{purpose, amount_iqd, target_id?}` → `{order_id, payment_id?, form_url?, status, paid, sandbox}`. In sandbox auto-confirm `status:"paid"`/`paid:true` immediately; in live open `form_url` then poll `GET /api/payments/orders/{id}` (or `POST .../refresh`). `GET /api/payments/orders`. `purpose`: `wallet_topup`/`trip_fare`/`daily_fee`. See [QiCard checkout](#qicard-checkout-hosted-form-card-payment--live) |
| Scheduled / multi-stop | 12 **Live** | `GET/POST /api/rider/scheduled-trips`, `GET/PUT /api/rider/scheduled-trips/{id}`, `POST .../{id}/cancel`; `GET/POST /api/rider/trips/{id}/stops` (max 3), **`GET /api/captain/trips/{trip_id}/stops`** (assigned-captain list — enumerate `stop_id`s), `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach` |
| Masked numbers | 11 **Live** | `GET /api/rider/trips/{id}/proxy` + `GET /api/captain/trips/{id}/proxy` → masked `ProxySession` (lazy-allocated; real numbers never exposed) |
| Promo codes (discounts) | feature/promo-codes **Live** | `POST /api/rider/promo/validate` (pre-check, never HTTP-errors); `GET /api/trips/estimate` now returns `discount_iqd` + `final_fare_iqd`; `POST /api/trips` now accepts optional `promo_code` (400 on invalid/exhausted/already-used); `POST /api/trips/{id}/cancel` releases any reserved promo. See [Promo codes / discounts](#promo-codes--discounts--live) |

### Captain App
| Capability | Phase | Key endpoints |
|-|-|-|
| Onboarding (phone + password) | 1+3 **Live** | **Register:** `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` `{purpose:"register"}` → `{ticket}` → `POST /api/captains/register` `{ticket,...,password}` (pending) → admin approves. **Login:** `POST /api/auth/captain/login` `{phone,password}` → captain token. **Issued for `approved` AND `pending`** (so a new captain can onboard); `rejected`/`blocked` → 403, unknown phone → 404, lockout → 429. A `pending` token is scoped to document upload + own-status polling only. Forgot password: `otp/send` → `otp/verify` `{purpose:"reset"}` → `POST /api/auth/password/reset`. Register device for push: `POST /api/me/fcm-token` `{fcm_token}` |
| Registration + documents | 3 **Live** | `POST /api/captains/register` (public; requires a verified `register` ticket + `password` — run `otp/send` → `otp/verify` `{purpose:"register"}` first) → **201 `{ ...captain, token }`: the onboarding captain JWT is in the response body, use it directly to upload docs** (no separate login needed; `auth/captain/login` still issues a pending token on relaunch). Presigned upload `POST /api/captains/{id}/documents/upload-url` → PUT to storage → `POST /api/captains/{id}/documents` `{doc_type, object_key}`; `GET /api/captains/{id}/documents`; `GET /api/captains/{id}/documents/completeness`. **A captain may only touch its OWN id (`sub`==`{id}`), else 403; admins any.** **5 required document types** before an admin can approve: `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. See [Captain document upload](#captain-document-upload-important-for-the-captain-app) |
| Approval pending | 3 **Live** | `GET /api/captains/{id}` (own id only, else 403; status: pending/approved/rejected/blocked/archived) — poll until `approved`. Operational endpoints (online, queue, trip lifecycle, location, proxy) return **403** until approved |
| Activate Today | 4 + 10 **Live** | `GET/POST /api/captain/activation/today` (gate status / activate). **P10:** POST now charges the captain wallet — success → 201 `status:"paid"` + `collected_at`; insufficient funds → **402** `payment required: Insufficient wallet balance` + row `status:"failed"`/`charge_error` (CTA persists; top up then retry) |
| Online toggle + location | 7 **Live** | `PUT /api/captain/online` `{online}` (gated by today's activation — 403 if not activated), `POST /api/captain/location` `{longitude,latitude}` ping, `POST /api/captain/location/flush` `{pings:[...]}` (last wins), `GET /api/captain/location`; live trip stream over `GET /ws/captain?token=` |
| Trip queue + accept | 5 + 7 **Live**; room accept 6 **Live** | `GET /api/captain/trip-queue` (pending regular trips + open rooms; **women-only rooms hidden unless captain gender = f**); `POST /api/trips/{id}/accept`; `POST /api/abriyah/rooms/{id}/accept` (room → dispatched), `GET /api/abriyah/rooms/{id}/members` (**response now wraps the roster with `dropoff_zone` + per-pickup-zone `pickup_breakdown`**); offers fan out live on `rt:captain:{id}` (WS) + a durable `new_trip_in_queue` FCM push |
| Live trip legs | 5 **Live** | `POST /api/trips/{id}/{arrive,start,complete}` |
| Earnings | 5 **Live** | `GET /api/captains/{id}/earnings?period=today\|week\|month` (gross minus daily fee); `GET /api/captains/{id}/earnings/history` |

### Admin Dashboard
| Capability | Phase | Key endpoints |
|-|-|-|
| Dashboard (KPIs + Needs Action) | 8 **Live** | `GET /api/admin/dashboard/kpis`, `.../highlights`, `.../needs-action/{counts,pending-captains,flagged-trips,expired-rooms,stuck-items}`, `POST .../needs-action/dismiss` |
| Operations (live map + rooms + force) | 8 **Live** | `GET /api/admin/operations/{trips,rooms}` (filters); `POST /api/admin/operations/trips/{id}/force-cancel`, `.../rooms/{id}/{force-dispatch,force-expire}` (super_admin); **Map Replay:** `GET /api/admin/trips/{id}/track` → ordered `[{latitude,longitude,recorded_at}]` breadcrumb of the driven route (empty `[]` for trips with no recorded pings / pre-tracking trips) |
| Live Rooms (Abriyah Kanban) | 6 **Live** (force actions: 8 **Live**) | `GET /api/admin/rooms?status=&zone_id=`, `GET /api/admin/rooms/{id}` (room + members); force-dispatch/expire via Operations |
| Cities + Zones (CRUD + polygon + pricing + import) | 2 **Live**; city activate 11 **Live** | `GET/POST/PUT /api/admin/cities[/{id}]`, `POST .../cities/{id}/{activate,deactivate}` (P11, idempotent → 409 on no-op); `GET/POST/PUT /api/admin/zones[/{id}]`, `POST .../zones/{id}/{archive,restore}`, `PUT .../zones/{id}/pricing`, `POST .../zones/import`, `POST .../zones/validate-polygon`; **`GET /api/admin/zones/{id}/history` → `ActivityHighlight[]`** (Zone Detail History tab — pricing/update/archive events) |
| Scheduled trips (admin view) | 11 **Live** | `GET /api/admin/scheduled-trips?status=&rider_id=&limit=&offset=` |
| Captains (approval queue + lifecycle + import) | 3 **Live** | `GET /api/captains` (excludes archived unless `?status=archived`), `GET /api/captains/pending`; `POST /api/captains/{id}/{approve,reject}` (admin), `.../{block,unblock,reconsider}` (super_admin); **`DELETE /api/captains/{id}` (super_admin) — soft-delete/archive**; `POST /api/captains/bulk-import`; **`GET /api/admin/captains/{id}/history` → `ActivityHighlight[]`** (Captain Detail History tab — registration/approval/block events) |
| Daily activation log + fee waiver | 4 **Live** | `GET /api/admin/activations` (filter + fee sum), `GET /api/admin/activations/{id}`; `POST /api/admin/activations/{id}/waive` (super_admin) |
| Customers (directory + detail + block) | 8 **Live** | `GET /api/admin/customers` (phone/blocked filter, paged), `GET .../{id}`, `GET .../{id}/history`; `POST .../{id}/{block,unblock}`, `PUT .../{id}/gender` (super_admin) |
| Admin login + admin users | 1 + 8 **Live** | `POST /api/auth/admin/login`; `GET/POST /api/admin/users` (list/invite, P8), `POST .../{id}/{resend-invite,disable,enable}`, `PUT .../{id}/role` (P8, super_admin); `PATCH/DELETE /api/admin/users/{id}` (name edit/delete, P1) |
| Setup (config singletons) | 8 **Live** | `GET /api/admin/settings`, `GET/PUT .../settings/{key}` (PUT super_admin; range-validated; non-retroactive). Each `Setting` now carries **`read_only: bool`** — pre-disable read-only rows (`general.timezone`, `general.currency`) instead of failing on save |
| Reports (7 reports + CSV) | 9 **Live** | `GET /api/reports/{trips/volume,trips/abriyah-performance,trips/cancellations,captains/leaderboard,captains/daily-activation,financial/revenue-by-zone,financial/activation-fees}`; every report takes `?period=&from=&to=` (+ optional `zone_id`/`city_id`/`limit`/`room_type`) and `&export=csv`; role-tiered (see Reports section). **Drill-through ready:** every report row carries its grouping entity id + name — `zone_id`/`zone_name` (volume, abriyah-performance, cancellations, revenue-by-zone), `captain_id`/`captain_name` (leaderboard), `city_id`/`city_name` (daily-activation, activation-fees) — deep-link straight to the entity Detail page |
| Payments (wallet/refund console) | 10 **Live** | `GET /api/admin/wallets/{owner_id}?owner_type=`, `POST .../wallets/{owner_id}/topup` (admin credit, no charge; **`owner_type` now validated → clean 400, not 500, on a bad value**); `GET /api/admin/transactions` (filters), `GET .../transactions/{id}`; `GET /api/admin/refunds` (status filter), `GET .../refunds/{id}`, `POST .../refunds` (submit), `POST .../refunds/{id}/{approve,reject}`; `GET /api/reports/financial/collected?from=&to=` (collected revenue, finance/super_admin) |
| Bulk actions (approve / archive / export) | 12 **Live** | `POST /api/admin/bulk/captains/approve` `{captain_ids[],note?}` (max 100), `POST .../bulk/zones/archive` `{zone_ids[]}` (max 50), `POST .../bulk/trips/export` (filterable, ≤10k rows). All return per-row outcomes; see Phase 12 section |
| Search Command Center (⌘+K) | 12 **Live** | `GET /api/admin/search?q=` → up to 50 merged results across captains/users/trips/zones/rooms, each with a deep-link `url_path` |
| App preferences (per-admin UI toggles) | 12 **Live** | `GET /api/admin/me/preferences`, `PUT .../me/preferences` `{pref_key,pref_value}`, `DELETE .../me/preferences/{pref_key}` (204). **`GET /api/admin/me/preferences/schema`** → `[{pref_key, allowed_values[]}]` — read the allow-list from the backend instead of hardcoding it. Known keys: `operations.live_rooms.view` (`table`\|`kanban`), `captains.pending.view` (`table`\|`inbox`) |
| Bulk actions + search | 12 | bulk approve/archive/export; search registry |
| Promo code admin CRUD | feature/promo-codes **Live** | `POST /api/admin/promo-codes` (201, **super_admin**), `PATCH /api/admin/promo-codes/{id}` (200, **super_admin**), `GET /api/admin/promo-codes` (200 array, **any admin role**). See [Promo codes / discounts](#promo-codes--discounts--live) |

---

## Zones & Geo (Phase 2 — Live)

PostGIS-backed cities and zones. Admin endpoints require an **admin** Bearer token (super_admin/operator/finance; riders get 403). Public `/api/zones[/{id}]` need no auth and return active zones only.

- **Polygon format:** WKT, **longitude first**: `POLYGON((lng lat, lng lat, ..., first-point-repeated))`. SRID 4326. Baghdad is ~`44.4 33.3`. The ring must be closed (first = last point) and have ≥4 points. Rings are validated server-side: self-intersecting, unclosed, too-few-point, non-polygon, or malformed WKT are all rejected as invalid (the validate endpoint returns `{ "valid": false }`; create/update return `400`).
- **`POST /api/admin/zones/validate-polygon`** `{ "polygon_wkt": "..." }` → `{ "valid": bool }`. Never 500s on bad input. Call this before submitting a hand-drawn polygon.
- **Zone object** key fields: `id, city_id, name, name_ar, polygon_wkt, zone_type ("regular_only"|"abriyah_enabled"), abriyah_per_km_iqd (nullable), abriyah_base_fare_iqd, allow_women_only, room_max_riders, room_max_wait_seconds, active, version, archived_at`.
- **Abriyah rule:** an `abriyah_enabled` zone MUST have `abriyah_per_km_iqd > 0` (else 400). `regular_only` zones always have `abriyah_per_km_iqd = null`.
- **Pricing change:** `PUT /api/admin/zones/{id}/pricing` takes only `{ abriyah_per_km_iqd?, abriyah_base_fare_iqd?, allow_women_only?, room_max_riders?, room_max_wait_seconds? }` and returns `{ zone, in_flight_trips_locked }`. It writes a before/after audit entry and fans out `beep.zone.updated` on `rt:zone:{id}` (cache-invalidation; clients should refresh cached zone pricing within ~30s).
- **Archive guard:** `POST .../zones/{id}/archive` is blocked (409) while the zone has active trips or open rooms (always allowed pre-Phase-5). `restore` reverses it.
- **Bulk import:** `POST /api/admin/zones/import` `{ "rows": [ ZoneImportRow ] }` where a row carries `city_name` (resolved to the city). Partial-commit: returns `{ committed, failed, errors: [{ row (1-based), message }] }`. Valid rows commit even if others fail.
- **Defaults:** omitted `room_max_riders`/`room_max_wait_seconds`/`abriyah_base_fare_iqd` fall back to settings (Phase 8) then hard defaults (4 / 300 / 0).

## Captain Lifecycle (Phase 3 — Live)

State machine: `pending → approved | rejected`; `approved ↔ blocked`; `rejected → pending` (reconsider); **any non-archived status → `archived`** (delete/archive, terminal). All transitions are guarded — an action from the wrong state returns 400 with a clear message.

- **Self-registration (public):** `POST /api/captains/register` `{ ticket, phone, password, name, name_ar, gender ("m"|"f"), car_make, car_model, car_plate, city_id, car_color?, national_id? }` → 201 `Captain` (status `pending`). Requires a **verified `register` ticket** (run `otp/send` → `otp/verify` `{purpose:"register"}` first to prove the phone) and a `password`. Phone and plate are globally unique (409 on dup); invalid/expired ticket → 401; bad gender → 400; unknown `city_id` → 404. Gender is locked after creation. Still requires admin approval before operational use.
- **Documents (authenticated):** **5 required types** — `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. `POST /api/captains/{id}/documents` `{ doc_type, url }` upserts (re-upload replaces). `GET .../documents` lists; `GET .../documents/completeness` → `{ complete, uploaded[], missing[] }`. The client uploads the file elsewhere and submits the resulting `url`.
- **Approval (admin):** `POST /api/captains/{id}/approve` requires **all 5 documents** (else 400). `POST .../reject` `{ reason, comment? }` where `reason ∈ {documents_invalid, vehicle_unfit, identity_mismatch, existing_account, other}`.
- **Block/unblock/reconsider (super_admin only):** `POST .../block` `{ reason }` (only from approved; force-cancels active trips at Phase 5 and signs the captain out), `.../unblock` (→ approved), `.../reconsider` (rejected → pending).
- **Delete / archive (super_admin only):** `DELETE /api/captains/{id}` → 200 `Captain` (status `archived`). **Soft-delete** — the captain is referenced by trips/ratings/rooms/reports, so the row is not removed; it is moved to the terminal `archived` status (stamps `archived_at`/`archived_by`) and its history is preserved. Effects: disappears from the default `GET /api/captains` list (still retrievable with `?status=archived`), can no longer log in (login admits only `approved`/`pending`), and in-flight trips are force-cancelled (reason `captain_archived`). Already-archived → 400 (pre-check) / 409 (concurrent). Not found → 404.
- **Re-registration after delete (since 2026-06-16):** a deleted captain's **phone and car plate are freed** — the same person can register again via `POST /api/captains/register` (or bulk-import) with the same phone/plate. Re-registration creates a **brand-new captain** (new `id`, status `pending`, fresh onboarding); the archived row stays as an audit record. Uniqueness is now enforced only among non-archived captains (partial unique indexes), so phone/plate collide only with a still-active captain.
- **Queues (admin):** `GET /api/captains` filters `?status=&city_id=&gender=&page=&per_page=` and returns `{ items: CaptainRow[], total, page, per_page }` (each row has `doc_count`). `GET /api/captains/pending` is the review queue, oldest-first.
- **Bulk import (admin):** `POST /api/captains/bulk-import` `{ rows: [...] }` → `{ accepted, rejected, errors: [{ row (1-based), reason }] }`. Dedups phone and plate within the batch and against the DB; partial-commit.
- **Events:** `beep.captain.{registered, approved, rejected, blocked, archived}` are published (audit + `rt:captain:*`). FCM pushes are enqueued for approve/reject/block/archive (delivered at Phase 7).
- **Captain object** key fields: `id, phone, name, name_ar, gender, car_make, car_model, car_plate, city_id, status, rejection_reason?, blocked_reason?, approved_by?, approved_at?, avg_rating, trip_count, registered_at, version`. `avg_rating`/`trip_count` stay 0 until Phase 5.

## Daily Activation Gate (Phase 4 — Live)

A captain must "activate" once per calendar day (Asia/Baghdad) before they can go online. The day rolls over at **Baghdad midnight** — `date` is a calendar date with no time component. The fee is a flat **2000 IQD** (config-driven from Phase 8). No money moves yet — `status` is `pending` and `collected_at` is `null` until Phase 10 wires real charging.

- **Captain App — gate status:** `GET /api/captain/activation/today` (captain Bearer; identity from the token `sub`) → `200 { activated: bool, activation: CaptainDailyActivation | null }`. `activated:false` means "show the Activate Today CTA". A captain whose status is not `approved` gets `403`; unknown captain `404`.
- **Captain App — activate:** `POST /api/captain/activation/today` (empty body `{}`) → `201 CaptainDailyActivation` with `status:"pending"`, `fee_amount_iqd:2000`, today's `date`. **Idempotent** — tapping again the same day returns the **same** row (no duplicate, still 201). Publishes `beep.captain.activated_today` on `rt:captain:{id}` (the Captain App WS session can refresh the gate on this).
- **Admin — daily activation log:** `GET /api/admin/activations` (admin Bearer) with optional `?date_from=&date_to=&status=&captain_id=&page=&page_size=` (dates are `YYYY-MM-DD`; `page` default 1, `page_size` default 50 max 200) → `200 { rows: ActivationLogRow[], total_fee_iqd, total, page, page_size }`. Each row joins the captain (`captain_name`, `captain_phone`) and, when waived, the waiving admin (`waived_by_name`). `total_fee_iqd` is the fee sum across the **full filtered set**, not just the page.
- **Admin — detail:** `GET /api/admin/activations/{id}` → `200 CaptainDailyActivation` (`404` if unknown).
- **Admin — waive fee (super_admin only):** `POST /api/admin/activations/{id}/waive` `{ reason }` (reason **≥ 10 chars**, else `400`) → `200` with `status:"waived"`, `waived_by`, `waived_reason`. Only a `pending` row can be waived — already-`waived`/`paid` → `409`. Operators/finance (non-super) → `403`. Writes a before/after audit entry.
- **CaptainDailyActivation object:** `id, captain_id, date (YYYY-MM-DD), fee_amount_iqd, status ("pending"|"paid"|"waived"), created_at, collected_at (null until P10), waived_by?, waived_reason?`.
- **Online-toggle note:** the gate service ships here but is **enforced in Phase 7** — when the Captain App opens its WS session to go online, the backend will call the gate and refuse `online` unless `activated:true` for today. Until P7 there is no online endpoint to gate.

## Regular Trips (Phase 5 — Live)

The full regular-trip lifecycle: `requested → accepted → in_progress → completed | cancelled`. Every transition is guarded — an action from the wrong state returns `400` with a clear message; concurrent updates lose a `409` (optimistic lock on `version`). Money is integer IQD. Identity comes from the JWT (`role` + `sub`): a **rider** token's `sub` is the user id, a **captain** token's `sub` is the captain id, admin roles act as `admin`.

- **Fare estimate (public, no auth):** `GET /api/trips/estimate?pickup_lat=&pickup_lng=&dropoff_lat=&dropoff_lng=&zone_id=&promo_code=` → `200 { fare_iqd, distance_km, base_fare_iqd, currency, discount_iqd, final_fare_iqd }`. Fare = `base_fare_iqd + round(distance_km × per_km)`; `per_km` is the zone's `abriyah_per_km_iqd` when `zone_id` is given and positive, else the city default. Distance is haversine km. Defaults: base 1000 IQD, per-km 500 IQD (Phase 8 moves these to settings). **Promo code (optional):** when `promo_code` is supplied and the code exists/active/within-window/under-global-cap, `discount_iqd` is the potential discount and `final_fare_iqd = max(0, fare_iqd - discount_iqd)`; an invalid/missing code returns `discount_iqd: 0` and `final_fare_iqd == fare_iqd` (never errors). This is a **potential** estimate only — the unauthenticated endpoint cannot check per-rider-once; `POST /api/trips` enforces all limits atomically.
- **Request (rider):** `POST /api/trips` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, zone_id?, promo_code? }` → `201 Trip` (status `requested`, fare/distance computed, `base_fare_iqd` captured immutably). **Promo code (optional):** if `promo_code` is supplied and valid, the trip is created with the **already-discounted `fare_iqd`** (net of the discount); `promo_code_id` and `discount_iqd` are set on the Trip object and the redemption is atomically reserved. If the code is invalid, expired, inactive, exhausted, or already used by this rider → **400** `{ "error": "..." }` and the trip is NOT created. Omitting `promo_code` behaves exactly as before. A rider with an active (non-terminal) trip gets `409`. Dispatch fans the offer out to eligible captains on `rt:captain:{id}` and publishes `beep.trip.requested` on `rt:trip:{id}`.
- **Accept (captain):** `POST /api/trips/{id}/accept` → `200 Trip` (status `accepted`, `captain_id`/`accepted_at` set). Works from `requested` (regular) **and** `matched` (Abriyah, Phase 6) — the handler routes through the state machine. A captain with an active trip gets `409`; a stale accept (someone already took it) gets `409`.
- **Arrive / Start / Complete (captain):** `POST /api/trips/{id}/arrive` (cue only, no status change), `POST .../start` (`accepted → in_progress`), `POST .../complete` (`in_progress → completed`). Complete writes the per-rider breakdown `fare_per_rider_iqd` / `distance_per_rider_km` as `{ rider_id: value }` (single entry for a regular trip; Phase 6 fills multiple for Abriyah). Events `beep.trip.{accepted,arrived,started,completed}`.
- **Cancel (rider/captain/admin):** `POST /api/trips/{id}/cancel` `{ reason, comment? }`. Actor derived from the token role. Allowed transitions: rider/captain from `requested`/`accepted`; **only admin** from `in_progress`. Invalid actor/state → `400`. `reason ∈ {changed_mind, wait_too_long, wrong_pickup, captain_late, safety, system_timeout, captain_blocked, other}`. The cascade notifies the other party, re-dispatches if a captain bailed on an accepted trip, and publishes `beep.trip.cancelled`. Blocking a captain (Phase 3) force-cancels their active trip here with `reason=captain_blocked`. **Promo release:** if the trip carried a promo code, the reservation is released on cancel (best-effort) so the rider can reuse the code on a subsequent booking.
- **Ratings:** after completion, `POST /api/trips/{id}/ratings` `{ stars (1-5), comment? }` → `201 Rating`. A rider rates the captain and vice-versa; the ratee is derived from the trip. One rating per rater per trip (`409` on repeat); non-participants get `403`; rating an incomplete trip → `400`. Edit within **7 days** via `PUT /api/trips/{id}/ratings/{rating_id}` (after the lock cron stamps `locked_at`, edits → `400`). `GET /api/trips/{id}/ratings` lists them.
- **List / detail:** `GET /api/trips?rider_id=&captain_id=&status=&page=&per_page=` → `{ items: Trip[], total, page, per_page }`. `GET /api/trips/{id}` → `Trip`.
- **Earnings (captain):** `GET /api/captains/{id}/earnings?period=today|week|month` → `{ gross_iqd, activation_fee_iqd, net_iqd, trip_count, period }` (net = gross − daily activation fee; full per-day fee accounting lands in P10). `GET /api/captains/{id}/earnings/history?period=…` → `{ items: [{ trip_id, fare_iqd, trip_type, completed_at }] }`.
- **Trip object** key fields: `id, trip_type ("regular"|"abriyah"), status, rider_id, captain_id?, zone_id?, room_id?, pickup_lat/lng, dropoff_lat/lng, fare_iqd, distance_km, base_fare_iqd, currency, fare_per_rider_iqd?, distance_per_rider_km?, promo_code_id?, discount_iqd?, cancellation_reason?, cancelled_by?, requested_at, accepted_at?, started_at?, completed_at?, cancelled_at?, version`. When a promo was applied, `fare_iqd` is already net of the discount; `discount_iqd` is the amount deducted; `promo_code_id` is the UUID of the applied code.
- **WS channels:** `rt:trip:{id}` (rider + captain follow trip state) and `rt:captain:{id}` (offer push). The real-time **subscriber/push loop lands in Phase 7**; Phase 5 already publishes every event to Redis + writes the audit trail.
- **Dispatch at v1 is a degraded stub:** offers fan out to all approved + activated-today captains (no geo ranking yet — `captain_locations` + nearest-captain ordering land in Phase 7). The first captain to `accept` wins (optimistic lock). There is no auto-timeout cancel at v1 (it would race the accept); Phase 7 adds the real per-captain 15s window.

## Abriyah Rooms (Phase 6 — Live)

Abriyah is the zone-shared-ride differentiator: riders going to the **same dropoff (destination) zone** pool into a **room**; one captain takes the whole room. **Matching is keyed by the DROPOFF zone, not the pickup zone** (changed). Pickup may be in **any active zone** (regular or Abriyah) and **cross-zone trips** (pickup zone ≠ dropoff zone) are now supported; only the **dropoff** must be in an Abriyah-enabled zone. Each rider gets an **independent per-rider fare**, now priced from the rider's **pickup zone** (`base + round(distance_km × per_km)` using that zone's Abriyah pricing if the pickup zone is Abriyah-enabled, else the global regular-fare settings) — riders do not split a single fare. Room lifecycle: `open → locked → dispatched | expired`.

- **Validate pins (per-drag, PUBLIC — no auth):** `POST /api/abriyah/validate-pins` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, zone_id? }` → `200 { valid, dropoff_zone_id?, pickup_zone_id?, message }`. **Response shape changed** — it now returns **both** resolved zones (`dropoff_zone_id`, `pickup_zone_id`, either may be `null`) and this **REPLACES the old single `zone_id` field**. `valid:true` only when the **dropoff** is in an Abriyah-enabled zone **AND** the **pickup** is in some active zone. The request body still accepts an optional `zone_id`, but it is now **IGNORED (deprecated)** — drop it from new clients. **Now public** to mirror the public `GET /api/trips/estimate` — call it before login / during map exploration without a token. **Never an HTTP error** — `valid:false` with a human message when a pin is out of range. Call on every pin drag for inline feedback before joining.
- **Join (rider):** `POST /api/abriyah/join` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, room_type ("mixed"|"women_only") }` → `201 { room, member, trip_id, fare_iqd, distance_km }`. **Request body is UNCHANGED — no frontend change needed to join.** The backend now detects the **dropoff** Abriyah zone (and matches the rider into the room for that destination zone), resolves the pickup zone independently (any active zone — cross-zone allowed), computes the per-rider fare from the **pickup** zone, finds the oldest open non-full room for that dropoff zone (FIFO) or opens a new one, adds the rider, and creates a **matched** Abriyah trip. Errors: dropoff not in an Abriyah zone → `400`; pickup not in any active zone → `400`; women-only by a non-female rider → `403`; women-only not allowed in zone → `400`; rider already in a room → `409`.
- **Room detail (rider):** `GET /api/abriyah/rooms/{id}` → `{ room, members: RoomMember[] }`.
- **Leave (rider):** `DELETE /api/abriyah/leave` → `200 { message }`. Removes the rider from their open/locked room, decrements the count, and cancels their trip. `400` if not in any active room.
- **Accept (captain):** `POST /api/abriyah/rooms/{id}/accept` → `200 Room` (status `dispatched`). Locks the open room to the captain and immediately dispatches it: **every member trip transitions `matched → accepted`** with the captain assigned. Errors: room not open → `400`; women-only room by a non-female captain → `403`; captain not approved → `403`; captain already in a room → `409`.
- **Room members (captain, assigned only):** `GET /api/abriyah/rooms/{id}/members` → **response shape changed** — it now wraps the roster with the shared **`dropoff_zone`** and a **`pickup_breakdown`** so the captain sees the common destination zone plus how many riders come from each pickup zone:
  ```json
  {
    "room_id": "uuid",
    "dropoff_zone": { "zone_id": "uuid", "name": "Karrada", "name_ar": "الكرادة" },
    "pickup_breakdown": [
      { "zone_id": "uuid", "name": "Mansour", "name_ar": "المنصور", "rider_count": 3 },
      { "zone_id": null,   "name": null,      "name_ar": null,        "rider_count": 1 }
    ],
    "members": [ /* RoomMemberDetail roster — UNCHANGED: rider_id, name, phone, pickup_wkt, dropoff_wkt, fare_iqd, distance_km, joined_at */ ]
  }
  ```
  A `pickup_breakdown` entry with **`zone_id: null`** groups riders whose pickup fell outside all active zones (`name`/`name_ar` also `null`). The `members[]` roster itself is unchanged. `403` for any captain other than the assigned one. (Room-members still returns the raw rider phone; the Phase 11 proxy is a separate per-trip endpoint — `GET /api/captain/trips/{id}/proxy` — for the live 1:1 trip call, not the room roster.)
- **Admin:** `GET /api/admin/rooms?status=&zone_id=` → `{ items: Room[] }` (Live Rooms Kanban); `GET /api/admin/rooms/{id}` → `{ room, members }`.
- **Auto-fill / auto-dispatch:** a room that fills to `max_riders` while still `open` (no captain) **stays open** and waits for a captain — dispatch requires a captain. Dispatch happens on captain-accept. A room that no captain accepts before `expires_at` (zone's `room_max_wait_seconds`) is swept to `expired` every ~30s and all member trips are cancelled (`reason=system_timeout`).
- **Room object** key fields: `id, zone_id, room_type, status, max_riders, rider_count, captain_id?, expires_at, dispatched_at?, created_at, updated_at`. **RoomMember**: `id, room_id, rider_id, trip_id?, distance_km, fare_iqd, joined_at`.
- **WS channel:** `rt:room:{id}` carries `beep.room.{opened,joined,locked,dispatched,expired}`; member trips also emit `beep.trip.{requested,accepted,cancelled}` on `rt:trip:{id}`. As of Phase 7 these are delivered live over `GET /ws/subscribe?channel=rt:room:{id}` (rider members) and member riders also get `room_dispatched` / `room_expired` FCM pushes.

## Real-Time Delivery (Phase 7 — Live)

The delivery layer: captain GPS pings, the WebSocket fan-out of every `rt:*` event published since Phase 1, captain online/offline + staleness, and durable FCM push. No new business state — only delivery.

- **Location ping (captain):** `POST /api/captain/location` `{ longitude, latitude }` → `200 { captain_id, longitude, latitude, last_ping_at, online }`. A ping sets the captain **online** (presence) and fans the position out to `rt:captain:{id}:location`, `rt:admin:ops` (live map), and — if the captain is on an active trip — that trip's `rt:trip:{id}` channel (so the rider watches the car move). Coordinates out of `[-180,180]`/`[-90,90]` → `400`. Pings do **not** write an audit row (high-frequency); they are Redis-only fan-out.
- **Offline flush (captain):** `POST /api/captain/location/flush` `{ pings: [{longitude, latitude}, ...] }` → `200 CaptainLocationResponse`. On reconnect the app submits the queue collected while offline; the backend stores **only the last ping** (last-known policy). Empty list → `400`.
- **Online toggle (captain):** `PUT /api/captain/online` `{ online: bool }` → `200 { ok: true }`. Going **online enforces today's daily-activation gate** (Asia/Baghdad date) — no active activation row → `403`. Going offline is always allowed and fades the captain's pin for subscribers.
- **Read own location (captain):** `GET /api/captain/location` → `200 CaptainLocationResponse` (or `404` if the captain has never pinged).
- **Trip queue (captain):** `GET /api/captain/trip-queue` → `200 { offers: CaptainOffer[] }`. Pending **regular trips** (`requested`) plus **open Abriyah rooms**, oldest-first. **Women-only rooms are pre-filtered out for non-female captains** (G-ABRIYAH-02/G-MF-06) — a male captain never sees a women-only offer at all. `CaptainOffer`: `{ offer_type ("trip"|"room"), id, zone_id?, room_type? ("mixed"|"women_only"|null), pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_iqd, created_at }`.
- **Captain WebSocket:** `GET /ws/captain?token=<captain-jwt>`. Subscribes to the captain's location channel + active-trip channel; forwards each Redis event as a JSON text frame. Non-captain token → 403; bad token → 401.
- **Rider/admin WebSocket:** `GET /ws/subscribe?token=<jwt>&channel=<ch>` where `ch ∈ {rt:trip:{id}, rt:room:{id}, rt:admin:ops}`. Riders are scoped to their own trip / member rooms; admins may watch anything. Missing channel → 400; unauthorized channel → 403.
- **Dispatch (now geo-ranked):** when a regular trip is requested, candidates are approved + activated-today + **online** captains with a recent location, ranked by `ST_Distance` to the pickup within a 10 km radius (falls back to registration-order if no online located captain exists, so a trip is never dropped). The offer fans out live on `rt:captain:{id}` and a durable `new_trip_in_queue` FCM push wakes backgrounded apps. First captain to `accept` wins.
- **Staleness:** an online captain who stops pinging is forced **offline after 5 minutes** by a 60s sweep (the pin fades; an abandoned active trip is surfaced for admin via `queue:staleness`). Clients should show a "stale" indicator at ~60s and treat a captain as gone at 5 min.
- **Push types (`NotificationType`, snake_case):** `trip_accepted`, `captain_arriving`, `trip_completed`, `trip_cancelled` (notifies the opposite party), `room_dispatched`, `room_expired`, `captain_approval_decision`, `new_trip_in_queue`. The Captain App registers its FCM device token (stored on `captains.fcm_token`); rider-side push tokens (`users.fcm_token`) land in Phase 8.

## Admin Operations (Phase 8 — Live)

The full admin operational surface — 28 endpoints under `/api/admin`. All require an admin Bearer token. **Reads** (dashboards, operations lists, customer reads, settings GET) accept any admin role; **writes** (settings PUT, force-actions, customer block/unblock/gender, all admin-user management) are **super_admin only** (operator/finance → 403). Errors: 400 validation, 401 unauthenticated/**revoked token**, 403 wrong role, 404 not found, 409 conflict.

- **Settings (Setup):** `GET /api/admin/settings` → `{ settings: Setting[] }` (15 keys: `pricing.*`, `activation.daily_fee_iqd`, `room.default_max_*`, `room.allow_women_only_globally`, `general.*`). `GET /api/admin/settings/{key}` → `Setting { key, value (string), updated_by?, updated_at }`. `PUT /api/admin/settings/{key}` `{ value }` (super_admin) → updated `Setting`. **Range-validated** per key (e.g. `room.default_max_riders` 2-6, `activation.daily_fee_iqd` 500-10000, per-km 100-10000) — out of range → 400. **Settings are non-retroactive**: changing a value does NOT rewrite existing zones/activations. The `activation.daily_fee_iqd` setting now drives the captain Activate-Today fee (was a 2000 constant); zone-creation defaults read `pricing.*`/`room.*`.
- **Dashboard KPIs:** `GET /api/admin/dashboard/kpis` → `KpiSnapshot` (10 integer fields: `trips_today, completed_today, cancelled_today, active_trips_now, open_rooms_now, active_captains_now, activations_today, activation_fees_accrued_iqd, completed_yesterday, trips_yesterday`). "Today" is the **Asia/Baghdad** calendar day. Sub-second; safe to poll.
- **Activity feed:** `GET /api/admin/dashboard/highlights?limit=` (≤20) → `ActivityHighlight[]` `{ id, event_type, description, entity_id?, entity_kind?, occurred_at }` — last 24h of audit events, human-described.
- **Needs Action (4 tabs + counts):** `GET .../needs-action/counts` → `{ pending_captains, flagged_trips, expired_rooms, stuck_items, any_sla_breach }` (badge counts; `any_sla_breach` = a pending captain > 24h). Tab lists: `.../pending-captains` (`PendingCaptainRow` with `age_hours`, `documents_complete`, `sla_breached`), `.../flagged-trips` (in-progress > 2h / captain-late cancels / ≤2-star ratings, with `flag_reason`), `.../expired-rooms` (24h), `.../stuck-items` (idle captains, no-ping trips, locked rooms past `expires_at`). `POST .../needs-action/dismiss` `{ item_type, item_id }` hides a row **per-admin** (`item_type ∈ flagged_trip|expired_room|stuck_item`).
- **Operations:** `GET /api/admin/operations/trips?status=&type=&zone_id=` → `LiveTripPin[]` (with `captain_lat/lng` from `captain_locations`, `status_duration_min`); `status` is comma-separated (default `requested,matched,accepted,in_progress`). `GET .../operations/rooms?status=&zone_id=&room_type=` → `LiveRoomCard[]` (`rider_count/max_riders`, `wait_elapsed_sec/max_wait_sec`).
- **Force-actions (super_admin):** `POST .../operations/trips/{id}/force-cancel` `{ reason }` (reason validated against the cancellation_reason enum) — cancels via the cascade **as actor `admin`** (the state machine forbids `system` from cancelling accepted trips). `POST .../operations/rooms/{id}/force-dispatch` (room must be `locked`). `POST .../operations/rooms/{id}/force-expire` `{ reason }` (room `open`/`locked`).
- **Customers:** `GET /api/admin/customers?phone=&blocked=&page=&per_page=` → `{ items: CustomerRow[], page, per_page }` (`total_trips`, `cancellation_count`, `blocked`). `GET .../customers/{id}` → `CustomerDetail` (+ `avg_rating_received/given`, `blocked_reason`). `GET .../customers/{id}/history` → audit `ActivityHighlight[]`. **Super_admin writes:** `POST .../{id}/block` `{ reason }` (**reason ≥ 10 chars** else 400; already-blocked → 409; **does NOT cancel in-flight trips** — the block bites at next login), `POST .../{id}/unblock`, `PUT .../{id}/gender` `{ gender: "m"|"f"|"unset" }` (audited before/after).
- **Admin users (super_admin):** `GET /api/admin/users` → `{ items: AdminUserRow[] }` (`role`, `status (active|invited)`, `disabled`, `last_login_at`). `POST /api/admin/users` `{ email, name, role, send_invite? (default true) }` → 201 `AdminUserRow` (status `invited`; if `send_invite` an invite email is queued — Mock logs it until SMTP is wired). `POST .../{id}/resend-invite` (target must be `invited` else 409). `PUT .../{id}/role` `{ role, confirm_self_demotion? }` — **last active super_admin cannot be demoted** (409); **self-demotion needs `confirm_self_demotion: true`** (else 400); a **downgrade revokes the target's existing tokens**. `POST .../{id}/{disable,enable}` (disabling the last super_admin → 409; disabling also revokes tokens).
- **Token revocation (gap 6.4):** a role **downgrade** (super_admin→operator/finance, operator→finance) or an account **disable** stamps `admin_users.tokens_valid_after = NOW()`. The admin auth middleware rejects (**401**) any admin token whose `iat` predates that watermark — so a mid-session demotion invalidates the old session immediately. No client action needed beyond re-login.

## Reports (Phase 9 — Live)

Seven read-only historical reports for the **Admin Dashboard**, backed by pre-aggregated rollup tables (no live DB scans). All require an **admin** Bearer token; riders → 403. Each report is **role-tiered**:

| Report | Path | Roles |
|-|-|-|
| Trip Volume | `GET /api/reports/trips/volume` | super_admin, operator |
| Abriyah Performance | `GET /api/reports/trips/abriyah-performance` | super_admin, operator |
| Cancellation Analysis | `GET /api/reports/trips/cancellations` | super_admin, operator |
| Captain Leaderboard | `GET /api/reports/captains/leaderboard` | super_admin, operator, finance |
| Daily Activation | `GET /api/reports/captains/daily-activation` | super_admin, operator, finance |
| Revenue by Zone | `GET /api/reports/financial/revenue-by-zone` | super_admin, finance |
| Activation Fees | `GET /api/reports/financial/activation-fees` | super_admin, finance |

- **Common query params:** `period` (`day`|`week`|`month`, required), `from` + `to` (`YYYY-MM-DD`, inclusive, required; range must be ≤ 365 days and `from ≤ to`, else 400). Optional: `zone_id` (trip/revenue reports), `city_id` (activation/fees reports), `limit` (leaderboard top-N, default 50, max 500), `room_type` (`mixed`|`women_only`, Trip Volume only), `export=csv`.
- **JSON response:** an array of rows. Each row carries its `period`, `period_start` (the bucket's start date — day = that date, week = the Monday, month = the 1st, all in **Asia/Baghdad**), the joined display name (`zone_name`/`city_name`/`captain_name`), the metric columns, and `updated_at`. An empty period returns `[]` (valid before operational data exists).
- **CSV export:** add `&export=csv` → `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="<report>.csv"`. Columns match the table view (display names, not raw IDs).
- **Row shapes (key metric columns):**
  - **Trip Volume:** `zone_name, trip_type (regular|abriyah), room_type (n/a|mixed|women_only), total_trips, completed, cancelled, total_fare_iqd, avg_fare_iqd`.
  - **Abriyah Performance:** `zone_name, rooms_opened, rooms_dispatched, rooms_expired, fill_rate_pct, avg_wait_seconds, women_only_rooms, women_only_share_pct`. **`zone_name` is now the DROPOFF (destination) zone** — the rollup is dimensioned by the room's dropoff zone, not the pickup zone (matches the dropoff-zone matching model). Wait = `dispatched_at − opened_at` (seconds); **expired rooms are excluded from the wait average** but counted in `rooms_opened`/`rooms_expired`.
  - **Cancellation Analysis:** `zone_name, cancellation_reason, count`.
  - **Captain Leaderboard:** `captain_name, trip_count, completed_trips, total_fare_iqd, avg_rating` (ordered by completed_trips, then earnings).
  - **Daily Activation:** `city_name, approved_captain_count, activated_captain_count, activation_rate_pct`.
  - **Revenue by Zone:** `zone_name, trip_count, total_fare_iqd, regular_fare_iqd, abriyah_fare_iqd`.
  - **Activation Fees:** `city_name, accrued_count, accrued_amount_iqd, collected_count, collected_amount_iqd, waived_count`. The rollup `collected_*` columns stay `0`; **Phase 10 serves real collected figures via the live `GET /api/reports/financial/collected` report** (sums the `transactions` ledger), not this rollup.

## Payments (Phase 10 — Live)

Wallet, card-on-file, transaction ledger, and refunds behind a `PaymentGateway` (MockGateway in non-prod; a real Iraqi PSP is a one-line swap). Money is integer IQD.

- **Owner model:** one wallet per `(owner_id, owner_type)` where `owner_type` is `rider` or `captain`, derived from the caller's JWT role. Admin roles have no personal wallet (→ 403 on `/api/me/*`). Wallets auto-provision on first `GET /api/me/wallet`.
- **Self-scoped (rider/captain), `require_auth`:**
  - `GET /api/me/wallet` → `Wallet { id, owner_id, owner_type, balance_iqd, ... }`.
  - `POST /api/me/wallet/topup` `{ amount_iqd, payment_method_id? }` → `Transaction`. With a method → MockGateway charge then credit; without → admin/cash credit. `amount_iqd <= 0` → 400; gateway reject → 402.
  - `GET/POST /api/me/payment-methods` — `POST { card_number, method_type:"card", set_as_default? }` tokenizes (stores only the gateway token + `masked_last4`; **`gateway_token` is never returned**) → 201 `PaymentMethod`.
  - `PUT /api/me/payment-methods/{id}/default` (204), `DELETE /api/me/payment-methods/{id}` (204).
  - `GET /api/me/transactions?limit=&offset=` → `[Transaction]` (newest first).
- **Admin, `require_admin`:** `GET /api/admin/wallets/{owner_id}?owner_type=` ; `POST .../wallets/{owner_id}/topup { amount_iqd, owner_type }` (credit, no gateway charge); `GET /api/admin/transactions?wallet_id=&status=&tx_type=&from=&to=&limit=&offset=` ; `GET .../transactions/{id}` ; refund console below.
- **Refunds (admin):** `POST /api/admin/refunds { transaction_id, amount_iqd, reason }` → 201 `pending` (guards: tx must be `succeeded`/not-already-refunded → 409, `amount_iqd <= tx.amount_iqd` → 409 over-refund, non-succeeded → 400). `POST .../refunds/{id}/approve` reverses the charge (gateway refund if any, wallet credit, refund ledger row, original → `reversed`) → `processed`. `POST .../refunds/{id}/reject { rejection_note }`. `GET /api/admin/refunds?status=`, `GET .../refunds/{id}`.
- **Transaction** shape: `{ id, wallet_id?, trip_id?, activation_id?, tx_type, amount_iqd, status, gateway_ref?, failure_reason?, created_at, updated_at }`. `tx_type`: `trip_fare | daily_fee | topup | refund | cancellation_penalty`. `status`: `pending | succeeded | failed | reversed`.
- **Collected revenue report:** `GET /api/reports/financial/collected?from=&to=` (RFC3339; finance/super_admin) → `{ collected_fare_iqd, collected_activation_fees_iqd, refunds_iqd, net_iqd }`, summed live from the ledger (`status='succeeded'`, refunds `status='processed'`). This is the canonical "collected" figure (the Phase 9 accrued report stays accrued).
- **Daily activation charge:** Activate Today now debits the captain wallet (see the Captain App table). Paid → row `paid` + `collected_at`; insufficient funds → 402 + row `failed` + `charge_error`.
- **Events** (Redis `rt:payment:{owner_id}` / `rt:payment:refund:{id}`, best-effort for live balance refresh): `beep.payment.{topup_succeeded, topup_failed, fare_collected, refund_requested, refund_processed, penalty_applied}`.
- **Trip-flow charging (now wired, post-deployment-hardening):** `POST /api/trips/{id}/complete` charges the rider wallet for `fare_iqd` (best-effort: a debit failure is logged + recorded as a `failed` ledger row but never blocks completion). `POST /api/trips/{id}/cancel` by a **rider after a captain accepted** applies the flat `trip.cancellation_penalty_iqd` penalty (default 2000). See the Customer App table for the rider-facing contract. (This supersedes the earlier P10 note that these were unwired; the captain token issuer is also live now — see the Auth model section.)

### QiCard checkout (hosted-form card payment) — Live

A redirect/hosted-form card-payment flow that sits **alongside** the wallet model above. The payer pays on QiCard's own form (we never collect card data); on SUCCESS we fulfil the order. This is what lets a rider/captain pay by card now, with a one-flag switch from sandbox to live.

- **Sandbox vs live (server `QI_SANDBOX`, no client change):** In **sandbox auto-confirm** (default) a checkout still calls QiCard to create a real payment (real `form_url` + `payment_id` come back), but the order is **also marked `paid` and fulfilled immediately** — the response has `status:"paid"`, `paid:true`, `sandbox:true`, so the app can proceed without waiting for the redirect/webhook. In **live** mode (`QI_SANDBOX=false`) the response is `status:"created"`, `paid:false`, `sandbox:false`; the client opens `form_url` and the order settles when QiCard webhooks us (or the client polls — see refresh below).
- **Self-scoped (rider/captain), `require_auth`:**
  - `POST /api/payments/checkout` `{ purpose, amount_iqd, target_id? }` → `CheckoutResponse { order_id, payment_id?, form_url?, status, paid, sandbox }`.
    - `purpose`: `wallet_topup` (no `target_id`; credits the caller's wallet), `trip_fare` (`target_id` = trip id), `daily_fee` (`target_id` = captain activation id). `amount_iqd > 0`. Wrong/missing pairing → 400; QiCard error in **live** mode → 500.
  - `GET /api/payments/orders?limit=&offset=` → `[PaymentOrder]` (caller's own, newest first).
  - `GET /api/payments/orders/{id}` → `PaymentOrder` (404 if not the caller's). **Poll this after opening `form_url`** to learn when `status` flips to `paid`.
  - `POST /api/payments/orders/{id}/refresh` → `PaymentOrder` — polls QiCard for the live status and settles/fails the order (webhook fallback). No-op once terminal.
- **Webhook (no auth, QiCard → us):** `POST /api/payments/qicard/webhook` (full QiCard payment object). Always returns 200 (so QiCard stops retrying). On `SUCCESS` the order settles + fulfils **idempotently** (a duplicate or racing webhook never double-credits — settlement claims the order atomically before crediting). The webhook is hardened: the RSA `X-Signature` header is verified against QiCard's public key when `QI_CARD_PG_PUBLIC_KEY_PATH` is set (a forged/invalid signature is ignored), and the QiCard-reported `amount` must match the order amount before settling. On a terminal failure the order is marked `failed`. Set the public HTTPS URL of this route as `QI_CARD_NOTIFICATION_URL`.
- **Ownership + amount are server-enforced (important for the apps):** for `trip_fare` the caller must be the trip's **rider** and `amount_iqd` must equal the trip's `fare_iqd`; for `daily_fee` the caller must be the **captain** who owns the activation and `amount_iqd` must equal its `fee_amount_iqd`. A wrong amount → 400; a foreign/unknown target → 403/404. So the client must send the real fare/fee, not an arbitrary number. `wallet_topup` amount stays the payer's choice.
- **`PaymentOrder`** shape: `{ id, owner_id, owner_type, purpose, target_id?, amount_iqd, currency:"IQD", status, request_id, gateway_payment_id?, form_url?, sandbox_autoconfirmed, transaction_id?, failure_reason?, paid_at?, created_at, updated_at }`. `status`: `created | paid | failed | cancelled | refunded`.
- **Fulfilment:** on settle the order writes a `succeeded` ledger `Transaction` (`tx_type` matches the purpose: `topup`/`trip_fare`/`daily_fee`, `gateway_ref` = QiCard `paymentId`) and links it as `transaction_id`. `wallet_topup` also credits the wallet; `daily_fee` also flips the captain activation to `paid`. So a card payment shows up in `GET /api/me/transactions` and the collected-revenue report exactly like a wallet charge.
- **Events** (Redis `rt:payment:{owner_id}`, best-effort): `beep.payment.order_paid` with `{ order_id, purpose, amount_iqd, status, sandbox_autoconfirmed }`.

## Privacy, Scheduling, Multi-City (Phase 11 — Live)

### Scheduled trips (Customer App, `require_role "rider"`)
- `POST /api/rider/scheduled-trips` `{ trip_type:"regular", pickup_lat/lng, pickup_address?, dropoff_lat/lng, dropoff_address?, scheduled_for }` → 201 `ScheduledTrip` (status `pending`). **`scheduled_for` must be 30 min – 7 days out** (else 400); **regular only** (abriyah → 400).
- `GET /api/rider/scheduled-trips` → the rider's own list. `GET /api/rider/scheduled-trips/{id}` (owner only). `PUT .../{id}` updates time/pickup/dropoff (pending only; same time-window guard). `POST .../{id}/cancel` `{ reason? }` → `cancelled` (owner + pending only, else 403/409).
- A background scheduler tick (every 60s) **promotes** a due pending trip into a live REQUESTED trip (`status → promoted`, `promoted_trip_id` set), then the normal dispatch flow takes over. Overdue-by-5-min pending trips are marked `expired`. `ScheduledTrip.status`: `pending | promoted | cancelled | expired`.
- Admin: `GET /api/admin/scheduled-trips?status=&rider_id=&limit=&offset=`.

### Multi-stop (regular trips)
- `POST /api/rider/trips/{id}/stops` `{ lat, lng, address? }` → 201 `TripStop` (`seq` auto 1..3). **Max 3 stops** (4th → 409); trip must be `regular` + `accepted`/`in_progress` (else 400); rider must own the trip (else 403). `GET /api/rider/trips/{id}/stops` lists them.
- **`GET /api/captain/trips/{trip_id}/stops`** → `TripStop[]` (the assigned captain's view, so the Captain App can enumerate the `stop_id`s it then reaches). Assigned-captain-only (403 otherwise); 404 if no such trip. Mirrors the rider list with captain scoping.
- `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach` `{ reached_at? }` → `TripStop` `status:"reached"`. Captain on the trip only (403 otherwise); pending stops only (already-reached → 409).

### Proxy numbers (privacy)
- `GET /api/rider/trips/{id}/proxy` and `GET /api/captain/trips/{id}/proxy` → `ProxySession { rider_proxy_number, captain_proxy_number, provider, expires_at, ... }`. **Lazily allocated** on first access (idempotent thereafter), TTL 2h. Trip must be `accepted`/`in_progress` (else 409) and have a captain (else 409); caller must be the matching party (else 403). MockNumberProxy returns deterministic `+964700…`/`+964701…` numbers (real provider is a one-line swap). Expired sessions are swept every 10 min. **Real phone numbers are never exposed** through these endpoints. (Trip responses never carried phone fields, so no existing payload changed.)

### Multi-city
- Erbil, Basra, Mosul are seeded **inactive**; `POST /api/admin/cities/{id}/{activate,deactivate}` (super_admin/any-admin) flips `cities.active` (idempotent → 409 on a no-op) and emits `beep.city.{activated,deactivated}` (audit + `rt:admin:ops`). Existing `city_id` filters propagate the change.

## Hardening (Phase 12 — Live)

Cross-cutting **Admin Dashboard** tooling. No new business entity beyond per-admin UI preferences. All endpoints require an **admin** Bearer token (`require_admin`; riders → 403, no token → 401).

### Bulk actions (partial-success model)
- Every bulk endpoint returns `BulkActionResult { succeeded, failed, errors: [{ id, reason }] }` with **HTTP 200** — a bad row never fails the batch; only an empty/oversized input list is a 400.
- `POST /api/admin/bulk/captains/approve` `{ captain_ids: [uuid], note? }` — **max 100**. Each id is run through the real approval engine (document gate of all 5 required docs + state machine + `beep.captain.approved` event). Row reasons: `"captain not found"`, `"all required documents must be uploaded before approval"`, `"invalid state transition from status '<x>'"`.
- `POST /api/admin/bulk/zones/archive` `{ zone_ids: [uuid] }` — **max 50**. A zone is skipped (row error) when missing (`"not found"`), already archived (`"already archived"`), or has in-flight trips / open rooms (`"has active trips or rooms"`). Success sets `zones.active=false` + `archived_at` and emits `beep.zone.archived`.
- `POST /api/admin/bulk/trips/export` `{ city_id?, zone_id?, trip_type?, status?, from_date?, to_date?, limit? }` → JSON array of `TripExportRow { trip_id, trip_type, status, rider_id, captain_id?, zone_id?, fare_iqd, distance_km, created_at, completed_at? }`. `limit` clamped to `[1, 10_000]` (default 1000); `city_id` filters via the trip's zone; `from_date`/`to_date` bound `requested_at` (exposed as `created_at`).

### Search Command Center
- `GET /api/admin/search?q=<text>` → `SearchResponse { query, results: SearchResult[], total }`. Searches captains (name/phone), users (name/phone), trips (id), zones (name/name_ar), rooms (id) concurrently (case-insensitive `ILIKE`). Merged in priority order **captain > user > trip > zone > room**, capped at **50**. Empty/whitespace `q` → `{ total: 0, results: [] }` (no DB hit). Each `SearchResult { kind, id, label, sublabel?, url_path }` carries a Dashboard deep-link (`/captains/{id}`, `/customers/{id}`, `/operations/trips/{id}`, `/zones/{id}`, `/operations/rooms/{id}`).

### App preferences (per-admin UI state)
- `GET /api/admin/me/preferences` → `AppPreference[]` for the caller (`claims.sub` = admin id). `PUT /api/admin/me/preferences` `{ pref_key, pref_value }` upserts → `AppPreference` (200); unknown key or disallowed value → **400**. `DELETE /api/admin/me/preferences/{pref_key}` → **204** (idempotent). Allow-list is enforced in code: `operations.live_rooms.view` ∈ {`table`,`kanban`} (default `kanban`), `captains.pending.view` ∈ {`table`,`inbox`} (default `table`).

### Operational notes (no client-facing API)
- **Offline ping flush:** a 5s worker drains the Redis `queue:ping_flush` buffer into `captain_locations` (UNNEST batch upsert, last-write-wins per captain). The Phase 7 captain location handler now buffers a ping to that list on a Postgres write failure so no position update is silently dropped — transparent to the Captain App.
- **SQLx offline data committed:** `.sqlx/` is now checked in; CI builds with `SQLX_OFFLINE=true` (and verifies `cargo sqlx prepare --check`), so a live database is no longer required to compile.

## Promo codes / discounts — Live

Riders can apply a discount code to a trip booking. The server owns the fare computation; the client's job is to call the validate endpoint for immediate UI feedback, then pass the code into the booking call. The discount is atomically reserved at trip creation and released on cancel.

### Rider-facing

- **Pre-check (never HTTP-errors):** `POST /api/rider/promo/validate` (rider Bearer) — body `{ "code": "SUMMER10", "fare_iqd": 4500 }` → `200 { valid, kind?, value?, discount_iqd?, message }`. `valid: false` for any of: code unknown, inactive, outside active window, global cap exhausted, already used by this rider. When `fare_iqd` is supplied and the code is valid, `discount_iqd` is the exact computed discount. `kind` is `"percent"` or `"fixed"`; `value` is the percent (1–100) or the fixed IQD amount. Mirror the `POST /api/abriyah/validate-pins` pattern — build the validate call into the promo-card UI, never pre-reject client-side.
- **Fare estimate with promo:** `GET /api/trips/estimate?...&promo_code=SUMMER10` returns the **potential** discount in `discount_iqd` and `final_fare_iqd`. This is indicative only (unauthenticated; cannot check per-rider-once). Show it as a preview; the binding discount is confirmed at `POST /api/trips`.
- **Apply at booking:** pass `"promo_code": "SUMMER10"` in the `POST /api/trips` body. On success the returned Trip has `fare_iqd` already net of the discount, plus `promo_code_id` and `discount_iqd`. On failure (code invalid/inactive/expired/exhausted/already-used-by-this-rider) the server returns **400** `{ "error": "..." }` and the trip is NOT created — show the message and let the rider remove the code.
- **Auto-release on cancel:** `POST /api/trips/{id}/cancel` releases any promo reservation so the rider can reuse the code.

**App-team integration note:** wire the inert Apply button in `promo-card.tsx` to `POST /api/rider/promo/validate`, display the returned `discount_iqd` as a preview, then pass `promo_code` into the booking call. Read `trip.promo_code_id` + `trip.discount_iqd` from the Trip response to confirm and display the applied discount on the booking confirmation screen.

### Admin dashboard (promo management)

All three endpoints are under `/api/admin/promo-codes`.

- **List:** `GET /api/admin/promo-codes` (any admin role) → `200 [PromoCode]`. Includes `redemption_count` and `max_redemptions` for capacity tracking.
- **Create:** `POST /api/admin/promo-codes` (**super_admin only**) — body `{ "code", "kind" ("percent"|"fixed"), "value", "active_from"?, "expires_at"?, "max_redemptions"? }` → `201 PromoCode`. Validation: percent `value` must be 1–100; fixed `value` must be > 0 (else 400). Duplicate code string → **409**.
- **Update / toggle:** `PATCH /api/admin/promo-codes/{id}` (**super_admin only**) — body any subset of `{ "active"?, "value"?, "active_from"?, "expires_at"?, "max_redemptions"? }` → `200 PromoCode`. Use `{ "active": false }` to disable a code immediately. → `404` if not found.

**PromoCode object** fields: `id, code, kind ("percent"|"fixed"), value, active, active_from?, expires_at?, max_redemptions?, redemption_count, created_at, updated_at`.

Limits enforced per code: per-rider-once (same rider cannot redeem twice), validity window (`active_from` / `expires_at`), global cap (`max_redemptions`, atomically checked), and the `active` toggle. All four are checked atomically at trip creation.

---

## Captain document upload (IMPORTANT for the Captain App)

The backend **owns document storage** (a private S3-compatible MinIO bucket). Sensitive ID images (national ID, licence, selfie) never go through the API process and are never publicly reachable — the client uploads **directly** to storage via a short-lived presigned URL, and admins review via a short-lived presigned GET. The Captain App flow:

> **Onboarding auth (phone + password) — UPDATED 2026-06-16.** **`POST /api/captains/register` now returns an onboarding token directly in its 201 body.** The body is the `Captain` object (status `pending`) **plus a `token` field** (`{ ...captain, token }`) — a captain JWT for this pending captain. So the flow is now: `otp/send` → `otp/verify` `{purpose:"register"}` → `{ticket}` → `POST /api/captains/register` `{ticket,...,password}` → **201 `{ ...captain, token }`** → upload the 5 docs with that `token` → poll `GET /api/captains/{id}` until `approved`. **No separate login round-trip is needed for onboarding.** (`POST /api/auth/captain/login` `{phone,password}` also still issues a token for `pending` captains — use it on app relaunch when you only have phone+password, not the register response. It 403s for `rejected`/`blocked`, 404 for unknown.) **Ownership is enforced:** a captain token may only read/write **its own** captain id (token `sub` == `{id}`); using another captain's id → **403**. Admin tokens may access any captain. A `pending` token grants ONLY this self-service onboarding + status-poll — every operational endpoint (go online, trip-queue, accept/start/complete, location ping, proxy, multi-stop) independently requires `approved` and returns **403** for a pending captain.

1. The captain picks/captures the image in-app.
2. **Request an upload target:** `POST /api/captains/{id}/documents/upload-url` `{ "doc_type": "national_id_front" }` → `200 { "upload_url", "object_key", "expires_in" }` (`expires_in` ~300s).
3. **Upload the file directly:** HTTP **PUT** the raw image bytes to `upload_url` (set `Content-Type` to the image type; do NOT send an Authorization header — the URL is pre-authorized). This goes straight to storage, not through the API, so the 2 MiB API body limit does not apply.
4. **Persist it:** `POST /api/captains/{id}/documents` `{ "doc_type": "national_id_front", "object_key": "<from step 2>" }` → `200 CaptainDocument`. Re-submitting the same `doc_type` replaces the previous one (upsert).

`doc_type` is one of the **5 required** types: `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. Check progress with `GET /api/captains/{id}/documents/completeness` → `{ complete, uploaded[], missing[] }`. An admin cannot approve until all 5 are present.

- **Admin review (Dashboard):** `GET /api/captains/{id}/documents` returns each document with `url` already set to a short-lived presigned **GET** URL (just render it). For a single fresh link, `GET /api/captains/{id}/documents/{doc_type}/view-url` → `{ "view_url", "expires_in" }`. Presigned URLs expire (~5 min) — fetch on demand, don't cache them long-term.
- **Bring-your-own fallback (legacy):** `POST .../documents` also still accepts `{ "doc_type", "url": "https://..." }` (a full URL you host yourself) instead of `object_key`. The presigned-upload flow above is strongly preferred; the URL fallback has no access control. Exactly one of `object_key`/`url` must be present (else 400).
- **Dev note:** when the backend runs without storage configured (local dev), the presign endpoints return deterministic `https://mock-storage.local/...` URLs you can stub against; the contract shape is identical.

## Rider profile photo upload

Rider avatars use the same private-storage presigned flow as captain documents (no image bytes through the API):

1. **Request an upload target:** `POST /api/riders/me/photo/upload-url` (bearer = rider token, no body) → `200 { "upload_url", "object_key", "expires_in" }` (`expires_in` ~300s). The `object_key` is per-rider, so a re-upload overwrites the previous avatar in place.
2. **Upload the file directly:** HTTP **PUT** the raw image bytes to `upload_url` (no Authorization header — the URL is pre-authorized). Bypasses the API body limit.
3. **Persist it:** `PATCH /api/riders/me` `{ "photo_url": "<object_key from step 1>" }`.
4. **Read it back:** `GET /api/riders/me` returns `photo_url` as a short-lived presigned **GET** URL (the backend swaps the stored key for a viewable URL on read). Don't cache it long-term.

- **Bring-your-own fallback:** `PATCH /api/riders/me` still accepts a full `https://...` URL in `photo_url` (hosted yourself); it's stored and returned as-is.
- **Dev note:** with unmanaged (mock) storage the URLs are deterministic placeholders; the contract shape is identical.

## Example payloads (copy-paste)

Concrete JSON for the most-used flows. Field-level truth is in Swagger; these are representative shapes.

**OTP verify → ticket — `POST /api/auth/otp/verify`**
```json
// request
{ "phone": "9647501234567", "code": "123456", "purpose": "register" }
// response 200 (a short-lived ticket; does NOT log you in)
{ "ticket": "9b1c4f2e-3a6d-4e88-bf01-2c7a9d6e0f33", "purpose": "register" }
```

**Rider register — `POST /api/auth/register`**
```json
// request (redeem a "register" ticket)
{ "ticket": "9b1c4f2e-...", "phone": "9647501234567", "password": "hunter2pass", "name": "Sara" }
// response 200
{ "token": "eyJhbGciOiJIUzI1NiII...", "user_id": "7c3e0b2a-1f4d-4a6e-9b21-2c9d8e5f0a11" }
```

**Rider login — `POST /api/auth/login`**
```json
// request
{ "phone": "9647501234567", "password": "hunter2pass" }
// response 200
{ "token": "eyJhbGciOiJIUzI1NiII...", "user_id": "7c3e0b2a-1f4d-4a6e-9b21-2c9d8e5f0a11" }
```

**Captain login — `POST /api/auth/captain/login`**
```json
// request
{ "phone": "9647509998888", "password": "drivepass1" }
// response 200 (role "captain"; user_id is the CAPTAIN id)
{ "token": "eyJhbGciOiJIUzI1NiII...", "user_id": "b91f7d52-0c3a-4e88-9f10-7a2b4c6d8e90" }
// 404 unknown phone; 403 not approved; 429 locked
```

**Trip object — returned by `POST /api/trips`, `GET /api/trips/{id}`**
```json
{
  "id": "f0e1d2c3-...",
  "trip_type": "regular",
  "status": "requested",
  "rider_id": "7c3e0b2a-...",
  "captain_id": null,
  "zone_id": "a1b2c3d4-...",
  "room_id": null,
  "pickup_lat": 33.3152, "pickup_lng": 44.3661,
  "dropoff_lat": 33.3400, "dropoff_lng": 44.4000,
  "fare_iqd": 4050,
  "distance_km": 7.0,
  "base_fare_iqd": 1000,
  "currency": "IQD",
  "promo_code_id": "c1d2e3f4-...",
  "discount_iqd": 450,
  "fare_per_rider_iqd": null,
  "distance_per_rider_km": null,
  "cancellation_reason": null,
  "cancelled_by": null,
  "requested_at": "2026-06-03T09:15:00Z",
  "accepted_at": null, "started_at": null, "completed_at": null, "cancelled_at": null,
  "version": 1
}
```
Note: `fare_iqd` is already net of `discount_iqd` (4500 − 450 = 4050). When no promo was applied both fields are `null`.

**Abriyah join — `POST /api/abriyah/join` response 201** (request body UNCHANGED; `room.zone_id` is the **dropoff** zone the room is keyed on)
```json
{
  "room": {
    "id": "1a2b3c4d-...", "zone_id": "a1b2c3d4-...", "room_type": "mixed",
    "status": "open", "max_riders": 4, "rider_count": 1, "captain_id": null,
    "expires_at": "2026-06-03T09:20:00Z", "dispatched_at": null,
    "created_at": "2026-06-03T09:15:00Z", "updated_at": "2026-06-03T09:15:00Z"
  },
  "member": { "id": "...", "room_id": "1a2b3c4d-...", "rider_id": "7c3e0b2a-...",
              "trip_id": "f0e1d2c3-...", "distance_km": 5.2, "fare_iqd": 3600, "joined_at": "2026-06-03T09:15:00Z" },
  "trip_id": "f0e1d2c3-...", "fare_iqd": 3600, "distance_km": 5.2
}
```

**Abriyah room members — `GET /api/abriyah/rooms/{id}/members` response 200** (captain; new `dropoff_zone` + `pickup_breakdown` wrapper)
```json
{
  "room_id": "1a2b3c4d-...",
  "dropoff_zone": { "zone_id": "a1b2c3d4-...", "name": "Karrada", "name_ar": "الكرادة" },
  "pickup_breakdown": [
    { "zone_id": "b2c3d4e5-...", "name": "Mansour", "name_ar": "المنصور", "rider_count": 3 },
    { "zone_id": null,           "name": null,      "name_ar": null,        "rider_count": 1 }
  ],
  "members": [
    { "rider_id": "7c3e0b2a-...", "name": "Sara", "phone": "9647501234567",
      "pickup_wkt": "POINT(44.36 33.31)", "dropoff_wkt": "POINT(44.40 33.34)",
      "fare_iqd": 3600, "distance_km": 5.2, "joined_at": "2026-06-03T09:15:00Z" }
  ]
}
```

**Promo validate — `POST /api/rider/promo/validate`** (rider Bearer; NEVER an HTTP error)
```json
// request
{ "code": "SUMMER10", "fare_iqd": 4500 }
// response 200 — valid percent code
{ "valid": true, "kind": "percent", "value": 10, "discount_iqd": 450, "message": "Promo applied" }
// response 200 — invalid/exhausted/already-used (same 200 status, valid:false)
{ "valid": false, "message": "Promo code has already been used" }
```

**Create promo code — `POST /api/admin/promo-codes`** (super_admin Bearer)
```json
// request — percent discount, time-bounded, capped
{ "code": "SUMMER10", "kind": "percent", "value": 10, "active_from": "2026-06-15T00:00:00Z", "expires_at": "2026-07-01T00:00:00Z", "max_redemptions": 500 }
// response 201
{
  "id": "c1d2e3f4-...", "code": "SUMMER10", "kind": "percent", "value": 10,
  "active": true, "active_from": "2026-06-15T00:00:00Z", "expires_at": "2026-07-01T00:00:00Z",
  "max_redemptions": 500, "redemption_count": 0,
  "created_at": "2026-06-15T08:00:00Z", "updated_at": "2026-06-15T08:00:00Z"
}
// request — fixed IQD discount, unlimited, always-on
{ "code": "FLAT500", "kind": "fixed", "value": 500 }
```

**Abriyah validate-pins — `POST /api/abriyah/validate-pins` response 200** (now dual-end; replaces old single `zone_id`)
```json
{ "valid": true, "dropoff_zone_id": "a1b2c3d4-...", "pickup_zone_id": "b2c3d4e5-...", "message": "ok" }
```

**WebSocket trip frame** (received on `rt:trip:{id}` via `GET /ws/subscribe?token=...&channel=rt:trip:{id}`)
```json
{ "id": "f0e1d2c3-...", "rider_id": "7c3e0b2a-...", "status": "accepted", "fare_iqd": 4500, "distance_km": 7.0 }
```

**Error (any failing request)**
```json
{ "error": "conflict: rider already has an active trip" }
```

## Security notes for clients

- **No secrets in responses.** A `PaymentMethod` returns only `masked_last4` and `method_type`; the gateway `gateway_token` is **never** returned. Proxy/call-masking endpoints return only masked `+964…` numbers; **real phone numbers are never exposed** to the other party (room-member rosters are the one place a captain sees a rider's raw phone, by design, for the assigned captain only).
- **Token handling.** Store the JWT securely (Keychain / Keystore, not plaintext). Rider/captain tokens last 30 days; admin tokens 8 hours. A mid-session admin role-downgrade or disable **revokes existing tokens immediately** (`401` on the next call) — handle `401` by routing to re-login. There is no refresh-token flow; on `401`, re-authenticate.
- **WS token in URL.** The WS token is a query param (unavoidable for WebSocket upgrades). It is sent over TLS to the proxy; still, treat WS URLs as sensitive (don't log them).
- **CORS.** In production the API allows exactly one configured browser origin (the Admin Dashboard). Native mobile apps are unaffected by CORS; the dashboard origin must match what ops configured.

## Conventions

- IDs are UUIDs. Money is integer IQD (no decimals). Timestamps are RFC3339 / `TIMESTAMPTZ`, server timezone Asia/Baghdad for daily-activation semantics.
- Errors: 400 validation, 401 unauthenticated, 403 wrong role, 404 not found, 409 conflict. Body is a single-field envelope `{ "error": "<human message>" }` on every error response. There is no separate `message` field. Validation/conflict detail is in that string (e.g. `{ "error": "bad request: rate limited: too many OTP requests" }`).
- Bilingual fields carry `_ar` / `_en` variants where the PRD requires Arabic-first content.
- Zone polygons are exchanged as WKT (`POLYGON((lng lat, ...))`).

_Status: **all 13 phases (0–12) are Live.** This document is the implemented API contract as of the deployment-readiness pass; it is no longer a forward plan._
