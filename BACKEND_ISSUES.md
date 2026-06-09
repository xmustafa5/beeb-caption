# Backend Issues / Gaps

Tracked here instead of being worked around in the client (per `CLAUDE.md`).
Backend: `https://beeb.madebyhaithem.com` · spec snapshot: `docs/openapi.json`.

> **2026-06-07 — All five items below are RESOLVED.** The backend shipped and
> deployed fixes for #1–#5; verified live against the prod stack on 2026-06-07
> (zones seeded, `validate-pins` public, both new endpoints live and auth-gated).
> The `docs/openapi.json` snapshot was refreshed from the live spec the same day.
> Kept here as a record of what was requested vs. delivered. No open backend gaps.

---

## 1. No rider-facing captain summary for the Live Trip screen  — ✅ **RESOLVED 2026-06-07**

**Found:** 2026-06-05 (Phase 2 integration) · **Resolved:** 2026-06-07

The Customer App Live Trip screen needs the captain's name, car (make/model/colour),
plate, and rating; the rider token previously couldn't read any of it.

**Delivered:** `GET /api/rider/trips/{id}/captain` (rider token; scoped — only the
trip's owner, else 403/404) →
`{ name, car_make, car_model, car_color, car_plate, avg_rating, trip_count }`.
No phone (calling stays on the masked proxy `GET /api/rider/trips/{id}/proxy`).
Verified live (401 auth-gated, route present in the refreshed spec).

**Client follow-up:** wire this into `components/trip/driver-card.tsx` so the card
fills name/car/plate/rating instead of degrading to "Your captain".

---

## 2. Environment not seeded — blocked end-to-end testing  — ✅ **RESOLVED 2026-06-07**

**Found:** 2026-06-05 · **Resolved:** 2026-06-07

Staging/prod is now seeded and an idempotent E2E harness (`scripts/seed_staging.sh`,
backend repo) is committed. Verified live:

- **1 active Baghdad city** (`Asia/Baghdad`).
- **Zones present** — `GET /api/zones` returns `Central Abriyah` (abriyah_enabled,
  `abriyah_per_km_iqd: 1000`, `abriyah_base_fare_iqd: 2000`, `allow_women_only: true`,
  `room_max_riders: 4`, `room_max_wait_seconds: 300`) **and** `East Regular`
  (regular_only), both `active: true`.
- **2 approved + activated-today + online captains** (male `STG-1001`, female
  `STG-1002`, all 5 docs) + a test rider.
- The harness drives a full trip lifecycle (request → accept → arrive → start →
  complete) plus location pings; a regular trip ran to `completed` (fare 3576 IQD).

**Unblocks:** Phase 3 (Abriyah) and the full regular/Abriyah happy-path E2E.

---

## 3. `POST /api/abriyah/validate-pins` required auth  — ✅ **RESOLVED 2026-06-07**

**Found:** 2026-06-05 · **Resolved:** 2026-06-07

Now **public**, mirroring `GET /api/trips/estimate`. Verified live: unauthenticated
`POST` returns `200 { valid, zone_id?, message }` (e.g. `{"valid":true,"zone_id":
"…","message":"Both pins are inside the Abriyah zone."}`). Behavior otherwise
unchanged — never an HTTP error; `valid:false` + human message when a pin is out of
zone. Safe to call during map exploration / before login.

---

## 4. WS frames carried no event-type discriminator  — ✅ **RESOLVED 2026-06-07**

**Found:** 2026-06-05 · **Resolved:** 2026-06-07

High-traffic rider frames now carry an **optional, additive** inline `event` field:

- Trip lifecycle (`rt:trip:{id}`) → `"event": "trip_update"`
- Captain GPS (`rt:trip:{id}` during an active trip, and `rt:captain:{id}:location`)
  → `"event": "captain_location"`
- Zone cache-invalidation (`rt:zone:{id}`) → `"event": "beep.zone.updated"`

Additive (extra keys are safe to ignore). **Room (`rt:room:*`) and admin-ops
(`rt:admin:ops`) frames do NOT carry `event` yet** — keep the `(channel, payload
fields)` fallback for those. The backend will add `event` to those channels on
request (small follow-up) if needed.

**Client follow-up:** `services/trip-socket.ts` may switch on `event` (preferring it,
falling back to field-sniffing); the room socket built in Phase 3 must field-sniff.

---

## 5. No rider profile-photo upload  — ✅ **RESOLVED 2026-06-07**

**Found:** 2026-06-05 (Profile tab) · **Resolved:** 2026-06-07

Presigned-upload flow shipped (mirrors the captain document flow). Verified live
(`POST /api/riders/me/photo/upload-url` is present and auth-gated):

1. `POST /api/riders/me/photo/upload-url` (rider token, no body) →
   `{ upload_url, object_key, expires_in }`.
2. HTTP `PUT` the image bytes directly to `upload_url` (no auth header — presigned;
   bypasses the API body limit).
3. `PATCH /api/riders/me { "photo_url": "<object_key>" }`.
4. `GET /api/riders/me` returns `photo_url` as a **short-lived presigned GET URL**
   (don't cache long-term). A full `https://…` URL is also accepted as a fallback.

**Client follow-up:** wire this into the Profile tab so avatars persist to the
backend instead of staying as a device-local `file://` URI.
