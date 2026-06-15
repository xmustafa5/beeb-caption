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

- **Riders:** phone + OTP.
  - `POST /api/auth/otp/send` — body `{ "phone": "9647501234567" }` (international, with or without leading `+`, 10–15 digits). We generate a 6-digit code, store a hash, and deliver via OTPIQ (or log it in dev/MockSms). Response `200 { "message": "OTP sent" }`. Rate-limited to 10 sends per phone per 10 min (429-class → `400 { "error": "bad request: rate limited: too many OTP requests" }`).
  - `POST /api/auth/otp/verify` — body `{ "phone", "code", "name?" }`. Optional `name` is set atomically on first-time account creation only (never overwrites an existing name). Response `200 { "token": "<jwt>", "user_id": "<uuid>" }`. Wrong/expired code → `401`; 5-attempt cap per challenge; blocked account → `403`.
  - `GET /api/riders/me` (Bearer) → rider profile. `PATCH /api/riders/me` (Bearer) — body any of `{ "name", "photo_url", "gender" }`; `gender ∈ {"m","f","unset"}` (else `400`).
- **Admins:** `POST /api/auth/admin/login` — body `{ "email", "password" }` → `200 { "token", "user_id" }`. Wrong/unknown credentials → `401` (no user enumeration); disabled account → `403`. Seeded super-admin for dev: `admin@beep.iq` / `ChangeMe123!` (change before deploy).
  - Admin-user management (super_admin only): `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/{id}`. Guards: cannot delete your own account or the last super-admin (`400`); duplicate email (`409`). New admins get a server-generated temporary password (surfaced via the invite flow in Phase 8).
- **JWT claim shape:** `{ "sub": <uuid>, "role": "rider" | "captain" | "super_admin" | "operator" | "finance", "exp", "iat" }`. HS256. Rider + captain tokens last 30 days; admin tokens 8 hours. For a captain token, `sub` is the **captain id**; for a rider token, `sub` is the user id.
- All authenticated requests send `Authorization: Bearer <jwt>`. Role-gated endpoints return `403` for a valid token with insufficient role, `401` for a missing/invalid token.
- **Captains (LIVE):** phone + OTP, gated on admin approval.
  - `POST /api/auth/otp/send` — same endpoint as riders (delivers the code to the phone).
  - `POST /api/auth/captain/otp/verify` — body `{ "phone", "code" }` (no `name`). Returns `200 { "token", "user_id": <captain_id> }` with `role: "captain"` **only if the captain is registered AND admin-approved**. A phone with no captain account → `404`; a captain not yet approved (pending/rejected/blocked) → `403`. The captain must complete onboarding (register + upload all 5 documents) and be approved by an admin before they can obtain a token.
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

**Frame format — IMPORTANT.** Each message is a **JSON text frame containing the event payload object directly**. There is **no envelope and no event-type field inside the frame** — the `beep.*` action name (e.g. `beep.trip.accepted`) is the audit/internal name and is **NOT** sent on the wire. The client correlates by:
1. **The channel it subscribed to** (you already know if a frame is a trip vs room vs location vs ops event from which socket/channel it arrived on), and
2. **The fields in the payload** — for trip frames, the `status` field is the state signal (`requested` → `accepted` → `in_progress` → `completed`/`cancelled`).

Per-channel frame shapes (the keys actually published today):

