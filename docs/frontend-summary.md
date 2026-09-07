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
  - **Rate limit:** ~200 requests/second per client IP, burst 400. Exceeding it returns HTTP `429` (no JSON body guaranteed from the limiter layer). Back off and retry. **Exempt from the limiter (since 2026-06-17):** the high-frequency endpoints the apps poll continuously — `GET/POST /api/captain/location`, `POST /api/captain/location/flush`, `PUT /api/captain/online`, `GET/POST /api/captain/activation/today`, **`GET /api/trips` and `GET /api/trips/{id}`** (active-trip polling), **`GET /api/rider/trips/{id}/captain-location`** (live-car snapshot, refetched on every map open and reconnect), **`GET /api/rider/captains/nearby`** (idle-map nearby cars, polled ~every 6s while the pickup map is open), and the **WebSocket routes `/ws/captain` and `/ws/subscribe`** (a rate-limited handshake would break the live connection). These are not rate-limited (avoids 429s when several captains/testers share one NAT IP). All other endpoints — including `POST /api/trips` and trip mutations (accept/arrive/start/complete/cancel), auth, payments, admin — remain limited.
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
  - **`POST /api/auth/phone-status` (NEW, LIVE — call right after the phone field) — body `{ "phone" }` → `200 { "phone", "rider_exists", "captain_exists", "registered" }`.** Use this to branch a single phone input to **Login** (phone already has an account → ask password, call `/api/auth/login`) vs **Signup** (not registered → send OTP + collect name). Public, no auth, no OTP sent. `captain_exists` counts only active (non-archived) captains. The returned `phone` is the normalized form (leading `+` stripped). **This fixes the reported flow gap** where a returning user could fill the whole signup form and only get a `409` at the final register step. Bad phone → `400`. (Account-enumeration is the accepted trade-off for the clean branch.)
  - `POST /api/auth/otp/send` — body `{ "phone": "9647501234567" }` (international, with or without leading `+`, 10–15 digits). We generate a 6-digit code, store a hash, and deliver via OTPIQ (or log it in dev/MockSms). **Response shape changed: `200 { "message": "OTP sent", "already_registered": <bool> }`** — `already_registered` is true when the phone already belongs to a rider or active captain, so a client that skipped `phone-status` can still branch to Login after sending. Rate-limited to 10 sends per phone per 10 min (429-class → `400 { "error": "bad request: rate limited: too many OTP requests" }`). Used by riders **and** captains, for **both** registration and password reset.
  - `POST /api/auth/otp/verify` — body `{ "phone", "code", "purpose" }` where `purpose ∈ {"register","reset"}`. This **no longer logs anyone in**; on success it returns a short-lived **ticket** to redeem at register/reset: `200 { "ticket": "<uuid>", "purpose": "<register|reset>" }`. Wrong/expired code → `401`; >5 attempts, or bad phone/purpose → `400`. (No `name` field here anymore.)
  - **Recommended signup/login flow (single phone field):** enter phone → `POST /api/auth/phone-status` → if `registered` show **Login** (ask password → `/api/auth/login`), else show **Signup** (`otp/send` → `otp/verify` `{purpose:"register"}` → `/api/auth/register`). The duplicate-phone `409` at register is now only a safety net, not the primary signal.
  - `POST /api/auth/register` — rider signup. Body `{ "ticket", "phone", "password", "name?" }`. Consumes a verified `register` ticket and creates the rider with the password. Response `200 { "token": "<jwt>", "user_id": "<uuid>" }`. Weak password (min 8 chars) or bad phone → `400`; invalid/expired/already-used ticket → `401`; phone already registered → `409`.
  - `POST /api/auth/login` — rider login. Body `{ "phone", "password" }` → `200 { "token", "user_id" }`. Invalid credentials → `401`; blocked account → `403`; too many failed attempts (5) → `429` (per-phone lockout, 15 min, cleared on a successful login).
  - `GET /api/riders/me` (Bearer) → rider profile. `PATCH /api/riders/me` (Bearer) — body any of `{ "name", "photo_url", "gender" }`; `gender ∈ {"m","f","unset"}` (else `400`).
  - **On-device OTP testing (issue #7):** `otp/send` returning `200` means the code was **enqueued** to the SMS provider (OTPIQ), not that it was delivered — so "200 but no SMS" is a delivery/config problem, not a client bug. Two operator-side handles: (1) **test numbers** — phones in the server's `TEST_OTP_PHONES` allowlist accept a fixed `TEST_OTP_CODE` at `otp/verify` regardless of SMS (dev QA numbers `9647000000099` / `...098` are already wired on prod; give us any QA number to add). (2) As of 2026-08-16 the OTPIQ **success path now logs** OTPIQ's response (smsId / remaining credit) at INFO, so an operator can confirm from `docker logs beeb-app` whether OTPIQ accepted+queued the message vs silently rejected it. If real SMS still doesn't arrive for non-test numbers, that's an OTPIQ funding/routing issue to resolve provider-side.
  - **`DELETE /api/riders/me` (Bearer, rider-only) — NEW, LIVE (2026-08-04).** In-app account deletion, required by App Store guideline 5.1.1(v). Permanently deletes the caller's own account: name/phone/photo/push-token/password are scrubbed and the account can no longer log in. **Request body (required, BREAKING as of 2026-08-28):** `{ "password": "<the rider's current password>" }` with `Content-Type: application/json`. The password is re-verified **server-side** before anything is deleted — there is no delete path that skips it, so a client-side-only confirmation is not enough. An old build that sends no body now gets `415` (no `Content-Type: application/json`) or `422` (JSON without a `password` field), never a deletion. **Responses:** `204` on success (**no body**); `422` when the body is valid JSON but `password` is missing or not a string, `415` when there is no `Content-Type: application/json`, `400` only for genuinely malformed JSON syntax (**these three come from axum itself and carry a PLAIN-TEXT body — never parse them as `{"error": ...}`**); `401` — see the branch rule below; `403` if the token is a captain/admin (not a rider) or the account is blocked; `409 { "error": "...active trip..." }` if the rider has a trip in flight (any non-terminal status — finish or cancel it first); `429` once repeated wrong passwords lock the account (**the same 5-attempt / 15-minute lockout as login now applies here**); `404` if already deleted. **Client contract (CHANGED 2026-08-28):** branch on the **body**, not the status. `401` **with** `{"error":"wrong_password"}` = the password was wrong but the session is fine → keep the user signed in, stay on the delete screen, show an inline error on the password field. **Any other `401`** (a bare body from the auth middleware, or `{"error":"unauthorized"}`) = the token itself is dead → **sign the user out normally, exactly as on every other endpoint.** The previous rule "never sign out on a `401` from this endpoint" was wrong — it stranded expired sessions — and must be removed from the clients. On `204` **or** `404`, discard the stored JWT and return the user to the signed-out screen — deletion is irreversible. The phone number is **freed**, so the same person can sign up again as a brand-new account (like captain re-registration after archive). Note: the rider's current JWT is not server-revoked and stays technically valid until it expires (≤30 days), so the app **must** drop it locally on delete; de-identified trip/payment history is retained where legally required (see the privacy policy at `https://beeb.madebyhaithem.com/privacy`).
- **Admins:** `POST /api/auth/admin/login` — body `{ "email", "password" }` → `200 { "token", "user_id" }`. Wrong/unknown credentials → `401` (no user enumeration); disabled account → `403`. Seeded super-admin for dev: `admin@beep.iq` / `ChangeMe123!` (change before deploy).
  - Admin-user management (super_admin only): `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/{id}`. Guards: cannot delete your own account or the last super-admin (`400`); duplicate email (`409`). New admins get a server-generated temporary password (surfaced via the invite flow in Phase 8).
- **JWT claim shape:** `{ "sub": <uuid>, "role": "rider" | "captain" | "super_admin" | "operator" | "finance", "exp", "iat" }`. HS256. Rider + captain tokens last 30 days; admin tokens 8 hours. For a captain token, `sub` is the **captain id**; for a rider token, `sub` is the user id.
- All authenticated requests send `Authorization: Bearer <jwt>`. Role-gated endpoints return `403` for a valid token with insufficient role, `401` for a missing/invalid token.
- **Captains (LIVE):** phone + password, gated on admin approval. Registration requires a verified `register` ticket plus a password.
  - `POST /api/auth/otp/send` — same endpoint as riders (delivers the code to the phone). Used to prove the phone before `captains/register`, and for password reset.
  - `POST /api/captains/register` — now additionally requires `ticket` and `password` (consumes a verified `register` ticket so the phone is proven first), creating a `pending` captain **with a password**. See [Captain Lifecycle](#captain-lifecycle-phase-3--live).
  - `POST /api/auth/captain/login` — body `{ "phone", "password" }`. Returns `200 { "token", "user_id": <captain_id> }` with `role: "captain"`. Issued for **`approved` AND `pending`** captains (a pending captain can keep onboarding); `rejected`/`blocked` → `403` (CaptainNotApproved); a phone with no captain account → `404`; wrong password → `401`; too many failed attempts (5) → `429` (per-phone lockout, 15 min).
  - `POST /api/auth/password/reset` — rider **and** captain. Body `{ "ticket", "phone", "new_password" }`. Consumes a verified `reset` ticket and sets the new password for whichever account (rider or captain) owns the phone (rider wins if somehow both exist). Response `200 { "token", "user_id" }`. Weak password → `400`; invalid/expired/already-used ticket → `401`; no account for that phone → `404`.
  - **`DELETE /api/captain/me` (Bearer, captain-only) — NEW, LIVE (2026-08-04).** In-app captain account deletion, required by App Store guideline 5.1.1(v). Archives + anonymizes the caller's own captain account: phone, name, vehicle plate, national id, push token, and password are scrubbed and the captain can no longer log in. **Request body (required, BREAKING as of 2026-08-28):** `{ "password": "<the captain's current password>" }` with `Content-Type: application/json`. The password is re-verified **server-side** before anything is deleted — there is no delete path that skips it, so a client-side-only confirmation is not enough. An old build that sends no body now gets `415` (no `Content-Type: application/json`) or `422` (JSON without a `password` field), never a deletion. **Responses:** `204` on success (**no body**); `422` when the body is valid JSON but `password` is missing or not a string, `415` when there is no `Content-Type: application/json`, `400` only for genuinely malformed JSON syntax (**these three come from axum itself and carry a PLAIN-TEXT body — never parse them as `{"error": ...}`**); `401` — see the branch rule below; `403` if the token is not a captain or the captain is blocked; `409 { "error": "...active trip..." }` if the captain has a trip in flight (accepted/in_progress — finish or cancel it first); `429` once repeated wrong passwords lock the account (**the same 5-attempt / 15-minute lockout as login now applies here**); `404` if already deleted (an already-archived captain holding a still-valid token gets `404`, never `401`). **Client contract (CHANGED 2026-08-28):** branch on the **body**, not the status. `401` **with** `{"error":"wrong_password"}` = the password was wrong but the session is fine → keep the captain signed in, stay on the delete screen, show an inline error on the password field. **Any other `401`** (a bare body from the auth middleware, or `{"error":"unauthorized"}`) = the token itself is dead → **sign the captain out normally, exactly as on every other endpoint.** The previous rule "never sign out on a `401` from this endpoint" was wrong — it stranded expired sessions — and must be removed from the clients. On `204` **or** `404`, discard the JWT and sign the captain out — deletion is irreversible. The **phone number and plate are freed** for a fresh registration (identical to the existing captain re-registration after admin archive). The current JWT is not server-revoked and stays valid until it expires, so the app **must** drop it locally; de-identified trip/activation/payment history is retained where legally required (see the privacy policy). Mirrors the rider `DELETE /api/riders/me`.
- **Device push token:** `POST /api/me/fcm-token` (any rider or captain Bearer) — body `{ "fcm_token": "<token>" | null }` → `204`. Stores the token on the caller's row (rider → `users`, captain → `captains`) so the backend can deliver FCM pushes; send `null` on logout.
- **Seeded admin / production:** the dev super-admin `admin@beep.iq` / `ChangeMe123!` is seeded for local use. In production the server **refuses to start** while that default password still works; set `BOOTSTRAP_ADMIN_PASSWORD` to rotate it on first boot. See `docs/DEPLOYMENT.md`.

## Real-time (Phase 7 — Live)

- **Captain stream:** `GET /ws/captain?token=<jwt>` (WebSocket; the token is a **query param**, not an Authorization header — browsers can't set headers on a WS upgrade). Frames are JSON text, one event per frame. On connect it subscribes the captain to **three** channels (**updated 2026-09-06**):
  1. `rt:captain:{id}:location` — the captain's own position echo.
  2. `rt:captain:{id}` — **NEW:** dispatch offers *and* a mirror of every trip lifecycle (`trip_update`) frame for this captain's trip. Always subscribed.
  3. `rt:trip:{id}` — only when the captain **already** has an active trip at the moment the socket opens.
  **The subscription list is computed once, at handshake, and never changes.** There is no client→server re-subscribe. That is why `rt:captain:{id}` exists: a captain who connected *before* accepting a trip is never on `rt:trip:{id}`, so lifecycle frames (above all the **cancel**) reach them only through their own channel. Practical consequence: you no longer need to reconnect the socket after accepting — but the trip channel still only appears on a fresh handshake, so a reconnect remains harmless.
- **Rider/admin stream:** `GET /ws/subscribe?token=<jwt>&channel=<channel>`. `channel` is one of `rt:trip:{trip_id}`, `rt:room:{room_id}`, `rt:admin:ops`. A **rider** may only subscribe to a trip they own or a room they are a member of (else 403); an **admin** may subscribe to any trip/room channel and `rt:admin:ops`. Missing channel → 400; bad/expired token → 401.
- Channels are fanned out via Redis (`PSUBSCRIBE rt:*` bridge); clients talk only to the backend WebSocket, never to Redis. The same channels every phase has been publishing to (`rt:trip:*`, `rt:room:*`, `rt:captain:*`, `rt:admin:ops`) are now delivered live.

### WebSocket frame contract

**How to connect.** Open a WebSocket to the endpoint with the JWT as a `?token=` query param (browsers/mobile WS clients can't set an `Authorization` header on the upgrade). The reverse proxy must pass through the `Upgrade`/`Connection` headers for `/ws/*`.

- Captain: `GET /ws/captain?token=<captain-jwt>` — auto-subscribes to three channels: `rt:captain:{id}:location` (own location echo), `rt:captain:{id}` (offers **+ mirrored trip lifecycle frames**, always on) and `rt:trip:{id}` (only if a trip is already active at handshake). No `channel` param, and the list is fixed for the life of the socket.
- Rider/Admin: `GET /ws/subscribe?token=<jwt>&channel=<channel>` — subscribes to the one `channel` you name, after authorization. To watch several channels (e.g. a trip and a room), open one socket per channel.

**Upgrade-time errors** are returned as the HTTP response to the upgrade request (the socket never opens): missing/invalid token → `401`; non-captain token on `/ws/captain` → `403`; missing `channel` → `400`; a channel you're not allowed to see → `403` (rider may only watch their own trip or a room they're a member of; only admins may watch `rt:admin:ops` and arbitrary trips/rooms).

**Frame format — IMPORTANT.** Each message is a **JSON text frame containing the event payload object directly** (no outer envelope). The `beep.*` action name (e.g. `beep.trip.accepted`) is the audit/internal name and is **NOT** sent on the wire. **The most common rider-facing frames now carry an additive inline `event` discriminator** so you can switch on it instead of sniffing fields: trip lifecycle frames carry `"event": "trip_update"`, captain-location frames carry `"event": "captain_location"`, and zone cache-invalidation frames carry `"event": "beep.zone.updated"`. The field is **additive and optional** — not every channel/frame has one yet (room and admin-ops frames still rely on field-presence), so build tolerant handlers. The client correlates by:
1. **The `event` field when present** (prefer this), then
2. **The channel it subscribed to** (you already know if a frame is a trip vs room vs location vs ops event from which socket/channel it arrived on), and
3. **The fields in the payload** — for trip frames, the `status` field is the state signal (`requested` → `accepted` → `in_progress` → `completed`/`cancelled`).

Per-channel frame shapes (the keys actually published today):

| Channel | Typical frame payload (JSON object) | Notes |
|-|-|-|
| `rt:trip:{id}` | `{ "event": "trip_update", "id", "rider_id", "captain_id", "status", "pickup_address", "dropoff_address", "fare_per_rider_iqd", "distance_per_rider_km", "accepted_at", "started_at", "completed_at", "cancelled_by", "cancellation_reason", "cancelled_at" }` | Trip lifecycle. Carries `"event": "trip_update"`. Watch `status` for transitions. `pickup_address`/`dropoff_address` (added 2026-08-14) are the rider's chosen place names, null when unset. Treat extra keys as additive. |
| `rt:trip:{id}` (**cancelled**, fixed 2026-09-06) | the same `trip_update` object with `"status": "cancelled"` plus `{ "cancelled_by": "rider"\|"captain"\|"system"\|"admin", "cancellation_reason": "<reason code>", "cancelled_at": "<RFC3339>" }` | **The cancel frame is now a normal lifecycle frame.** It used to be `{id, cancelled_by, reason, cancelled_at}` — no `event`, no `status` — which both apps dropped, so a cancellation only surfaced on the next poll. The three cancel keys are **always present on every `trip_update`** (null on non-cancel transitions), so the key set never changes shape. `cancelled_by` is what you branch the user-facing copy on. The identical frame is also mirrored to `rt:captain:{captain_id}` whenever the trip has an assigned captain. |
| `rt:trip:{id}` (location during active trip) | a captain-location object: `{ "event": "captain_location", "captain_id", "longitude", "latitude", "heading_deg", "speed_mps", "accuracy_m", "last_ping_at", "online", ... }` | The captain's GPS pings are forwarded onto the active trip's channel so the rider can animate the car. Carries `"event": "captain_location"` (also distinguishable by `longitude`/`latitude`). **`heading_deg` / `speed_mps` / `accuracy_m` (added 2026-07-16)** are the motion fields for smooth animation — each may be `null` (see [Live car on the rider's map](#live-car-on-the-riders-map-live)). |
| `rt:captain:{id}` | **two frame kinds** — offer broadcast: `{ "trip_id", "captain_id", "pickup_lat", "pickup_lng", "dropoff_lat", "dropoff_lng", "pickup_address", "dropoff_address", "fare_iqd", "distance_km" }`; and (**NEW 2026-09-06**) a mirror of the `trip_update` frame above. | The captain socket now actually subscribes to this channel (it never did before), so **dispatch offers arrive live over WS**, not only via the 8s queue poll and FCM. Discriminate the two: an offer has `trip_id` + `pickup_lat` and no `event`; a lifecycle frame has `"event": "trip_update"` + `id` + `status`. No key overlap. The Captain App should still rely on the durable FCM push (below) for backgrounded delivery. |
| `rt:captain:{id}:location` | `{ "event": "captain_location", "captain_id", "longitude", "latitude", "heading_deg", "speed_mps", "accuracy_m", "last_ping_at", "online" }` | The captain's own location echo (used by `/ws/captain`). Carries `"event": "captain_location"`. When the captain goes offline the frame is the short fade form: `{ "event": "captain_location", "captain_id", "online": false }` — **no coordinates**, so drop/fade the pin rather than reading `longitude`. The 5-minute staleness sweep emits the same shape with `"reason": "stale"` (and, **as of 2026-09-06**, finally carries `"event": "captain_location"` — it used to omit it). **When the captain is on an active trip that fade frame is now also published to `rt:trip:{id}`**, so the rider can show an honest "signal lost" state instead of a frozen car. |
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
- **`data` is how the app deep-links on tap.** FCM requires all `data` values to be strings; numeric/UUID values arrive as strings. **As of 2026-08-16 (issue #9) every push now carries `notification_type` INSIDE the `data` block** (previously it was only a server-side field). Android delivers `data` to a killed app but not `notification`, so the tap/background handler can now read `data.notification_type` to route, uniformly across all push kinds. The keys per type (all in `data`):

| `data.notification_type` | other `data` keys | Recipient | Fired when |
|-|-|-|-|
| `chat_message` | `{ trip_id, message_id }` | the **other** chat party | a rider/captain sends an in-ride message while the recipient is offline |
| `trip_accepted` | `{ trip_id }` | rider | a captain accepts the trip |
| `captain_arriving` | `{ trip_id }` | rider | captain marks arrived |
| `trip_completed` | `{ trip_id }` | rider | trip completed |
| `trip_cancelled` | `{ trip_id, cancelled_by, reason }` | the **other** party (rider-cancel → captain; captain-cancel → rider; system/admin-cancel → **both**) | any cancellation, from any actor |
| `new_trip_in_queue` | `{ trip_id }` | candidate captain | a new trip is dispatched nearby |
| `room_dispatched` | `{ room_id, trip_id }` | each room member (rider) | a captain takes the Abriyah room |
| `room_expired` | `{ room_id }` | each room member (rider) | no captain took the room before expiry |
| `captain_approval_decision` | `{ }` (no extra ids today) | captain | admin approves/rejects/blocks |

> Deep-link guidance: on notification tap, switch on `data.notification_type`, read `data.trip_id` (or `data.room_id`) and navigate to that trip/room/chat screen, then fetch the current state via the matching REST endpoint (`GET /api/trips/{id}` / `GET /api/abriyah/rooms/{id}` / `GET /api/chat/trips/{id}/messages`) — the push is a wake-up, not the source of truth. `trip_id` is a plain UUID string. **Note (issue #9):** these are FCM messages that include BOTH a `notification` object and `data`; on Android a fully-killed app runs the background data handler but the tray notification for a `notification`-bearing message is drawn by the OS. If you need the JS handler to fire for a killed app on every push, that's a separate data-only/`priority:high` change — ask and we'll scope it.

---

## Endpoint surface by client

### Customer App
| Capability | Phase | Key endpoints |
|-|-|-|
| Onboarding (phone + password) | 1 **Live** | **Register:** `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` `{purpose:"register"}` → `{ticket}` → `POST /api/auth/register` `{ticket,phone,password,name?}` → token. **Thereafter:** `POST /api/auth/login` `{phone,password}`. **Forgot password:** `otp/send` → `otp/verify` `{purpose:"reset"}` → `POST /api/auth/password/reset` `{ticket,phone,new_password}`. Profile: `GET/PATCH /api/riders/me`. Avatar upload: `POST /api/riders/me/photo/upload-url` → PUT to storage → `PATCH /api/riders/me` `{photo_url:"<object_key>"}` (see [Rider profile photo upload](#rider-profile-photo-upload)). **Delete account (App Store required):** `DELETE /api/riders/me` **`{password}`** → `204` (password now **required** in the body and verified server-side; `401` **+ body `{"error":"wrong_password"}`** = wrong password → keep the session and show an inline field error, while **any other `401` means the token is dead → sign out**; wrong passwords now count toward the login lockout → `429`; blocked `409` with an active trip; frees the phone for re-signup) — see the [Auth model](#auth-model-phase-1--live) row for the full contract |
| Service-area lookup (zones) | 2 **Live** | `GET /api/zones` (active only), `GET /api/zones/{id}` — polygons as WKT |
| Map POI overlay (places) | **Live** | `GET /api/places/nearby?bbox=minLng,minLat,maxLng,maxLat` (or `?lat=&lng=&radius_m=`) `&category=&page=&per_page=` → `{items,total,page,per_page}`; bilingual `name`/`name_ar`; public. See [Places / POI map overlay](#places--poi-map-overlay-live) |
| Regular booking | 5 **Live** | `GET /api/trips/estimate` (public), `POST /api/trips` (regular), `GET /api/trips/{id}`, `POST /api/trips/{id}/cancel`. **On completion the fare is charged to the rider wallet** (best-effort: a debit failure is logged + recorded as a `failed` ledger row but never blocks completion). **Cancelling after a captain has accepted** incurs a flat penalty (admin-tunable `trip.cancellation_penalty_iqd`, default 2000 IQD); cancelling while still `requested`/`matched` is free. Card capture is still MockGateway (real PSP at v2) |
| Abriyah booking + waiting room | 6 **Live** | `POST /api/abriyah/validate-pins` (now returns `dropoff_zone_id`/`pickup_zone_id`, replacing the old `zone_id`; request `zone_id` deprecated/ignored), `POST /api/abriyah/join` (**request body UNCHANGED**), `GET /api/abriyah/rooms/{id}`, `DELETE /api/abriyah/leave` (+ `rt:room:{id}` events). **Matching is now by dropoff zone** with cross-zone pickup support — see [Abriyah Rooms](#abriyah-rooms-phase-6--live) |
| Live trip | 5 + 7 **Live** | `GET /api/trips/{id}`; **captain card:** `GET /api/rider/trips/{id}/captain` → `{name, car_make, car_model, car_color, car_plate, avg_rating, trip_count}` (rider must own the trip; **no phone** — use the proxy endpoint for calls); trip events on `rt:trip:{id}` live over `GET /ws/subscribe?channel=rt:trip:{id}` (captain location pings forwarded onto the active trip's channel) |
| Live car on map | 7 + **Live (2026-07-16)** | **Snapshot:** `GET /api/rider/trips/{id}/captain-location` → `{longitude, latitude, heading_deg, speed_mps, accuracy_m, last_ping_at, online, stale, age_seconds}` (call on map open + every reconnect; `404` once the trip leaves `accepted`/`in_progress`). **Stream:** `captain_location` frames on `rt:trip:{id}`. Marker must be **interpolated client-side** — see [Live car on the rider's map](#live-car-on-the-riders-map-live) |
| Nearby cars on the idle map | **Live (2026-08-28)** | `GET /api/rider/captains/nearby?bbox=minLng,minLat,maxLng,maxLat` → `{cars:[{id, latitude, longitude, heading_deg}]}`. Anonymized ambience only — **not** dispatch data, and never the captain id. Poll ~6s while the pickup map is foregrounded. See [Nearby cars on the idle map](#nearby-cars-on-the-idle-map-live) |
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
| Online toggle + location | 7 **Live** (motion fields **2026-07-16**) | `PUT /api/captain/online` `{online}` (gated by today's activation — 403 if not activated), `POST /api/captain/location` `{longitude,latitude,heading_deg?,speed_mps?,accuracy_m?}` ping, `POST /api/captain/location/flush` `{pings:[...]}` (last wins), `GET /api/captain/location`; live trip stream over `GET /ws/captain?token=`. **Send `heading_deg`/`speed_mps`/`accuracy_m`** on every ping so the rider's car animates — omit (not `0`, not `-1`) when the platform reports unknown; see [Live car on the rider's map](#live-car-on-the-riders-map-live) |
| Trip queue + accept | 5 + 7 **Live**; room accept 6 **Live** | `GET /api/captain/trip-queue` (pending regular trips + open rooms; **women-only rooms hidden unless captain gender = f**; **Abriyah rooms hidden entirely unless `abriyah_status:"approved"`**); `POST /api/trips/{id}/accept`; `POST /api/abriyah/rooms/{id}/accept` (room → dispatched; **403 unless Abriyah-approved**), `GET /api/abriyah/rooms/{id}/members` (**response now wraps the roster with `dropoff_zone` + per-pickup-zone `pickup_breakdown`**); offers fan out live on `rt:captain:{id}` (WS) + a durable `new_trip_in_queue` FCM push |
| Abriyah access | 14 **Live** | **No request step any more.** An admin grants Abriyah when approving the captain (or later from the captain page); gate the Abriyah UI on `abriyah_status` (`approved` → enabled, anything else → taxi only). `POST /api/captain/abriyah/request` survives as a **deprecated no-op** (200, writes nothing) so shipped builds keep working — drop the request card in the next build. See [Captain Abriyah Access](#captain-abriyah-access-granted-at-approval-live) |
| Delete account (App Store required) | **Live (2026-08-04)** | `DELETE /api/captain/me` (captain token) **`{password}`** → `204`; password now **required** in the body and verified server-side (`401` **+ body `{"error":"wrong_password"}`** = wrong password → keep the session and show an inline field error; **any other `401` = dead token → sign out**; wrong passwords now count toward the login lockout → `429`); blocked `409` while a trip is in flight (accepted/in_progress); archives + anonymizes the account and frees the phone/plate for re-signup — see the [Auth model](#auth-model-phase-1--live) captain row for the full contract |
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
| Captains (approval queue + lifecycle + import) | 3 **Live** | `GET /api/captains` (excludes archived unless `?status=archived`), `GET /api/captains/pending`; `POST /api/captains/{id}/{approve,reject}` (admin), `.../{block,unblock,reconsider}` (super_admin); **`DELETE /api/captains/{id}` (super_admin) — soft-delete/archive**, **`DELETE /api/captains/{id}/purge` (super_admin) — permanent delete of an archived captain (204; trips detached, ledger kept)**; **`PUT /api/captains/{id}/star` (super_admin) — set car star grade 1/2/3 (see [Captain Car Star](#captain-car-star-class-live))**; **Abriyah access (admin): `POST /api/captains/{id}/approve` takes an optional `{ abriyah? }` scope; `POST /api/captains/{id}/abriyah/{approve,revoke}` grant/revoke later. The `abriyah/pending` queue and `abriyah/reject` are RETIRED — see [Captain Abriyah Access](#captain-abriyah-access-granted-at-approval-live)**; `POST /api/captains/bulk-import`; **`GET /api/admin/captains/{id}/history` → `ActivityHighlight[]`** (Captain Detail History tab — registration/approval/block events) |
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
- **Map view: `GET /api/admin/zones/geojson`** (admin) → a GeoJSON `FeatureCollection` (Content-Type `application/geo+json`), same `city_id`/`active` filters as the list endpoint. Each feature: `geometry` = the zone polygon (GeoJSON, lng/lat), `properties` = `{ id, name, name_ar, zone_type, active }`. **Use this to render the zone map** — drop it straight into Mapbox GL / MapLibre / Leaflet instead of parsing `polygon_wkt`. Colour by `zone_type`, dim when `active=false`, click a feature → open its editor.
- **Overlap rejection:** `POST`/`PUT /api/admin/zones` reject a polygon that **area-overlaps** an existing active zone with **`409 { "error": "...overlaps active zone <name>" }`**. Pure shared-border adjacency is allowed (neighbouring zones are fine). The bulk `import` path does NOT enforce this (partial-commit), so importing a full adjacent set still works. When drawing/editing, expect a 409 if the shape covers part of a live neighbour.
- **Optimistic locking:** `PUT /api/admin/zones/{id}` accepts an optional **`expected_version`**. Pass the `version` you loaded; if someone else edited the zone since, you get **`409 { "error": "Zone was modified by someone else..." }`** — reload and retry. Omit `expected_version` for last-write-wins (backward compatible). The pricing endpoint is unaffected.
- **Zone object** key fields: `id, city_id, name, name_ar, polygon_wkt, zone_type ("regular_only"|"abriyah_enabled"), abriyah_per_km_iqd (nullable), abriyah_base_fare_iqd, allow_women_only, room_max_riders, room_max_wait_seconds, active, version, archived_at`.
- **Abriyah rule:** an `abriyah_enabled` zone MUST have `abriyah_per_km_iqd > 0` (else 400). `regular_only` zones always have `abriyah_per_km_iqd = null`.
- **Pricing change:** `PUT /api/admin/zones/{id}/pricing` takes only `{ abriyah_per_km_iqd?, abriyah_base_fare_iqd?, allow_women_only?, room_max_riders?, room_max_wait_seconds? }` and returns `{ zone, in_flight_trips_locked }`. **NOTE (fare model):** the zone's `abriyah_per_km_iqd`/`abriyah_base_fare_iqd` are **no longer used for fare computation** — fares now come from the global tiered `pricing.*` settings (see Settings). These zone fields are retained for the `abriyah_enabled` validity rule and legacy display only; to change actual prices, edit the global `pricing.*` settings. It writes a before/after audit entry and fans out `beep.zone.updated` on `rt:zone:{id}` (cache-invalidation; clients should refresh cached zone pricing within ~30s).
- **Archive guard:** `POST .../zones/{id}/archive` is blocked (409) while the zone has active trips or open rooms (always allowed pre-Phase-5). `restore` reverses it.
- **Bulk import:** `POST /api/admin/zones/import` `{ "rows": [ ZoneImportRow ] }` where a row carries `city_name` (resolved to the city). Partial-commit: returns `{ committed, failed, errors: [{ row (1-based), message }] }`. Valid rows commit even if others fail.
- **Defaults:** omitted `room_max_riders`/`room_max_wait_seconds`/`abriyah_base_fare_iqd` fall back to settings (Phase 8) then hard defaults (4 / 300 / 0).

## Places / POI map overlay (Live)

POI overlay for the map (cafes, restaurants, shops, company/office names) shown as labelled pins on top of the clean CARTO basemap. Data is imported from an OSM extract into our own PostGIS (owned, curatable), not live-proxied from Overpass.

- **Search (public, no auth) — NEW, LIVE 2026-08-16:** `GET /api/places/search?q=<text>&lat=&lng=&limit=` → the same `{ items, total, page, per_page }` envelope, for the location-picker autocomplete over the **whole** ~285k POI set (not just the ≤1000 a viewport call returns). `q` is a case-insensitive substring of `name` OR `name_ar` (trigram-indexed; min 2 non-space chars else `400`). Optional `lat`+`lng` bias results toward that point and fill `distance_m`. `limit` default 20, max 50. Ranked by name similarity then distance. This is the answer to the earlier "server-side place-search" follow-up request.
- **Nearby (public, no auth):** `GET /api/places/nearby` — same access tier as `/api/zones` and `/api/trips/estimate`. Returns the `{ items, total, page, per_page }` envelope.
- **Two modes (exactly one required):**
  - **Viewport (primary):** `?bbox=minLng,minLat,maxLng,maxLat` (WGS84, lng-first like zones). Refetch on map pan by the visible rectangle. `distance_m` is `null` in this mode.
  - **Radius:** `?lat=&lng=` (+ optional `radius_m`, default 1500, max 50000). Results ordered nearest-first; each carries `distance_m` (metres).
- **Filters/paging:** optional `category` (`cafe｜restaurant｜shop｜company｜...`); `page` (default 1), `per_page` (default 50, clamped 1..=100). Providing both `bbox` and `lat`/`lng` → `400 { error }`.
- **bbox robustness (updated):** out-of-range bbox coordinates are now **clamped** into valid WGS84 range (`[-180,180]` lng / `[-90,90]` lat) and the valid interior is returned — a viewport that slightly overscans the antimeridian/poles no longer 400s. A **degenerate** bbox (after clamping, `min` not strictly `<` `max` on an axis — i.e. inverted or zero-area) returns a **structured `400 { error, expected_order }`** (`expected_order = "minLng,minLat,maxLng,maxLat"`), never a silent empty `200`. **Caveat the client must own:** an **axis-swapped but still-ordered** bbox (e.g. you sent `lat,lng,lat,lng`) is a *valid* rectangle somewhere else on Earth and is **undetectable server-side** — it returns an honest empty `200`. Always send `minLng,minLat,maxLng,maxLat` (lng-first), and `Math.min`/`Math.max` your viewport corners before sending.
- **`total` is capped at 1000** for dense viewports (central Baghdad holds ~10k POIs) — cluster client-side; don't rely on `total` as an exact city-wide count. **Viewport/bbox mode is required at the current dataset size (~285k POIs):** a single radius/"fetch-all" call can return at most 1000 of them, so the overlay must refetch the visible `bbox` on pan-settle rather than fetching once and filtering client-side.
- **Place object:** `{ id (OSM id, e.g. "node/123"), name (Latin, nullable), name_ar (Arabic, nullable), category, lat, lng, address (nullable), address_ar (nullable), distance_m (radius mode only, else null) }`. Names are bilingual; either may be null where OSM lacks it (~half of Iraqi POIs have an Arabic name). Curation overrides (rename/recategorize/hide partner venues) are applied server-side; hidden places never appear.
- **Example:** `GET /api/places/nearby?lat=33.3128&lng=44.3612&radius_m=2000&category=cafe` →
  ```json
  { "items": [ { "id":"node/123","name":"Ridha Alwan Coffee","name_ar":"رضا علوان",
                 "category":"cafe","lat":33.3128,"lng":44.3612,
                 "address":null,"address_ar":null,"distance_m":12.4 } ],
    "total": 1, "page": 1, "per_page": 50 }
  ```
- **Status:** **Live** on prod with the **full Iraq dataset — ~285,700 real POIs loaded** (Baly/OSM-derived, bilingual). Dense everywhere: central Baghdad viewports hit the 1000 `total` cap, radius queries return real nearby venues (e.g. ~53 cafes within 1km of a Karrada point), query latency ~0.35s. Categories: shop (70k), school (26k), attraction (25k), company (20k), restaurant (18k), clinic, government, cafe, lodging, pharmacy, park, bank, fuel, etc. (84 categories). ~25% carry a Latin `name`; the rest are Arabic-only (use `coalesce(name_ar, name)` for labels). Backend ingest details: `docs/places-ingest.md`.

## Captain Lifecycle (Phase 3 — Live)

State machine: `pending → approved | rejected`; `approved ↔ blocked`; `rejected → pending` (reconsider); **any non-archived status → `archived`** (delete/archive, terminal). All transitions are guarded — an action from the wrong state returns 400 with a clear message.

- **Self-registration (public):** `POST /api/captains/register` `{ ticket, phone, password, name, name_ar, gender ("m"|"f"), car_make, car_model, car_plate, city_id, car_color?, car_year?, national_id? }` → 201 `Captain` (status `pending`). Requires a **verified `register` ticket** (run `otp/send` → `otp/verify` `{purpose:"register"}` first to prove the phone) and a `password`. **`car_year` (NEW, optional i16):** the vehicle model year; when supplied it **auto-assigns the car star class** (see [Captain Car Star](#captain-car-star-class-live)) and must be in **1970..=2100** (else `400`). Omit it and the captain lands at **star 1**. Phone and plate are globally unique (409 on dup); invalid/expired ticket → 401; bad gender → 400; unknown `city_id` → 404. Gender is locked after creation. Still requires admin approval before operational use.
- **Documents (authenticated):** **5 required types** — `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`. `POST /api/captains/{id}/documents` `{ doc_type, url }` upserts (re-upload replaces). `GET .../documents` lists; `GET .../documents/completeness` → `{ complete, uploaded[], missing[] }`. The client uploads the file elsewhere and submits the resulting `url`.
- **Approval (admin):** `POST /api/captains/{id}/approve` requires **all 5 documents** (else 400). `POST .../reject` `{ reason, comment? }` where `reason ∈ {documents_invalid, vehicle_unfit, identity_mismatch, existing_account, other}`.
- **Block/unblock/reconsider (super_admin only):** `POST .../block` `{ reason }` (only from approved; force-cancels active trips at Phase 5 and signs the captain out), `.../unblock` (→ approved), `.../reconsider` (rejected → pending).
- **Delete / archive (super_admin only):** `DELETE /api/captains/{id}` → 200 `Captain` (status `archived`). **Soft-delete** — the captain is referenced by trips/ratings/rooms/reports, so the row is not removed; it is moved to the terminal `archived` status (stamps `archived_at`/`archived_by`) and its history is preserved. Effects: disappears from the default `GET /api/captains` list (still retrievable with `?status=archived`), can no longer log in (login admits only `approved`/`pending`), and in-flight trips are force-cancelled (reason `captain_archived`). Already-archived → 400 (pre-check) / 409 (concurrent). Not found → 404.
- **Purge / permanent delete (super_admin only) — NEW:** `DELETE /api/captains/{id}/purge` → **204** (no body). Hard-deletes an **already-archived** captain and their personal data in one transaction — this is the irreversible second step after archive, and it fully frees the identity so the same phone/plate can be re-registered with a clean slate (no archived ghost rows left behind). **Removed:** the captain row + (cascade) their daily activations, document rows, location pings, leaderboard rollup; their ratings (given/received); and any room assignment. **Preserved:** their trips are **detached** (`captain_id → null`) so trip + financial-ledger (transactions/revenue) history and reports are untouched. Not archived yet → **400** (archive first). Not found / purged concurrently → **404**. Requires `super_admin`.
  - **Two-step delete model:** `DELETE /api/captains/{id}` (archive, reversible-ish) → then optionally `DELETE /api/captains/{id}/purge` (permanent). A captain must be archived before it can be purged.
  - **Login lookup fix (shipped same change):** captain login now ignores archived rows, so a re-registered captain who shares a phone with old archived rows is no longer mis-resolved to an archived record and wrongly 403'd as "not approved."
- **Re-registration after delete (since 2026-06-16):** a deleted captain's **phone and car plate are freed** — the same person can register again via `POST /api/captains/register` (or bulk-import) with the same phone/plate. Re-registration creates a **brand-new captain** (new `id`, status `pending`, fresh onboarding); the archived row stays as an audit record. Uniqueness is now enforced only among non-archived captains (partial unique indexes), so phone/plate collide only with a still-active captain.
- **Queues (admin):** `GET /api/captains` filters `?status=&city_id=&gender=&page=&per_page=` and returns `{ items: CaptainRow[], total, page, per_page }` (each row has `doc_count`). `GET /api/captains/pending` is the review queue, oldest-first.
- **Bulk import (admin):** `POST /api/captains/bulk-import` `{ rows: [...] }` → `{ accepted, rejected, errors: [{ row (1-based), reason }] }`. Each row accepts an optional **`car_year`** (i16, 1970..=2100) that **auto-assigns the star** exactly as in self-registration; an out-of-range year rejects only that row (`reason: "invalid car year..."`). Dedups phone and plate within the batch and against the DB; partial-commit.
- **Events:** `beep.captain.{registered, approved, rejected, blocked, archived}` are published (audit + `rt:captain:*`). FCM pushes are enqueued for approve/reject/block/archive (delivered at Phase 7).
- **Captain object** key fields: `id, phone, name, name_ar, gender, car_make, car_model, car_plate, car_color?, car_year?, star, city_id, status, rejection_reason?, blocked_reason?, approved_by?, approved_at?, avg_rating, trip_count, registered_at, version`. `car_year` (i16 or null) is the model year the `star` was auto-derived from. `avg_rating`/`trip_count` stay 0 until Phase 5.

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

- **Fare estimate (public, no auth):** `GET /api/trips/estimate?pickup_lat=&pickup_lng=&dropoff_lat=&dropoff_lng=&trip_type=&zone_id=&promo_code=&star=` → `200 { fare_iqd, distance_km, base_fare_iqd, currency, discount_iqd, final_fare_iqd }`. **`star` (1|2|3, optional, default 1)** prices the normal-trip estimate for that car class (ignored when `trip_type=abriyah`) — see [Captain Car Star](#captain-car-star-class-live). **Fare model changed — now tiered (admin-configurable):** `fare = round_up_to(round_to_iqd, base + (min(km, threshold) × tier1_per_km) + (max(km − threshold, 0) × tier2_per_km))`. Defaults: base 2000 IQD, **250 IQD/km for the first 10 km, 125 IQD/km beyond 10 km, total rounded UP to the nearest 250 IQD**. `trip_type=abriyah` selects the Abriyah tiers/base (default base 0); any other value (or omitted) uses the normal-taxi tiers. **`zone_id` no longer changes the per-km rate** — pricing is now global per trip type (a zone's own per-km is ignored for fare math). Distance is haversine km. All knobs are editable from admin settings (`pricing.regular_base_fare_iqd`, `pricing.regular_tier1_per_km_iqd`, `pricing.regular_tier2_per_km_iqd`, `pricing.abriyah_base_fare_iqd`, `pricing.abriyah_tier1_per_km_iqd`, `pricing.abriyah_tier2_per_km_iqd`, `pricing.tier_threshold_km`, `pricing.round_to_iqd`) and take effect on the next request (no redeploy). **Promo code (optional):** when `promo_code` is supplied and the code exists/active/within-window/under-global-cap, `discount_iqd` is the potential discount and `final_fare_iqd = max(0, fare_iqd - discount_iqd)`; an invalid/missing code returns `discount_iqd: 0` and `final_fare_iqd == fare_iqd` (never errors). This is a **potential** estimate only — the unauthenticated endpoint cannot check per-rider-once; `POST /api/trips` enforces all limits atomically.
- **Request (rider):** `POST /api/trips` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, zone_id?, promo_code?, star?, pickup_address?, dropoff_address? }` → `201 Trip` (status `requested`, fare/distance computed, `base_fare_iqd` captured immutably). **`pickup_address` / `dropoff_address` (NEW, LIVE 2026-08-14, optional strings ≤255 chars):** the human-readable place name the rider chose (e.g. a POI or search result like `"مول المنصور"`). Send them so the captain's offer card and the rider's post-booking screens show the chosen name instead of a reverse-geocoded label; omit to send coordinates only. Stored verbatim (trimmed; blank → null; silently capped at 255 chars). They are returned on the `Trip` object, on `GET /api/trips` / `GET /api/trips/{id}`, in **`GET /api/captain/trip-queue`** offers, and on the `rt:trip:{id}` `trip_update` and `rt:captain:{id}` offer frames. Null on trips created before this shipped (clients fall back to reverse-geocoding when null). Scheduled trips already carried address text and now thread it into the live trip on promotion. **Server-side auto-population (NEW, LIVE 2026-08-16, issue #10):** when the client omits an address (the single-map pin flow does), the backend best-effort fills it from the **nearest POI within 150 m** of the coordinate (Arabic-first name; null when no POI is that close). So `pickup_address`/`dropoff_address` may be non-null even when you sent only pins — the label is a nearby venue name, never a street/neighbourhood (the dataset is POI points only). Sending your own text still wins. **`star` (1|2|3, optional, default 1)** picks the car class — see [Captain Car Star](#captain-car-star-class-live). The rider is matched **only** to captains graded exactly that star and pays that star's per-km rate. **Promo code (optional):** if `promo_code` is supplied and valid, the trip is created with the **already-discounted `fare_iqd`** (net of the discount); `promo_code_id` and `discount_iqd` are set on the Trip object and the redemption is atomically reserved. If the code is invalid, expired, inactive, exhausted, or already used by this rider → **400** `{ "error": "..." }` and the trip is NOT created. Omitting `promo_code` behaves exactly as before. **A rider with an active (non-terminal) trip gets `409` — now carrying the blocking trip's id (issue #11):** `409 { "error": "rider already has an active trip", "active_trip_id": "<uuid>" }`. On that 409, read `active_trip_id` and deep-link the rider to the live-trip screen to cancel it, instead of dead-ending. Dispatch fans the offer out to eligible captains on `rt:captain:{id}` and publishes `beep.trip.requested` on `rt:trip:{id}`.
- **Active trip lookup (rider):** `GET /api/trips/active` (Bearer, NEW LIVE 2026-08-16, issue #11) → `200` with the rider's current active `Trip`, or `200` `null` when none. Active = `requested`|`matched`|`accepted`|`in_progress` (newest). Use it to recover after a reinstall wiped the local trip store: find the open trip and route to the live-trip screen to cancel it. Rate-limit-exempt (safe to poll). A captain token gets `null`.
- **Auto-expiry (issue #11):** the backend now auto-cancels non-terminal trips left open past a stage TTL (`requested`/`matched` after 30 min, `accepted` after 2 h, `in_progress` after 6 h) with `cancelled_by: "admin"`, `cancellation_reason: "system_timeout"`. So a trip abandoned by a captain crash / missed completion no longer pins the rider out of booking forever; a sweep clears it within ~5 min.
- **Accept (captain):** `POST /api/trips/{id}/accept` → `200 Trip` (status `accepted`, `captain_id`/`accepted_at` set). Works from `requested` (regular) **and** `matched` (Abriyah, Phase 6) — the handler routes through the state machine. A captain with an active trip gets `409`; a stale accept (someone already took it) gets `409`.
- **Arrive / Start / Complete (captain):** `POST /api/trips/{id}/arrive` (cue only, no status change), `POST .../start` (`accepted → in_progress`), `POST .../complete` (`in_progress → completed`). Complete writes the per-rider breakdown `fare_per_rider_iqd` / `distance_per_rider_km` as `{ rider_id: value }` (single entry for a regular trip; Phase 6 fills multiple for Abriyah). Events `beep.trip.{accepted,arrived,started,completed}`.
- **Cancel (rider/captain/admin):** `POST /api/trips/{id}/cancel` `{ reason, comment? }`. Actor derived from the token role. Allowed transitions: rider/captain from `requested`/`accepted`; **only admin** from `in_progress`. Invalid actor/state → `400`. `reason ∈ {changed_mind, wait_too_long, wrong_pickup, captain_late, safety, system_timeout, captain_blocked, other}`. The cascade sends **exactly one** `trip_cancelled` push to the right counterparty (`data: {trip_id, cancelled_by, reason}`) and publishes `beep.trip.cancelled` as a normal `trip_update` frame on `rt:trip:{id}`, mirrored to `rt:captain:{captain_id}`. **A captain cancel is TERMINAL (decided 2026-09-06):** the trip stays `cancelled` and is **not** re-dispatched — the rider is told to request a new ride. (The old code enqueued a re-dispatch job that was a no-op on a terminal trip while telling the rider "finding another captain"; docs, copy and code now agree.) Blocking a captain (Phase 3) force-cancels their active trip here with `reason=captain_blocked`. **Promo release:** if the trip carried a promo code, the reservation is released on cancel (best-effort) so the rider can reuse the code on a subsequent booking.
- **Ratings:** after completion, `POST /api/trips/{id}/ratings` `{ stars (1-5), comment? }` → `201 Rating`. A rider rates the captain and vice-versa; the ratee is derived from the trip. One rating per rater per trip (`409` on repeat); non-participants get `403`; rating an incomplete trip → `400`. Edit within **7 days** via `PUT /api/trips/{id}/ratings/{rating_id}` (after the lock cron stamps `locked_at`, edits → `400`). `GET /api/trips/{id}/ratings` lists them.
- **List / detail:** `GET /api/trips?rider_id=&captain_id=&status=&page=&per_page=` → `{ items: Trip[], total, page, per_page }`. `GET /api/trips/{id}` → `Trip`.
- **Earnings (captain):** `GET /api/captains/{id}/earnings?period=today|week|month` → `{ gross_iqd, activation_fee_iqd, net_iqd, trip_count, period }` (net = gross − daily activation fee; full per-day fee accounting lands in P10). `GET /api/captains/{id}/earnings/history?period=…` → `{ items: [{ trip_id, fare_iqd, trip_type, completed_at }] }`.
- **Trip object** key fields: `id, trip_type ("regular"|"abriyah"), status, rider_id, captain_id?, zone_id?, room_id?, pickup_lat/lng, dropoff_lat/lng, fare_iqd, distance_km, base_fare_iqd, currency, fare_per_rider_iqd?, distance_per_rider_km?, promo_code_id?, discount_iqd?, cancellation_reason?, cancelled_by?, requested_at, accepted_at?, started_at?, completed_at?, cancelled_at?, version`. When a promo was applied, `fare_iqd` is already net of the discount; `discount_iqd` is the amount deducted; `promo_code_id` is the UUID of the applied code.
- **WS channels:** `rt:trip:{id}` (rider + captain follow trip state) and `rt:captain:{id}` (offer push **+ a mirror of every `trip_update` frame for this captain's trip, added 2026-09-06** — the captain socket is always subscribed here, unlike `rt:trip:{id}`). The real-time **subscriber/push loop lands in Phase 7**; Phase 5 already publishes every event to Redis + writes the audit trail.
- **Dispatch at v1 is a degraded stub:** offers fan out to all approved + activated-today captains (no geo ranking yet — `captain_locations` + nearest-captain ordering land in Phase 7). The first captain to `accept` wins (optimistic lock). There is no auto-timeout cancel at v1 (it would race the accept); Phase 7 adds the real per-captain 15s window.

## Abriyah Rooms (Phase 6 — Live)

Abriyah is the zone-shared-ride differentiator: riders going to the **same dropoff (destination) zone** pool into a **room**; one captain takes the whole room. **Matching is keyed by the DROPOFF zone, not the pickup zone** (changed). Pickup may be in **any active zone** (regular or Abriyah) and **cross-zone trips** (pickup zone ≠ dropoff zone) are now supported; only the **dropoff** must be in an Abriyah-enabled zone. Each rider gets an **independent per-rider fare**, priced with the **admin-configurable tiered model** (same formula as the regular estimate): an Abriyah pickup zone uses the global **Abriyah** tiers/base (`pricing.abriyah_*`), a regular pickup zone uses the global **normal-taxi** tiers/base (`pricing.regular_*`). Per-zone per-km is no longer used for fare math — tiers are global per type. Riders do not split a single fare. Room lifecycle: `open → locked → dispatched | expired`.

- **Validate pins (per-drag, PUBLIC — no auth):** `POST /api/abriyah/validate-pins` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, zone_id? }` → `200 { valid, dropoff_zone_id?, pickup_zone_id?, message }`. **Response shape changed** — it now returns **both** resolved zones (`dropoff_zone_id`, `pickup_zone_id`, either may be `null`) and this **REPLACES the old single `zone_id` field**. `valid:true` only when the **dropoff** is in an Abriyah-enabled zone **AND** the **pickup** is in some active zone. The request body still accepts an optional `zone_id`, but it is now **IGNORED (deprecated)** — drop it from new clients. **Now public** to mirror the public `GET /api/trips/estimate` — call it before login / during map exploration without a token. **Never an HTTP error** — `valid:false` with a human message when a pin is out of range. Call on every pin drag for inline feedback before joining.
- **Join (rider):** `POST /api/abriyah/join` `{ pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, room_type ("mixed"|"women_only") }` → `201 { room, member, trip_id, fare_iqd, distance_km }`. **Request body is UNCHANGED — no frontend change needed to join.** The backend now detects the **dropoff** Abriyah zone (and matches the rider into the room for that destination zone), resolves the pickup zone independently (any active zone — cross-zone allowed), computes the per-rider fare from the **pickup** zone, finds the oldest open non-full room for that dropoff zone (FIFO) or opens a new one, adds the rider, and creates a **matched** Abriyah trip. Errors: dropoff not in an Abriyah zone → `400`; pickup not in any active zone → `400`; women-only by a non-female rider → `403`; women-only not allowed in zone → `400`; rider already in a room → `409`.
  - **Concurrency guarantee (fixed):** two riders joining the **same dropoff zone + `room_type` at the same instant** now always land in the **same** room — the find-or-create is atomic (DB-enforced: at most one joinable open room per zone+type). Previously a simultaneous double-booking could split into two separate rooms; if the app was showing two riders in different rooms for an identical route, that was this backend race, not a client bug. Same `room_type` is required to share a room — a `mixed` and a `women_only` request to the same dropoff zone are intentionally different pools.
- **Room detail (rider):** `GET /api/abriyah/rooms/{id}` → `{ room, members: RoomMember[] }`.
- **Leave (rider):** `DELETE /api/abriyah/leave` → `200 { message }`. Removes the rider from their open/locked room, decrements the count, and cancels their trip. `400` if not in any active room.
- **Accept (captain):** `POST /api/abriyah/rooms/{id}/accept` → `200 Room` (status `dispatched`). Locks the open room to the captain and immediately dispatches it: **every member trip transitions `matched → accepted`** with the captain assigned. Errors: room not open → `400`; women-only room by a non-female captain → `403`; captain not approved → `403`; **captain not approved for Abriyah access → `403`** (an admin must have granted it — see [Captain Abriyah Access](#captain-abriyah-access-granted-at-approval-live)); captain already in a room → `409`.
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

## Rider ↔ Captain Chat (Live)

In-ride 1:1 text chat between a rider and the captain assigned to their trip. **The conversation is keyed by `trip_id`.** For **Abriyah** this Just Works: each rider has their own trip sharing the room's single captain, so every rider gets a **separate thread with the same driver** — no room-level group chat, each rider↔captain pair is its own trip channel.

- **Send (rider or captain):** `POST /api/chat/trips/{id}/messages` `{ body }` → `201 Message`. Any valid **rider or captain** JWT; the caller must be this trip's rider or its assigned captain. `body` is trimmed; empty → `400`, >2000 chars → `400`. The server persists, fans the message out over `rt:chat:trip:{id}`, and enqueues an FCM push (`notification_type: "chat_message"`) to the counterparty. Errors: not a participant / no captain assigned yet → `403`; trip not found → `404`; **chat closed** (trip not `accepted`/`in_progress`) → `409`.
- **History (rider or captain):** `GET /api/chat/trips/{id}/messages?before=&limit=` → `200 { items: Message[], has_more }`. `items` are **oldest-first within the page**. Omit `before` for the newest page, then page backwards by passing the oldest returned message's `created_at` as `before`. `limit` is 1..=100 (default 50). Readable by either participant **even after the trip is completed/cancelled** (history stays open; only *sending* is gated to active trips). Fetching also marks the counterparty's messages read and emits a `chat_read` receipt on the channel.
- **Message object:** `{ id, trip_id, sender_id, sender_role ("rider"|"captain"), body, read_at (nullable), created_at }`.
- **WS delivery:** subscribe with the existing `GET /ws/subscribe?token=<jwt>&channel=rt:chat:trip:{id}`. **Both** the owning rider and the assigned captain are authorized on this channel (unlike `rt:trip:{id}`, where only the rider uses `/ws/subscribe` and the captain is auto-subscribed via `/ws/captain`); a non-participant gets `403` at the handshake. Frames carry an `event` discriminator:
  - `{"event":"chat_message","message_id","trip_id","sender_id","sender_role","body","created_at"}` — a new message.
  - `{"event":"chat_read","trip_id","reader_role","read_at"}` — the counterparty opened the thread (read receipt).
- **Offline push:** when the counterparty isn't watching the socket, the `chat_message` FCM push wakes them; `data` carries `{ trip_id, message_id }` for deep-linking to the thread. Clients should suppress the banner when the chat screen for that trip is foregrounded.

## Captain Car Star Class (Live)

A **1/2/3-star grade on each captain's car** (3 = nicest). Riders pick a star when requesting a **normal** trip and are matched **only** to captains graded exactly that star, paying that star's per-km fare. **Abriyah ignores star entirely** (no star field on rooms; Abriyah keeps its own pricing and pooling).

- **Auto-assigned from the car model year (NEW, LIVE 2026-08-27):** on `POST /api/captains/register` and `POST /api/captains/bulk-import`, the star is now **computed from the vehicle's model year** — the captain/admin no longer grades by eye at onboarding. Rule: `car_year >= classifier.star3_min_year` → **star 3**; `>= classifier.star2_min_year` → **star 2**; otherwise, or when `car_year` is omitted → **star 1** (the safe default). Defaults: **≥ 2020 → 3, ≥ 2015 → 2, else 1**. The two cutoffs are admin-tunable settings (`classifier.star2_min_year`, `classifier.star3_min_year`, editable via `PUT /api/admin/settings/{key}`, effective on the next registration) and can be set very high (e.g. `3000`) to keep every new captain at star 1 until you want promotions live. Classification is **year-only for now** (canonical make/model is planned). **Captain App: collect the car's model year at registration** and send `car_year` (see the registration body). ⚠️ **Dispatch is EXACT-match on star and riders default to `requested_star = 1`, so promoting a car above star 1 removes it from the star-1 demand pool** — only turn on the higher-star cutoffs once there is rider demand for those classes (all six per-km fare keys are still seeded identically at 500, so classes cost the same today anyway).
- **Admin — override / re-grade (super_admin):** `PUT /api/captains/{id}/star` `{ star: 1|2|3 }` → `200 Captain` (with updated `star`). This remains the **manual override** on top of the auto-assignment — **change anytime** (car upgraded, mis-grade, salvage car whose year overstates quality). `star` outside 1..3 → `400`; unknown captain → `404`; non-super_admin → `403`. Publishes `beep.captain.star_changed` (audit). (There is no vehicle-edit endpoint, so `car_year`/star aren't re-derived after registration — use this to correct.)
- **Captain object** carries **`star`** (i16, 1..3) and now **`car_year`** (i16 or null — the vehicle model year the star was derived from). Captains registered before this shipped have `car_year: null` and their existing `star` (all defaulted to 1 at the star rollout) is unchanged.
- **Rider — choose class:** pass **`star` (1|2|3, optional, default 1)** on `POST /api/trips` and on `GET /api/trips/estimate`. Omitting it = 1-star (identical to pre-feature behaviour). A request that omits star, or picks a class with no online captains, simply waits like any no-captain-available case — **there is no "widen to any car"** in v1.
- **Matching is EXACT:** a star-2 request is served only by star-2 cars (never 1 or 3). This is enforced in the captain trip-queue, in dispatch candidate selection, and re-checked at accept time (a stale mismatched accept → **`409`**).
- **Per-star pricing:** each class has its own two per-km rates — settings `pricing.star{1,2,3}_tier1_per_km_iqd` and `...star{1,2,3}_tier2_per_km_iqd` (IQD/km, editable via `PUT /api/admin/settings/{key}`, effective next request). **Base fare, distance threshold, and round-to step are shared across all stars** (`pricing.regular_base_fare_iqd`, `pricing.tier_threshold_km`, `pricing.round_to_iqd`). On rollout all three star classes are seeded to the current normal rate, so **prices are identical until an admin differentiates them**.
- **Abriyah unaffected:** Abriyah trip requests, rooms, pooling, and fares (`pricing.abriyah_*`) are unchanged; no `star` anywhere in the Abriyah path.

## Captain Abriyah Access (granted at approval) (Live)

**CHANGED (2026-08-27) — the captain-side request loop is gone.** Abriyah access is now a **service scope the admin picks when approving the captain's registration**, and can be granted or revoked from the captain page at any time afterwards. Nothing changes in the gate itself: a captain who is not `abriyah_status:"approved"` still sees no Abriyah rooms and cannot accept one. **Regular trips are unaffected** — this gate is Abriyah-only.

- **Captain object** still carries **`abriyah_status`** ∈ `"none" | "requested" | "approved" | "rejected"` (default `none`) and **`abriyah_rejection_reason`** (nullable). Only **`none`** (taxi only) and **`approved`** (taxi + Abriyah) are written from now on; `requested`/`rejected` remain valid values so historical rows and shipped app builds still deserialize. A migration reset every in-flight `requested` row to `none`.
- **Admin — approve with scope:** `POST /api/captains/{id}/approve` now takes an **OPTIONAL** body `{ abriyah?: boolean }` → `200 Captain`. `abriyah:true` approves the captain **and** sets `abriyah_status:"approved"` in the same statement; omitted / `{}` / `false` = taxi only. **Sending no body at all keeps working and means taxi only**, so a dashboard deployed before this change is safe. Only ONE push goes out (`Account approved`) even when Abriyah is granted.
- **Admin — bulk approve with scope:** `POST /api/admin/bulk/captains/approve` `{ captain_ids, note?, abriyah? }`. `abriyah` defaults to `false` and applies to every row in the batch.
- **Admin — grant later:** `POST /api/captains/{id}/abriyah/approve` → `200 Captain` (`abriyah_status:"approved"`, reason cleared). Works from **any** current status — there is no request to answer first. Notification `abriyah_access_approved`.
- **Admin — revoke (NEW):** `POST /api/captains/{id}/abriyah/revoke` → `200 Captain` (`abriyah_status:"none"`, reason cleared). The captain keeps taxi work; Abriyah rooms stop being offered immediately. Notification `abriyah_access_revoked`.
- **RETIRED:** `GET /api/captains/abriyah/pending` and `POST /api/captains/{id}/abriyah/reject` are **gone (404)**. There is no review queue any more — drop the queue page and the reject button.
- **DEPRECATED no-op:** `POST /api/captain/abriyah/request` still answers `200 Captain` but **writes nothing** (never sets `requested`). It stays mounted only so already-shipped captain builds do not start 404ing; drop the request card in the next captain build.
- **The gate (two enforcement points, unchanged):** a captain who is not `abriyah_status:"approved"` (1) **does not see any Abriyah room offers** in `GET /api/captain/trip-queue` (regular trips still appear), and (2) gets **`403`** from `POST /api/abriyah/rooms/{id}/accept` as a backstop.
- **Captain App UX:** gate the "Abriyah" area on `abriyah_status` — `approved` → Abriyah enabled, anything else → taxi only. There is nothing for the captain to request; access arrives when an admin grants it. Poll `GET /api/captains/{id}` (own id) or listen for the audit events below.
- **Events (admin ops channel `rt:admin:ops`):** `beep.captain.abriyah_approved`, `beep.captain.abriyah_revoked`. `beep.captain.approved` now also carries `"abriyah": <bool>` (the scope the admin picked). `beep.captain.abriyah_requested` / `beep.captain.abriyah_rejected` are no longer emitted.

## Real-Time Delivery (Phase 7 — Live)

The delivery layer: captain GPS pings, the WebSocket fan-out of every `rt:*` event published since Phase 1, captain online/offline + staleness, and durable FCM push. No new business state — only delivery.

- **Location ping (captain):** `POST /api/captain/location` `{ longitude, latitude, heading_deg?, speed_mps?, accuracy_m? }` → `200 { captain_id, longitude, latitude, heading_deg, speed_mps, accuracy_m, last_ping_at, online }`. A ping sets the captain **online** (presence) and fans the position out to `rt:captain:{id}:location`, `rt:admin:ops` (live map), and — if the captain is on an active trip — that trip's `rt:trip:{id}` channel (so the rider watches the car move). Coordinates out of `[-180,180]`/`[-90,90]` → `400`. Pings do **not** write an audit row (high-frequency); they are Redis-only fan-out. **The three motion fields (added 2026-07-16) are optional and additive** — existing builds that send only `longitude`/`latitude` keep working unchanged and simply get `null` back. See [Live car on the rider's map](#live-car-on-the-riders-map-live) for what the Captain App should send and why.
- **Offline flush (captain):** `POST /api/captain/location/flush` `{ pings: [{longitude, latitude, heading_deg?, speed_mps?, accuracy_m?}, ...] }` → `200 CaptainLocationResponse`. On reconnect the app submits the queue collected while offline; the backend stores **only the last ping** (last-known policy). Empty list → `400`.
- **Online toggle (captain):** `PUT /api/captain/online` `{ online: bool }` → `200 { ok: true }`. Going **online enforces today's daily-activation gate** (Asia/Baghdad date) — no active activation row → `403`. **Going offline mid-trip is now refused (NEW 2026-09-06):** if the captain has an `accepted` or `in_progress` trip the call returns `409 { "error": "finish the active trip before going offline", "trip_id": "<uuid>" }`. The rider's live car is driven by this captain's pings, so a mid-ride toggle would freeze the car on the rider's map with no explanation. **Captain App:** disable the online disc while `GET /api/captain/trips/active` returns a trip, and on a 409 keep the ping session running (don't stop pinging before the API call succeeds) and deep-link the captain to `trip_id`. With no active trip, going offline succeeds and fades the captain's pin for subscribers.
- **Read own location (captain):** `GET /api/captain/location` → `200 CaptainLocationResponse` (or `404` if the captain has never pinged).
- **Trip queue (captain):** `GET /api/captain/trip-queue` → `200 { offers: CaptainOffer[] }`. Pending **regular trips** (`requested`) plus **open Abriyah rooms**, oldest-first. **Regular trips are filtered to the captain's own star grade** — a star-2 captain only sees star-2 requests (Abriyah rooms ignore star; see [Captain Car Star](#captain-car-star-class-live)). **Women-only rooms are pre-filtered out for non-female captains** (G-ABRIYAH-02/G-MF-06) — a male captain never sees a women-only offer at all. **All Abriyah room offers are hidden entirely from captains not `abriyah_status:"approved"`** (regular trips still show — see [Captain Abriyah Access](#captain-abriyah-access-granted-at-approval-live)). `CaptainOffer`: `{ offer_type ("trip"|"room"), id, zone_id?, room_type? ("mixed"|"women_only"|null), pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, pickup_address?, dropoff_address?, fare_iqd, created_at }`. **`pickup_address`/`dropoff_address` (2026-08-14)** are the rider's chosen place names (null when the trip carried only coordinates, or for the seed trip of a room without addresses) — render them on the offer card and reverse-geocode only when null.
- **Captain WebSocket:** `GET /ws/captain?token=<captain-jwt>`. Subscribes to **three** channels — `rt:captain:{id}:location`, `rt:captain:{id}` (offers + mirrored `trip_update` frames, **added 2026-09-06**) and `rt:trip:{id}` when a trip is already active at handshake — and forwards each Redis event as a JSON text frame. The list is fixed at handshake; there is no re-subscribe. Non-captain token → 403; bad token → 401.
- **Rider/admin WebSocket:** `GET /ws/subscribe?token=<jwt>&channel=<ch>` where `ch ∈ {rt:trip:{id}, rt:room:{id}, rt:admin:ops}`. Riders are scoped to their own trip / member rooms; admins may watch anything. Missing channel → 400; unauthorized channel → 403.
- **Dispatch (now geo-ranked):** when a regular trip is requested, candidates are approved + activated-today + **online** captains **of the requested star grade** with a recent location, ranked by `ST_Distance` to the pickup within a 10 km radius (falls back to registration-order among same-star captains if no online located one exists, so a trip is never dropped). The offer fans out live on `rt:captain:{id}` and a durable `new_trip_in_queue` FCM push wakes backgrounded apps. First captain to `accept` wins.
- **Staleness:** an online captain who stops pinging is forced **offline after 5 minutes** by a 60s sweep (the pin fades; an abandoned active trip is surfaced for admin via `queue:staleness`). Clients should show a "stale" indicator at ~60s and treat a captain as gone at 5 min.
- **Push types (`NotificationType`, snake_case):** `trip_accepted`, `captain_arriving`, `trip_completed`, `trip_cancelled` (notifies the opposite party), `room_dispatched`, `room_expired`, `captain_approval_decision`, `new_trip_in_queue`. **Cancellation pushes changed 2026-09-06:** there is now exactly **one** type for every actor — `trip_cancelled` — carrying `data: {trip_id, cancelled_by, reason}`. The variants `trip_cancelled_by_rider` / `_by_captain` / `_timeout` / `_by_admin` are gone; branch on `data.cancelled_by` instead. The cascade is the single sender (the cancel HTTP handler no longer enqueues a second, divergent job), it addresses riders as `recipient_type: "User"` (it used to send an unresolvable `"Rider"`, so **dispatch timeouts, the staleness sweep, `captain_blocked` and admin force-cancels pushed the rider nothing at all**), and every cascade path now notifies the right counterparty. The Captain App registers its FCM device token (stored on `captains.fcm_token`); rider-side push tokens (`users.fcm_token`) land in Phase 8.

## Live car on the rider's map (Live)

How the Customer App draws the little car moving toward the rider. Nothing here is a new subsystem — it is the Phase 7 ping/fan-out path plus the two additions of **2026-07-16**: the **motion fields** on the location frame, and a **snapshot endpoint** so the map is never blank.

**The shape: one snapshot + one stream.** These are two halves of the same feature, and the map needs both.

| Step | Call | Why |
|-|-|-|
| 1. On map open (and after every reconnect) | `GET /api/rider/trips/{id}/captain-location` | Paints the car **immediately**. Without it the map is empty until the captain's next ping. |
| 2. Immediately after | `GET /ws/subscribe?token=<rider-jwt>&channel=rt:trip:{id}` | Streams every subsequent ping. Same channel already used for `trip_update`. |

Subscribe **before** or in parallel with the snapshot, and let the stream win on conflict — the snapshot is a point-in-time read and can arrive stale if a ping lands mid-flight. Compare `last_ping_at` and keep the newer.

- **Snapshot:** `GET /api/rider/trips/{id}/captain-location` (rider JWT) → `200 { captain_id, longitude, latitude, heading_deg, speed_mps, accuracy_m, last_ping_at, online, stale, age_seconds }`.
  - `403` if the trip isn't yours (or you send a captain token); `401` unauthenticated.
  - **`404` unless the trip is `accepted` or `in_progress`** — deliberately the *same* window in which pings reach `rt:trip:{id}`, so snapshot and stream always agree on when a car exists. A completed/cancelled trip stops exposing the captain's position; don't treat that 404 as an error state, just stop tracking.
  - `404` also when no captain is assigned yet, or the captain has never pinged.
  - **Exempt from the global rate limiter**, so refetch freely on every reconnect.
- **Stream frame** on `rt:trip:{id}`, `"event": "captain_location"` (the same channel also carries `trip_update` — switch on `event`):
  ```json
  { "event": "captain_location", "captain_id": "…", "longitude": 44.3673, "latitude": 33.3152,
    "heading_deg": 92.0, "speed_mps": 11.0, "accuracy_m": 5.0,
    "last_ping_at": "2026-07-16T09:06:26.987782Z", "online": true }
  ```

**The motion fields (all nullable — `null` means "the device didn't report it", not zero).**

| Field | Meaning | Use it for |
|-|-|-|
| `heading_deg` | degrees clockwise from **true north**, `[0, 360)` | Rotating the car icon. `null` while stopped is normal — **keep the last rotation**, don't snap to 0 (that would point the car north at every red light). |
| `speed_mps` | ground speed, **metres per second** (not km/h — multiply by 3.6) | Choosing animation duration; deciding whether to dead-reckon; showing "moving" vs "stopped". |
| `accuracy_m` | horizontal accuracy radius, metres | Suppressing junk. A fix with a large `accuracy_m` that implies a physically impossible jump is better ignored than rendered. |

**Smoothness is a client-side job — this matters, please read.** The backend pushes a **discrete event per ping**, roughly one every few seconds; it is not a 60fps feed and never will be (that would be a battery and bandwidth disaster on the captain's phone). If you bind the marker straight to the incoming coordinates it will **teleport** every few seconds — that is the single most common way this feature looks broken, and no backend change can fix it. What makes it smooth:

1. **Interpolate, don't assign.** On each frame, animate the marker from its current position to the new one over roughly the inter-ping interval (tween the position; use your map SDK's marker animation or a simple ease-linear). Track the observed gap between `last_ping_at` values rather than hardcoding a constant — it varies with the captain's signal.
2. **Rotate smoothly too**, and take the **shortest arc** — going 350° → 10° must turn +20°, not −340°, or the car spins on its axis.
3. **Dead-reckon only if you must.** Extrapolating along `heading_deg` at `speed_mps` hides a late ping, but overshoots on turns and stops. If you do it, cap it (~2s) and always snap back to the next real fix.
4. **Ignore obvious garbage.** A fix implying an impossible speed, or with a huge `accuracy_m`, should be dropped rather than animated.
5. **Fade rather than lie.** On `online: false` (the fade frame carries **no coordinates**), or `stale: true` / `age_seconds` past ~60s, show the pin faded and **stop animating**. The backend forces a silent captain offline after **5 minutes** (`stale` uses that same threshold). A confidently-placed car that is minutes out of date is worse than a visibly-uncertain one.

**Reconnects are yours to handle.** The server sends no heartbeat and accepts no client commands — the socket is a one-way delivery pipe (all actions stay REST). Mobile networks drop sockets silently, so: reconnect with backoff, and **on every reconnect re-fetch the snapshot** (step 1) since frames published while you were disconnected are gone — Redis pub/sub does not replay. A watchdog that reconnects when no frame has arrived for ~30s while a trip is active is a good idea.

**Abriyah (shared rides) works unchanged.** Each rider has their own trip row sharing one `captain_id`, so every rider subscribes to their **own** `rt:trip:{id}` and sees the same car. No special-casing.

**Captain App:** send the motion fields on every ping — the platform already gives you all three (Android `Location.getBearing()/getSpeed()/getAccuracy()`; iOS `CLLocation.course` / `.speed` / `.horizontalAccuracy`). Two rules: **omit or send `null` when the platform reports "unknown"** (iOS uses `-1` for `course`/`speed`, Android needs `hasBearing()`/`hasSpeed()` — do **not** forward `-1`, and do **not** send `0`, which means "due north"/"stopped"); values outside `heading_deg ∈ [0,360]`, `speed_mps ≥ 0`, `accuracy_m ≥ 0` are rejected `400` with a message naming the field. `heading_deg: 360` is accepted and normalized to `0`.

### Nearby cars on the idle map (Live)

The *other* car layer: the ambience cars the rider sees **before** ordering, on the pickup map. Different endpoint, different guarantees, different privacy posture from the assigned-captain tracking above — do not confuse the two.

- **Endpoint:** `GET /api/rider/captains/nearby?bbox=minLng,minLat,maxLng,maxLat` (any valid bearer token) → `200 { "cars": [ { "id": "43ecefb2ad0c", "latitude": 33.3205, "longitude": 44.4003, "heading_deg": 271.5 } ] }`.
- **`bbox` is the visible map rectangle**, comma-joined, in the **exact** order `minLng,minLat,maxLng,maxLat` — the same convention as `GET /api/places/nearby`. Send whatever the viewport reports on region-change-complete; debounce so a pan gesture fires one request at rest, not one per frame.
- **Maximum viewport: 1° per axis** (~111 km N-S, ~93 km E-W at Baghdad — far past any pickup-map zoom). A larger rectangle is rejected with `400 {"error":"bbox is too large: ... zoom in"}`. This is a hard server rule, so **gate it client-side too and simply draw no cars when the rider zooms past it** rather than polling into a guaranteed 400. The limit exists because an over-zoomed viewport arrives clamped to the poles, which PostGIS rejects outright as an antipodal edge (a 500), and because the ordering is a plain distance sort that degrades to a sequential scan over every online captain.
- **Returns at most 20 cars**, nearest to the **viewport centre** first. Zoomed out over a whole city you get the 20 closest to the middle of the screen, not a random 20 — the cap, not the rectangle, is what bounds the response.
- **Only genuinely live cars:** the captain is flagged online **and** pinged within the last 5 minutes (the same window the staleness sweep uses). A captain whose phone died is never painted.
- **Captains already carrying a passenger are EXCLUDED.** Not for tidiness: a rider on a trip already gets their captain's real id and exact position from `GET /api/rider/trips/{id}/captain-location`, so an occupied car appearing here could be matched by position to its day token and that one named captain then followed for the rest of the day. Excluding on-trip captains is what keeps the feed anonymous. The layer is still ambience — not an availability promise; the fare/ETA quote is what sets expectations.
- **An empty `cars` array is a normal answer.** Render nothing; no empty state, no error toast.
- **Exempt from the global rate limiter** (it is polled), so a shared NAT IP will not 429.

**Privacy — read before you build on this.** The payload is deliberately the smallest thing that can animate a marker, because it hands workforce positions to *any* logged-in rider:

| Field | Note |
|-|-|
| `id` | Opaque per-day token (12 hex chars). **Stable for one Asia/Baghdad calendar day**, so you can match car A across polls and tween it. **Different tomorrow** for the same captain. It is **not** a captain id and cannot be resolved to one — do not persist it, key analytics on it, or try to correlate it with a trip. |
| `latitude` / `longitude` | Rounded to **4 decimals (~11 m)** — coarser than the captain's real fix, on purpose. |
| `heading_deg` | Nullable, `[0, 360)`, clockwise from true north. `null` while stopped — keep the last rotation. |

There is **no** name, phone, plate, car star, rating, or trip state here, and there never will be. If you need the real car for a booked trip, that is the snapshot + `rt:trip:{id}` stream above.

**Client behaviour:** poll every ~6s while the pickup phase is foregrounded; stop the moment the flow leaves pickup, the screen blurs, or the app backgrounds. Between polls, animate each car from its rendered position/heading to the new fix (linear lat/lng, **shortest-arc** heading) exactly as for the trip car — otherwise the markers teleport every 6s. Ids that vanish from the feed should fade out; new ids appear without animation.

**Errors:** `400` when `bbox` is missing, is not 4 numbers, or is non-numeric (plain `{ "error": … }`). A **degenerate rectangle** (after clamping, min not strictly < max on an axis — e.g. inverted corners or zero area) returns `400` with the structured body `{ "error": …, "expected_order": "minLng,minLat,maxLng,maxLat" }`, so you can machine-detect a coordinate-order bug instead of reading an empty map as "no cars here". Note the server **cannot** detect an axis-swapped-but-still-ordered bbox (lat-first) — that is a valid rectangle somewhere else and returns an honest empty `200`. Send the coordinates in the documented order. Coordinates that merely overscan the antimeridian/poles are clamped, not rejected. `401` unauthenticated.

## Admin Operations (Phase 8 — Live)

The full admin operational surface — 28 endpoints under `/api/admin`. All require an admin Bearer token. **Reads** (dashboards, operations lists, customer reads, settings GET) accept any admin role; **writes** (settings PUT, force-actions, customer block/unblock/gender, all admin-user management) are **super_admin only** (operator/finance → 403). Errors: 400 validation, 401 unauthenticated/**revoked token**, 403 wrong role, 404 not found, 409 conflict.

- **Settings (Setup):** `GET /api/admin/settings` → `{ settings: Setting[] }` (now 21 keys: `pricing.*`, `activation.daily_fee_iqd`, `room.default_max_*`, `room.allow_women_only_globally`, `general.*`). `GET /api/admin/settings/{key}` → `Setting { key, value (string), updated_by?, updated_at }`. `PUT /api/admin/settings/{key}` `{ value }` (super_admin) → updated `Setting`. **Range-validated** per key (e.g. `room.default_max_riders` 2-6, `activation.daily_fee_iqd` 500-10000, per-km 100-10000) — out of range → 400. **Settings are non-retroactive**: changing a value does NOT rewrite existing zones/activations (but fare keys ARE live for NEW estimates/bookings immediately — fares are computed per request). The `activation.daily_fee_iqd` setting now drives the captain Activate-Today fee (was a 2000 constant); zone-creation defaults read `pricing.*`/`room.*`.
  - **Tiered fare pricing keys (new, drive the live fare engine for both apps):** normal taxi → `pricing.regular_base_fare_iqd` (base, 500–10000), `pricing.regular_tier1_per_km_iqd` (≤threshold km, 100–10000), `pricing.regular_tier2_per_km_iqd` (>threshold km, 100–10000); Abriyah → `pricing.abriyah_base_fare_iqd` (base, 0–5000), `pricing.abriyah_tier1_per_km_iqd` (100–10000), `pricing.abriyah_tier2_per_km_iqd` (100–10000); shared → `pricing.tier_threshold_km` (km where tier2 begins, 1–100, default 10) and `pricing.round_to_iqd` (round the final fare UP to this multiple, 1–1000, default 250). Defaults: 250/125 IQD/km split at 10 km, rounded up to 250 IQD. The legacy flat `pricing.regular_per_km_iqd` / `pricing.abriyah_per_km_iqd` keys remain in the table (used only for zone-creation defaults) but **no longer affect fare computation**.
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
  "fare_iqd": 3300,
  "distance_km": 7.0,
  "base_fare_iqd": 2000,
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