| Channel | Typical frame payload (JSON object) | Notes |
|-|-|-|
| `rt:trip:{id}` | `{ "id", "rider_id", "status", "fare_iqd", "distance_km" }` | Trip lifecycle. Watch `status` for transitions. Some transitions publish a fuller object; treat extra keys as additive. |
| `rt:trip:{id}` (location during active trip) | a captain-location object: `{ "captain_id", "longitude", "latitude", "last_ping_at", ... }` | The captain's GPS pings are forwarded onto the active trip's channel so the rider can animate the car. Distinguish from a lifecycle frame by the presence of `longitude`/`latitude`. |
| `rt:captain:{id}` | offer broadcast: `{ "trip_id", "captain_id", "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "fare_iqd", "distance_km" }` | A dispatch offer to this captain. The Captain App should also rely on the durable FCM push (below) for backgrounded delivery. |
| `rt:captain:{id}:location` | `{ "captain_id", "longitude", "latitude", "last_ping_at", "online" }` | The captain's own location echo (used by `/ws/captain`). |
| `rt:room:{id}` | room object: `{ "id"/"room_id", "zone_id", "room_type", "status", "rider_count", "max_riders", ... }` | Abriyah room lifecycle (`open`/`locked`/`dispatched`/`expired`). |
| `rt:admin:ops` | mixed ops events (trip/room/city/location), each a plain object | Admin live map / ops feed. Admins infer kind from the fields present. |
| `rt:zone:{id}` | `{ "event": "beep.zone.updated", "zone_id", ... }` | **The one channel that DOES carry an inline `event` field.** Cache-invalidation signal — refresh cached zone pricing within ~30s. |

> Design note for clients: because frames (except `rt:zone:*`) don't carry an event-type discriminator, build your handlers around **(channel, payload fields)**, not a `type` switch. The backend may add an envelope/`event` field in a future version; tolerate unknown extra keys. If your team needs an explicit per-frame event type, raise it with the backend team — it's a small additive change.

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
| Onboarding (OTP) | 1 **Live** | `POST /api/auth/otp/send`, `POST /api/auth/otp/verify`; `GET/PATCH /api/riders/me` |
| Service-area lookup (zones) | 2 **Live** | `GET /api/zones` (active only), `GET /api/zones/{id}` — polygons as WKT |
| Regular booking | 5 **Live** | `GET /api/trips/estimate` (public), `POST /api/trips` (regular), `GET /api/trips/{id}`, `POST /api/trips/{id}/cancel`. **On completion the fare is charged to the rider wallet** (best-effort: a debit failure is logged + recorded as a `failed` ledger row but never blocks completion). **Cancelling after a captain has accepted** incurs a flat penalty (admin-tunable `trip.cancellation_penalty_iqd`, default 2000 IQD); cancelling while still `requested`/`matched` is free. Card capture is still MockGateway (real PSP at v2) |
| Abriyah booking + waiting room | 6 **Live** | `POST /api/abriyah/validate-pins`, `POST /api/abriyah/join`, `GET /api/abriyah/rooms/{id}`, `DELETE /api/abriyah/leave` (+ `rt:room:{id}` events) |
| Live trip | 5 + 7 **Live** | `GET /api/trips/{id}`; trip events on `rt:trip:{id}` live over `GET /ws/subscribe?channel=rt:trip:{id}` (captain location pings forwarded onto the active trip's channel) |
| Rate | 5 **Live** | `POST /api/trips/{id}/ratings` (editable 7 days via `PUT /api/trips/{id}/ratings/{rating_id}`) |
| Trip history | 5 **Live** | `GET /api/trips?rider_id={id}` |
| Wallet / pay (payment-ready) | 10 **Live** | `GET /api/me/wallet` (auto-provisions), `POST /api/me/wallet/topup` `{amount_iqd, payment_method_id?}`, `GET/POST /api/me/payment-methods`, `PUT /api/me/payment-methods/{id}/default`, `DELETE /api/me/payment-methods/{id}`, `GET /api/me/transactions`. MockGateway (no real PSP yet); `gateway_token` never returned |
| Scheduled / multi-stop | 11 **Live** | `GET/POST /api/rider/scheduled-trips`, `GET/PUT /api/rider/scheduled-trips/{id}`, `POST .../{id}/cancel`; `GET/POST /api/rider/trips/{id}/stops` (max 3), `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach` |
| Masked numbers | 11 **Live** | `GET /api/rider/trips/{id}/proxy` + `GET /api/captain/trips/{id}/proxy` → masked `ProxySession` (lazy-allocated; real numbers never exposed) |

### Captain App
| Capability | Phase | Key endpoints |
|-|-|-|
| Onboarding (OTP login) | 1+3 **Live** | `POST /api/auth/otp/send` then `POST /api/auth/captain/otp/verify` `{phone,code}` → captain token (approved only; pending → 403, unknown → 404). Register device for push: `POST /api/me/fcm-token` `{fcm_token}` |
| Registration + documents | 3 **Live** | `POST /api/captains/register` (public); presigned upload `POST /api/captains/{id}/documents/upload-url` → PUT to storage → `POST /api/captains/{id}/documents` `{doc_type, object_key}`; `GET /api/captains/{id}/documents`; `GET /api/captains/{id}/documents/completeness`. **5 required document types** before an admin can approve: `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. See [Captain document upload](#captain-document-upload-important-for-the-captain-app) |
| Approval pending | 3 **Live** | `GET /api/captains/{id}` (status: pending/approved/rejected/blocked) |
| Activate Today | 4 + 10 **Live** | `GET/POST /api/captain/activation/today` (gate status / activate). **P10:** POST now charges the captain wallet — success → 201 `status:"paid"` + `collected_at`; insufficient funds → **402** `payment required: Insufficient wallet balance` + row `status:"failed"`/`charge_error` (CTA persists; top up then retry) |
| Online toggle + location | 7 **Live** | `PUT /api/captain/online` `{online}` (gated by today's activation — 403 if not activated), `POST /api/captain/location` `{longitude,latitude}` ping, `POST /api/captain/location/flush` `{pings:[...]}` (last wins), `GET /api/captain/location`; live trip stream over `GET /ws/captain?token=` |
| Trip queue + accept | 5 + 7 **Live**; room accept 6 **Live** | `GET /api/captain/trip-queue` (pending regular trips + open rooms; **women-only rooms hidden unless captain gender = f**); `POST /api/trips/{id}/accept`; `POST /api/abriyah/rooms/{id}/accept` (room → dispatched), `GET /api/abriyah/rooms/{id}/members`; offers fan out live on `rt:captain:{id}` (WS) + a durable `new_trip_in_queue` FCM push |
| Live trip legs | 5 **Live** | `POST /api/trips/{id}/{arrive,start,complete}` |
| Earnings | 5 **Live** | `GET /api/captains/{id}/earnings?period=today\|week\|month` (gross minus daily fee); `GET /api/captains/{id}/earnings/history` |

### Admin Dashboard
| Capability | Phase | Key endpoints |
|-|-|-|
| Dashboard (KPIs + Needs Action) | 8 **Live** | `GET /api/admin/dashboard/kpis`, `.../highlights`, `.../needs-action/{counts,pending-captains,flagged-trips,expired-rooms,stuck-items}`, `POST .../needs-action/dismiss` |
| Operations (live map + rooms + force) | 8 **Live** | `GET /api/admin/operations/{trips,rooms}` (filters); `POST /api/admin/operations/trips/{id}/force-cancel`, `.../rooms/{id}/{force-dispatch,force-expire}` (super_admin) |
| Live Rooms (Abriyah Kanban) | 6 **Live** (force actions: 8 **Live**) | `GET /api/admin/rooms?status=&zone_id=`, `GET /api/admin/rooms/{id}` (room + members); force-dispatch/expire via Operations |
| Cities + Zones (CRUD + polygon + pricing + import) | 2 **Live**; city activate 11 **Live** | `GET/POST/PUT /api/admin/cities[/{id}]`, `POST .../cities/{id}/{activate,deactivate}` (P11, idempotent → 409 on no-op); `GET/POST/PUT /api/admin/zones[/{id}]`, `POST .../zones/{id}/{archive,restore}`, `PUT .../zones/{id}/pricing`, `POST .../zones/import`, `POST .../zones/validate-polygon` |
| Scheduled trips (admin view) | 11 **Live** | `GET /api/admin/scheduled-trips?status=&rider_id=&limit=&offset=` |
| Captains (approval queue + lifecycle + import) | 3 **Live** | `GET /api/captains`, `GET /api/captains/pending`; `POST /api/captains/{id}/{approve,reject}` (admin), `.../{block,unblock,reconsider}` (super_admin); `POST /api/captains/bulk-import` |
| Daily activation log + fee waiver | 4 **Live** | `GET /api/admin/activations` (filter + fee sum), `GET /api/admin/activations/{id}`; `POST /api/admin/activations/{id}/waive` (super_admin) |
| Customers (directory + detail + block) | 8 **Live** | `GET /api/admin/customers` (phone/blocked filter, paged), `GET .../{id}`, `GET .../{id}/history`; `POST .../{id}/{block,unblock}`, `PUT .../{id}/gender` (super_admin) |
| Admin login + admin users | 1 + 8 **Live** | `POST /api/auth/admin/login`; `GET/POST /api/admin/users` (list/invite, P8), `POST .../{id}/{resend-invite,disable,enable}`, `PUT .../{id}/role` (P8, super_admin); `PATCH/DELETE /api/admin/users/{id}` (name edit/delete, P1) |
| Setup (config singletons) | 8 **Live** | `GET /api/admin/settings`, `GET/PUT .../settings/{key}` (PUT super_admin; range-validated; non-retroactive) |
| Reports (7 reports + CSV) | 9 **Live** | `GET /api/reports/{trips/volume,trips/abriyah-performance,trips/cancellations,captains/leaderboard,captains/daily-activation,financial/revenue-by-zone,financial/activation-fees}`; every report takes `?period=&from=&to=` (+ optional `zone_id`/`city_id`/`limit`/`room_type`) and `&export=csv`; role-tiered (see Reports section) |
| Payments (wallet/refund console) | 10 **Live** | `GET /api/admin/wallets/{owner_id}?owner_type=`, `POST .../wallets/{owner_id}/topup` (admin credit, no charge); `GET /api/admin/transactions` (filters), `GET .../transactions/{id}`; `GET /api/admin/refunds` (status filter), `GET .../refunds/{id}`, `POST .../refunds` (submit), `POST .../refunds/{id}/{approve,reject}`; `GET /api/reports/financial/collected?from=&to=` (collected revenue, finance/super_admin) |
| Bulk actions (approve / archive / export) | 12 **Live** | `POST /api/admin/bulk/captains/approve` `{captain_ids[],note?}` (max 100), `POST .../bulk/zones/archive` `{zone_ids[]}` (max 50), `POST .../bulk/trips/export` (filterable, ≤10k rows). All return per-row outcomes; see Phase 12 section |
| Search Command Center (⌘+K) | 12 **Live** | `GET /api/admin/search?q=` → up to 50 merged results across captains/users/trips/zones/rooms, each with a deep-link `url_path` |
| App preferences (per-admin UI toggles) | 12 **Live** | `GET /api/admin/me/preferences`, `PUT .../me/preferences` `{pref_key,pref_value}`, `DELETE .../me/preferences/{pref_key}` (204). Known keys: `operations.live_rooms.view` (`table`\|`kanban`), `captains.pending.view` (`table`\|`inbox`) |
| Bulk actions + search | 12 | bulk approve/archive/export; search registry |

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

State machine: `pending → approved | rejected`; `approved ↔ blocked`; `rejected → pending` (reconsider). All transitions are guarded — an action from the wrong state returns 400 with a clear message.

- **Self-registration (public, no auth):** `POST /api/captains/register` `{ phone, name, name_ar, gender ("m"|"f"), car_make, car_model, car_plate, city_id, car_color?, national_id? }` → 201 `Captain` (status `pending`). Phone and plate are globally unique (409 on dup). Gender is locked after creation.
- **Documents (authenticated):** **5 required types** — `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. `POST /api/captains/{id}/documents` `{ doc_type, url }` upserts (re-upload replaces). `GET .../documents` lists; `GET .../documents/completeness` → `{ complete, uploaded[], missing[] }`. The client uploads the file elsewhere and submits the resulting `url`.
- **Approval (admin):** `POST /api/captains/{id}/approve` requires **all 5 documents** (else 400). `POST .../reject` `{ reason, comment? }` where `reason ∈ {documents_invalid, vehicle_unfit, identity_mismatch, existing_account, other}`.
- **Block/unblock/reconsider (super_admin only):** `POST .../block` `{ reason }` (only from approved; force-cancels active trips at Phase 5 and signs the captain out), `.../unblock` (→ approved), `.../reconsider` (rejected → pending).
- **Queues (admin):** `GET /api/captains` filters `?status=&city_id=&gender=&page=&per_page=` and returns `{ items: CaptainRow[], total, page, per_page }` (each row has `doc_count`). `GET /api/captains/pending` is the review queue, oldest-first.
- **Bulk import (admin):** `POST /api/captains/bulk-import` `{ rows: [...] }` → `{ accepted, rejected, errors: [{ row (1-based), reason }] }`. Dedups phone and plate within the batch and against the DB; partial-commit.
- **Events:** `beep.captain.{registered, approved, rejected, blocked}` are published (audit + `rt:captain:*`). FCM pushes are enqueued for approve/reject/block (delivered at Phase 7).
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

- **Fare estimate (public, no auth):** `GET /api/trips/estimate?pickup_lat=&pickup_lng=&dropoff_lat=&dropoff_lng=&zone_id=` → `200 { fare_iqd, distance_km, base_fare_iqd, currency }`. Fare = `base_fare_iqd + round(distance_km × per_km)`; `per_km` is the zone's `abriyah_per_km_iqd` when `zone_id` is given and positive, else the city default. Distance is haversine km. Defaults: base 1000 IQD, per-km 500 IQD (Phase 8 moves these to settings).
- **Request (rider):** `POST /api/trips` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, zone_id? }` → `201 Trip` (status `requested`, fare/distance computed, `base_fare_iqd` captured immutably). A rider with an active (non-terminal) trip gets `409`. Dispatch fans the offer out to eligible captains on `rt:captain:{id}` and publishes `beep.trip.requested` on `rt:trip:{id}`.
- **Accept (captain):** `POST /api/trips/{id}/accept` → `200 Trip` (status `accepted`, `captain_id`/`accepted_at` set). Works from `requested` (regular) **and** `matched` (Abriyah, Phase 6) — the handler routes through the state machine. A captain with an active trip gets `409`; a stale accept (someone already took it) gets `409`.
- **Arrive / Start / Complete (captain):** `POST /api/trips/{id}/arrive` (cue only, no status change), `POST .../start` (`accepted → in_progress`), `POST .../complete` (`in_progress → completed`). Complete writes the per-rider breakdown `fare_per_rider_iqd` / `distance_per_rider_km` as `{ rider_id: value }` (single entry for a regular trip; Phase 6 fills multiple for Abriyah). Events `beep.trip.{accepted,arrived,started,completed}`.
- **Cancel (rider/captain/admin):** `POST /api/trips/{id}/cancel` `{ reason, comment? }`. Actor derived from the token role. Allowed transitions: rider/captain from `requested`/`accepted`; **only admin** from `in_progress`. Invalid actor/state → `400`. `reason ∈ {changed_mind, wait_too_long, wrong_pickup, captain_late, safety, system_timeout, captain_blocked, other}`. The cascade notifies the other party, re-dispatches if a captain bailed on an accepted trip, and publishes `beep.trip.cancelled`. Blocking a captain (Phase 3) force-cancels their active trip here with `reason=captain_blocked`.
- **Ratings:** after completion, `POST /api/trips/{id}/ratings` `{ stars (1-5), comment? }` → `201 Rating`. A rider rates the captain and vice-versa; the ratee is derived from the trip. One rating per rater per trip (`409` on repeat); non-participants get `403`; rating an incomplete trip → `400`. Edit within **7 days** via `PUT /api/trips/{id}/ratings/{rating_id}` (after the lock cron stamps `locked_at`, edits → `400`). `GET /api/trips/{id}/ratings` lists them.
- **List / detail:** `GET /api/trips?rider_id=&captain_id=&status=&page=&per_page=` → `{ items: Trip[], total, page, per_page }`. `GET /api/trips/{id}` → `Trip`.
- **Earnings (captain):** `GET /api/captains/{id}/earnings?period=today|week|month` → `{ gross_iqd, activation_fee_iqd, net_iqd, trip_count, period }` (net = gross − daily activation fee; full per-day fee accounting lands in P10). `GET /api/captains/{id}/earnings/history?period=…` → `{ items: [{ trip_id, fare_iqd, trip_type, completed_at }] }`.
- **Trip object** key fields: `id, trip_type ("regular"|"abriyah"), status, rider_id, captain_id?, zone_id?, room_id?, pickup_lat/lng, dropoff_lat/lng, fare_iqd, distance_km, base_fare_iqd, currency, fare_per_rider_iqd?, distance_per_rider_km?, cancellation_reason?, cancelled_by?, requested_at, accepted_at?, started_at?, completed_at?, cancelled_at?, version`.
- **WS channels:** `rt:trip:{id}` (rider + captain follow trip state) and `rt:captain:{id}` (offer push). The real-time **subscriber/push loop lands in Phase 7**; Phase 5 already publishes every event to Redis + writes the audit trail.
- **Dispatch at v1 is a degraded stub:** offers fan out to all approved + activated-today captains (no geo ranking yet — `captain_locations` + nearest-captain ordering land in Phase 7). The first captain to `accept` wins (optimistic lock). There is no auto-timeout cancel at v1 (it would race the accept); Phase 7 adds the real per-captain 15s window.

## Abriyah Rooms (Phase 6 — Live)

Abriyah is the zone-shared-ride differentiator: riders heading to the **same dropoff (destination) zone** pool into a **room**; one captain takes the whole room. Rooms are keyed by the **dropoff** zone — pickups may be in any active service zone, so **cross-zone trips are supported** (pickup zone ≠ dropoff zone is fine). Each rider gets an **independent per-rider fare** (`base + round(distance_km × per_km)`) priced from **their own pickup zone** (falls back to the standard fare when the pickup zone isn't Abriyah-priced) — riders do not split a single fare. Women-only eligibility is determined by the **dropoff** zone's setting. Room lifecycle: `open → locked → dispatched | expired`.

- **Validate pins (rider, per-drag):** `POST /api/abriyah/validate-pins` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng }` → `200 { valid, dropoff_zone_id?, pickup_zone_id?, message }`. The two ends resolve **independently**: `valid` is true only when the **dropoff** is in an Abriyah-enabled zone AND the **pickup** is in some active zone. Either id may be present even when `valid:false` (e.g. dropoff resolves but pickup doesn't). The request still accepts a `zone_id` but it is **deprecated/ignored**. **Never an HTTP error** — `valid:false` carries a human message. Call on every pin drag for inline feedback before joining.
- **Join (rider):** `POST /api/abriyah/join` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, room_type ("mixed"|"women_only") }` (request body unchanged) → `201 { room, member, trip_id, fare_iqd, distance_km }`. The backend detects the Abriyah zone from the **dropoff**, keys the room by it (pickup may be in any active zone), prices the per-rider fare from the **pickup** zone, finds an open non-full room of that type in the dropoff zone or opens a new one, adds the rider, and creates a **matched** Abriyah trip. `room.zone_id` is the **dropoff** zone. Errors (all `400` unless noted): dropoff not in an Abriyah zone; pickup not in any active service zone; invalid `room_type`; women-only not allowed in the **dropoff** zone; women-only by a non-female rider → `403`; rider already in a room → `409`.
- **Room detail (rider):** `GET /api/abriyah/rooms/{id}` → `{ room, members: RoomMember[] }`.
- **Leave (rider):** `DELETE /api/abriyah/leave` → `200 { message }`. Removes the rider from their open/locked room, decrements the count, and cancels their trip. `400` if not in any active room.
- **Accept (captain):** `POST /api/abriyah/rooms/{id}/accept` → `200 Room` (status `dispatched`). Locks the open room to the captain and immediately dispatches it: **every member trip transitions `matched → accepted`** with the captain assigned. Errors: room not open → `400`; women-only room by a non-female captain → `403`; captain not approved → `403`; captain already in a room → `409`.
- **Room members (captain, assigned only):** `GET /api/abriyah/rooms/{id}/members` → `{ room_id, dropoff_zone: { zone_id, name, name_ar }, pickup_breakdown: [{ zone_id, name, name_ar, rider_count }], members: [{ rider_id, name, phone, pickup_wkt, dropoff_wkt, fare_iqd, distance_km, joined_at }] }`. `dropoff_zone` is the shared destination; `pickup_breakdown` counts riders per pickup zone (a `zone_id:null` entry groups pickups outside any active zone). `403` for any captain other than the assigned one. (Room-members still returns the raw rider phone; the Phase 11 proxy is a separate per-trip endpoint — `GET /api/captain/trips/{id}/proxy` — for the live 1:1 trip call, not the room roster.)
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
- **Customers:** `GET /api/admin/customers?phone=&blocked=&page=&per_page=` → `{ items: CustomerRow[], page, per_page }` (`total_trips`, `cancellation_count`, `blocked`). `GET .../customers/{id}` → `CustomerDetail` (+ `avg_rating_received/given`, `blocked_reason`). `GET .../customers/{id}/history` → audit `ActivityHighlight[]`. **Super_admin writes:** `POST .../{id}/block` `{ reason }` (**reason ≥ 10 chars** else 400; already-blocked → 409; **does NOT cancel in-flight trips** — the block bites at next OTP login), `POST .../{id}/unblock`, `PUT .../{id}/gender` `{ gender: "m"|"f"|"unset" }` (audited before/after).
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
  - **Abriyah Performance:** `zone_name, rooms_opened, rooms_dispatched, rooms_expired, fill_rate_pct, avg_wait_seconds, women_only_rooms, women_only_share_pct`. Wait = `dispatched_at − opened_at` (seconds); **expired rooms are excluded from the wait average** but counted in `rooms_opened`/`rooms_expired`.
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

## Privacy, Scheduling, Multi-City (Phase 11 — Live)

### Scheduled trips (Customer App, `require_role "rider"`)
- `POST /api/rider/scheduled-trips` `{ trip_type:"regular", pickup_lat/lng, pickup_address?, dropoff_lat/lng, dropoff_address?, scheduled_for }` → 201 `ScheduledTrip` (status `pending`). **`scheduled_for` must be 30 min – 7 days out** (else 400); **regular only** (abriyah → 400).
- `GET /api/rider/scheduled-trips` → the rider's own list. `GET /api/rider/scheduled-trips/{id}` (owner only). `PUT .../{id}` updates time/pickup/dropoff (pending only; same time-window guard). `POST .../{id}/cancel` `{ reason? }` → `cancelled` (owner + pending only, else 403/409).
- A background scheduler tick (every 60s) **promotes** a due pending trip into a live REQUESTED trip (`status → promoted`, `promoted_trip_id` set), then the normal dispatch flow takes over. Overdue-by-5-min pending trips are marked `expired`. `ScheduledTrip.status`: `pending | promoted | cancelled | expired`.
- Admin: `GET /api/admin/scheduled-trips?status=&rider_id=&limit=&offset=`.

### Multi-stop (regular trips)
- `POST /api/rider/trips/{id}/stops` `{ lat, lng, address? }` → 201 `TripStop` (`seq` auto 1..3). **Max 3 stops** (4th → 409); trip must be `regular` + `accepted`/`in_progress` (else 400); rider must own the trip (else 403). `GET /api/rider/trips/{id}/stops` lists them.
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

## Captain document upload (IMPORTANT for the Captain App)

The backend **owns document storage** (a private S3-compatible MinIO bucket). Sensitive ID images (national ID, licence, selfie) never go through the API process and are never publicly reachable — the client uploads **directly** to storage via a short-lived presigned URL, and admins review via a short-lived presigned GET. The Captain App flow:

1. The captain picks/captures the image in-app.
2. **Request an upload target:** `POST /api/captains/{id}/documents/upload-url` `{ "doc_type": "national_id_front" }` → `200 { "upload_url", "object_key", "expires_in" }` (`expires_in` ~300s).
3. **Upload the file directly:** HTTP **PUT** the raw image bytes to `upload_url` (set `Content-Type` to the image type; do NOT send an Authorization header — the URL is pre-authorized). This goes straight to storage, not through the API, so the 2 MiB API body limit does not apply.
4. **Persist it:** `POST /api/captains/{id}/documents` `{ "doc_type": "national_id_front", "object_key": "<from step 2>" }` → `200 CaptainDocument`. Re-submitting the same `doc_type` replaces the previous one (upsert).

`doc_type` is one of the **5 required** types: `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. Check progress with `GET /api/captains/{id}/documents/completeness` → `{ complete, uploaded[], missing[] }`. An admin cannot approve until all 5 are present.

- **Admin review (Dashboard):** `GET /api/captains/{id}/documents` returns each document with `url` already set to a short-lived presigned **GET** URL (just render it). For a single fresh link, `GET /api/captains/{id}/documents/{doc_type}/view-url` → `{ "view_url", "expires_in" }`. Presigned URLs expire (~5 min) — fetch on demand, don't cache them long-term.
- **Bring-your-own fallback (legacy):** `POST .../documents` also still accepts `{ "doc_type", "url": "https://..." }` (a full URL you host yourself) instead of `object_key`. The presigned-upload flow above is strongly preferred; the URL fallback has no access control. Exactly one of `object_key`/`url` must be present (else 400).
- **Dev note:** when the backend runs without storage configured (local dev), the presign endpoints return deterministic `https://mock-storage.local/...` URLs you can stub against; the contract shape is identical.

## Example payloads (copy-paste)

Concrete JSON for the most-used flows. Field-level truth is in Swagger; these are representative shapes.

**OTP verify (rider) — `POST /api/auth/otp/verify`**
```json
// request
{ "phone": "9647501234567", "code": "123456", "name": "Sara" }
// response 200
{ "token": "eyJhbGciOiJIUzI1NiII...", "user_id": "7c3e0b2a-1f4d-4a6e-9b21-2c9d8e5f0a11" }
```

**Captain verify — `POST /api/auth/captain/otp/verify`**
```json
// request
{ "phone": "9647509998888", "code": "654321" }
// response 200 (role "captain"; user_id is the CAPTAIN id)
{ "token": "eyJhbGciOiJIUzI1NiII...", "user_id": "b91f7d52-0c3a-4e88-9f10-7a2b4c6d8e90" }
// 404 if no captain for that phone; 403 if not yet admin-approved
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
  "fare_iqd": 4500,
  "distance_km": 7.0,
  "base_fare_iqd": 1000,
  "currency": "IQD",
  "fare_per_rider_iqd": null,
  "distance_per_rider_km": null,
  "cancellation_reason": null,
  "cancelled_by": null,
  "requested_at": "2026-06-03T09:15:00Z",
  "accepted_at": null, "started_at": null, "completed_at": null, "cancelled_at": null,
  "version": 1
}
```

**Abriyah join — `POST /api/abriyah/join` response 201**
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
