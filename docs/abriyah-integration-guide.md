# Abriyah Integration Guide (Rider App + Captain App)

_Last verified live against prod (`beeb.madebyhaithem.com`, container `beeb-app` on `127.0.0.1:3002`) on 2026-06-26. Every endpoint, status code, and JSON body below was exercised end-to-end with real accounts._

This is the single source of truth for integrating **Abriyah** (shared/pooled rides) into the Customer (Rider) and Captain apps. It explains the model, the exact HTTP contract, the realtime events, the gotchas that bite first, and the operational preconditions.

---

## 1. What Abriyah is (the mental model)

Abriyah is a **shared ride**: up to N riders (default 4) heading to the **same destination zone** are pooled into one **room** and served by one captain. Each rider is **billed independently** for their own distance — there is no fare splitting between riders.

The single most important rule, and the one that causes most confusion:

> **A room is keyed by the DROPOFF zone, not the pickup.**
> Riders can be picked up from anywhere (any active service zone, even different zones). They are pooled together because they are **going to the same Abriyah-enabled zone**.

```
Rider A: pickup Mansour    ─┐
Rider B: pickup Adhamiya   ─┼──►  same DROPOFF zone "Karrada" ──► ONE room ──► ONE captain
Rider C: pickup Karrada    ─┘
```

Two constraints define eligibility:
- **Dropoff** must be inside a zone whose `type = 'abriyah_enabled'` and `active = true`. Otherwise the ride is rejected.
- **Pickup** must be inside **any** active zone (Abriyah or regular). Otherwise rejected.

A room is **not** a trip. Joining a room creates a per-rider **trip** (`trip_type = 'abriyah'`) that starts already in `matched` status and is linked to the room.

---

## 2. Lifecycle (state machines)

### Room status
```
open ──(captain accepts)──► locked ──(dispatch)──► dispatched
  │                                                     ▲
  └──(fills to max_riders WHILE a captain is locked)────┘
  │
  └──(wait window elapses, no captain)──► expired
```

- **open** — accepting riders, no captain yet.
- **locked** — a captain has accepted; the room immediately dispatches (you will rarely observe `locked` as a resting state).
- **dispatched** — captain assigned, all member trips advanced to `accepted`, ride is live.
- **expired** — the wait window (`expires_at`) elapsed before a captain accepted. All member trips are cancelled.

### Per-rider trip status (Abriyah)
```
matched ──(captain accepts room)──► accepted ──► in_progress ──► completed
   └──(rider leaves / room expires)──► cancelled
```
Abriyah trips **skip `requested`** — they are born `matched`. (Regular trips start at `requested`.)

### ⚠️ Critical dispatch nuance (verified live)
**A room filling to `max_riders` does NOT auto-dispatch on its own.** Dispatch requires a captain. The only triggers are:
1. A captain calls **accept** on an open room → it locks and dispatches immediately.
2. (If a captain is already locked onto the room and it then fills — not a path the apps normally drive.)

So a full room with no captain just **sits `open` until a captain accepts or it expires.** Do not build the rider UI to expect "auto-go once 4 join." It goes when a **captain accepts**.

---

## 3. The HTTP contract

Base URL (prod): `https://beeb.madebyhaithem.com`. All bodies are JSON. Coordinates are **WGS84 decimal degrees**; wherever both appear, send `lat` and `lng` as named fields (no lng-first array footguns here).

### 3.0 Auth + roles (which token each route needs)
| Route | Method | Auth |
|---|---|---|
| `/api/abriyah/validate-pins` | POST | **Public** (no token) |
| `/api/abriyah/join` | POST | **Rider** JWT |
| `/api/abriyah/leave` | DELETE | **Rider** JWT |
| `/api/abriyah/rooms/{id}` | GET | **Rider** JWT (any rider may read any room id) |
| `/api/abriyah/rooms/{id}/accept` | POST | **Captain** JWT (approved) |
| `/api/abriyah/rooms/{id}/members` | GET | **Captain** JWT (assigned captain only) |
| `/api/admin/rooms`, `/api/admin/rooms/{id}` | GET | **Admin** JWT |

Sending the wrong role → **403 `{"error":"forbidden"}`** (the role middleware rejects before the handler). A rider token on a captain route, or vice-versa, is the #1 cause of spurious 403s.

---

### 3.1 `POST /api/abriyah/validate-pins` — live map-drag feedback (PUBLIC)

Call this on every pin drag to tell the rider whether the trip is serviceable, **before** they request. It never returns an HTTP error for out-of-zone pins — it returns `200` with `valid:false`.

Request:
```json
{ "pickup_lat": 33.30, "pickup_lng": 44.40, "dropoff_lat": 33.31, "dropoff_lng": 44.36 }
```
(`zone_id` is accepted but **deprecated and ignored** — do not send it from new clients.)

Response (verified):
```json
{
  "valid": true,
  "dropoff_zone_id": "1c8a5591-9ba0-4dca-9e49-35f915b28484",
  "pickup_zone_id":  "1c8a5591-9ba0-4dca-9e49-35f915b28484",
  "message": "Pickup and dropoff are serviceable."
}
```
Invalid dropoff (verified):
```json
{ "valid": false, "dropoff_zone_id": null, "pickup_zone_id": "…",
  "message": "Dropoff is not inside an Abriyah-enabled zone." }
```
Failure modes the `message` distinguishes:
- `dropoff_zone_id == null` → dropoff not in an Abriyah zone (block the request, show the message).
- `pickup_zone_id == null` → pickup outside all active zones.
- `valid == true` → safe to enable the "Request Abriyah" button.

---

### 3.2 `POST /api/abriyah/join` — rider joins or opens a room (RIDER)

Request:
```json
{ "pickup_lat": 33.30, "pickup_lng": 44.40,
  "dropoff_lat": 33.31, "dropoff_lng": 44.36,
  "room_type": "mixed" }
```
`room_type` is `"mixed"` or `"women_only"`. The rider's gender is read **server-side** from their profile — you don't send it.

Response `201` (verified — note the room may already be `dispatched` if a captain was waiting):
```json
{
  "room": {
    "id": "901d137b-…", "zone_id": "1c8a5591-…",
    "room_type": "mixed", "status": "open",
    "max_riders": 4, "rider_count": 1,
    "captain_id": null,
    "expires_at": "2026-06-26T09:21:46Z",
    "dispatched_at": null,
    "created_at": "…", "updated_at": "…"
  },
  "member": {
    "id": "…", "room_id": "901d137b-…", "rider_id": "…",
    "trip_id": null, "distance_km": 3.88, "fare_iqd": 1000,
    "joined_at": "…"
  },
  "trip_id": "2feb51fc-…",
  "fare_iqd": 1000,
  "distance_km": 3.8800393909558544
}
```
Use `room.id` to poll/subscribe, and `trip_id` to track the rider's trip. `fare_iqd` is this rider's locked fare in integer IQD.

> Note: `member.trip_id` may be `null` in the immediate response (the trip is linked a beat later); the top-level `trip_id` is always present — use that.

**Error responses (all verified):**
| Status | Body | Cause |
|---|---|---|
| 400 | `bad request: pickup is not inside any active service zone` | pickup outside all active zones |
| 400 | (dropoff not in abriyah zone) | dropoff not in an Abriyah-enabled zone |
| 400 | `invalid room type 'carpool' (expected 'mixed' or 'women_only')` | bad `room_type` |
| 403 | `forbidden` | women_only requested by a non-female rider (see §5), OR a non-rider token |
| 409 | `conflict: rider is already in an active room` | rider already in an `open`/`locked` room |

---

### 3.3 `DELETE /api/abriyah/leave` — rider leaves (RIDER)

Removes the rider from their current room and cancels their trip. Returns `200 {"message":"left room"}`.

> ⚠️ **`leave` only works while the room is `open` or `locked`.** Once the room is **`dispatched`**, `leave` returns `400 {"error":"rider is not in any active room"}` (verified). After dispatch, cancellation is a trip-level action, not a room action — the rider is committed to the captain. Build the rider UI so "Leave/Cancel" disappears (or switches to a trip-cancel flow) once `status == "dispatched"`.

---

### 3.4 `GET /api/abriyah/rooms/{id}` — room + members (RIDER)

Polling target for the rider's "finding/seating" screen. Returns the room and its member seats (fare, distance, trip id per seat — no geometry). Any authenticated rider may read any room id (no ownership check). `404` if the id doesn't exist.

---

### 3.5 `POST /api/abriyah/rooms/{id}/accept` — captain takes the room (CAPTAIN)

Locks the open room to the captain and **immediately dispatches** it (advances every member trip `matched → accepted`). Returns the dispatched `Room` (verified):
```json
{ "id": "136ecd8c-…", "zone_id": "1c8a5591-…", "room_type": "mixed",
  "status": "dispatched", "max_riders": 4, "rider_count": 1,
  "captain_id": "ebc689e5-…", "dispatched_at": "2026-06-26T09:17:50Z", … }
```

**Error responses (verified):**
| Status | Body | Cause |
|---|---|---|
| 400 | (room not open) | room is not in `open` status (already taken/expired/dispatched) |
| 403 | `forbidden` | captain not `approved`, OR a non-female captain accepting a `women_only` room |
| 404 | `not found` | no room with that id |
| 409 | `conflict: captain already has an active room assignment` | **captain is still bound to another room** (see below) |

> ⚠️ **A captain can hold only ONE active room at a time, and `dispatched` counts as active.** "Active" for a captain = `status IN ('locked','dispatched')`. So a captain who has dispatched a room **cannot accept a new one until that room leaves the dispatched state** (i.e. the pooled trips finish their lifecycle). The Captain App must not show "accept" on a second room while the captain has a live Abriyah pool — it will 409.

---

### 3.6 `GET /api/abriyah/rooms/{id}/members` — captain's rider roster (CAPTAIN, assigned only)

Only the **assigned** captain may call this (else `403 forbidden`). Returns the shared dropoff zone, a per-pickup-zone breakdown, and the full roster with **unmasked phone numbers** for contacting riders. Verified body:
```json
{
  "room_id": "136ecd8c-…",
  "dropoff_zone": { "zone_id": "1c8a5591-…", "name": "Central Abriyah", "name_ar": "المركز عبرية" },
  "pickup_breakdown": [
    { "zone_id": "1c8a5591-…", "name": "Central Abriyah", "name_ar": "المركز عبرية", "rider_count": 1 }
  ],
  "members": [
    {
      "rider_id": "59c9e3b5-…",
      "name": "FE Test Rider",
      "phone": "9647000000099",
      "pickup_wkt": "POINT(44.4 33.3)",
      "dropoff_wkt": "POINT(44.36 33.31)",
      "fare_iqd": 1000,
      "distance_km": 3.88,
      "joined_at": "2026-06-26T09:17:10Z"
    }
  ]
}
```
- `pickup_breakdown` powers a "3 from Mansour, 2 from Adhamiya, 1 unknown" summary. A `zone_id:null` entry groups pickups that fell outside all active zones.
- `pickup_wkt`/`dropoff_wkt` are `POINT(lng lat)` (lng-first WKT) — parse accordingly to drop pins.
- `phone` is the rider's real number (not proxied here).

---

## 4. Fares (how `fare_iqd` is computed)

Per-rider, independent. Priced from the **pickup zone**:
- If the pickup zone is **Abriyah-enabled** → Abriyah tier rates.
- Else (regular pickup zone) → regular tier rates.

Tiered formula (settings-driven, current prod values shown):
```
d            = haversine(pickup, dropoff) in km
tiered       = min(d, tier_threshold_km) * tier1_per_km
             + max(d - tier_threshold_km, 0) * tier2_per_km
fare_iqd     = round_up_to(round_to_iqd, base_fare_iqd + tiered)
```
Prod settings (verified): `tier_threshold_km=10`, `round_to_iqd=250`,
Abriyah `base=0, tier1=250, tier2=125`; Regular `base=2000, tier1=250, tier2=125`.

Verified examples:
- 3.88 km Abriyah → `0 + 3.88*250 = 970 → round up to 250 ⇒ **1000 IQD**`. ✅
- 18.72 km Abriyah → `10*250 + 8.72*125 = 2500+1090 = 3590 → **3750 IQD**`. ✅

**Fare preview before joining:** use the public `GET /api/trips/estimate` (same math). The `fare_iqd` returned by `join` is **locked at join time** and won't change if zone/settings pricing changes afterward.

---

## 5. Women-only rooms — exact gender rules

| Actor | Rule |
|---|---|
| Rider joining `women_only` | Must have **`gender = 'f'`** on their profile. AND the dropoff zone must have `allow_women_only = true`. |
| Captain accepting `women_only` | Must have **`gender = 'f'`**. A male captain → `403 forbidden`. |
| `mixed` | No gender constraint on either side. |

> ⚠️ **Registration defaults a rider's gender to `unset`, not a real value.** A brand-new rider who never set their gender will get **`403 forbidden`** on a `women_only` join — verified live (the engine checks `gender == 'f'`, and `unset != 'f'`). This looks like a bug to the FE but is correct gating. **The rider must set `gender='f'` on their profile first** (`PUT /api/users/me` profile update with `gender`). Surface the women-only toggle only when `user.gender == 'f'` AND the resolved dropoff zone allows it (read `allow_women_only` from the zone, or just attempt and handle the 403).

---

## 6. Expiry / timeout

A room is created with `expires_at = now + zone.room_max_wait_seconds` (default **300 s**). A background sweep runs **every 30 s** (verified: `SWEEP_SECS=30`) and expires any `open`/`locked` room past `expires_at`, cancelling all member trips. So:
- Rider UI should show a countdown to `expires_at` and handle the "room expired, no captain found — try again" outcome (the rider's trip flips to `cancelled`; they get a push).
- This is a backstop; the happy path is a captain accepting before expiry.

---

## 7. Realtime events (WebSocket / pub-sub)

The backend publishes to per-entity channels. Subscribe via the WS endpoints (`/ws/subscribe`, `/ws/captain`). Relevant Abriyah actions:

| Channel | Action | Meaning | Who cares |
|---|---|---|---|
| `rt:room:{room_id}` | `beep.room.opened` | a new room was created | admin live map |
| `rt:room:{room_id}` | `beep.room.joined` | a rider joined (carries `rider_count`, `fare_iqd`) | riders in room (fill progress) |
| `rt:room:{room_id}` | `beep.room.locked` | captain accepted | riders in room |
| `rt:room:{room_id}` | `beep.room.dispatched` | room dispatched (carries `member_count`) | riders + captain |
| `rt:trip:{trip_id}` | `beep.trip.requested` | rider's Abriyah trip created (status `matched`) | rider |
| `rt:trip:{trip_id}` | `beep.trip.accepted` | captain assigned to this trip | rider |
| `rt:trip:{trip_id}` | `beep.trip.cancelled` | trip cancelled (rider left / room expired) | rider |

Riders should subscribe to **both** `rt:room:{room_id}` (fill/lock/dispatch) and `rt:trip:{trip_id}` (their own trip). Also enqueued: an FCM push `room_dispatched` ("Captain on the way") to each rider on dispatch.

---

## 8. End-to-end flows

### Rider app
1. Map drag → `POST /validate-pins` (public) for inline serviceability. Enable "Request" only when `valid:true`.
2. (Optional) `GET /api/trips/estimate` for a fare preview.
3. Tap Request → `POST /api/abriyah/join` with `room_type`. Store `room.id` + `trip_id` + `fare_iqd`.
4. Show "finding captain" screen: subscribe to `rt:room:{id}` + `rt:trip:{trip_id}`; optionally poll `GET /api/abriyah/rooms/{id}`. Show countdown to `expires_at`.
5. On `beep.room.dispatched` / `beep.trip.accepted` → switch to live-trip UI (captain info, location).
6. Before dispatch, allow `DELETE /api/abriyah/leave`. After dispatch, hide it (use trip-cancel instead).
7. Handle `expired` / `beep.trip.cancelled` → "no captain found, try again".

### Captain app
1. Captain must be **`approved`** and **online** (Abriyah accept itself only checks `approved`, but the operational app flow expects an online, activated captain — see the captain online/activation gate in the separate realtime docs).
2. Show available open rooms for the captain's area (admin/ops feed or a captain-facing room list). Women-only rooms appear only for female captains.
3. Tap Accept → `POST /api/abriyah/rooms/{id}/accept`. On `200`, the room is dispatched and you own it.
   - Handle `409` (captain already has an active room — finish the current pool first).
   - Handle `403` (not approved / wrong gender for women_only).
4. `GET /api/abriyah/rooms/{id}/members` → render pickup sequence + rider contacts (parse `pickup_wkt`/`dropoff_wkt`).
5. Drive the pooled trips through their lifecycle (accept→in_progress→completed) via the trips API per rider.

---

## 9. Operational preconditions (why it might "not work" at all)

Abriyah depends on **admin-configured data**. If these are missing, every join 400s and the FE can't tell why:

1. **At least one `abriyah_enabled`, `active` zone whose polygon covers the dropoff area.** Verified in prod today: there are **2 zones** — `Central Abriyah` (abriyah_enabled, covers most of greater Baghdad: lng ~43.72–44.98, lat ~32.87–33.73) and `East Regular` (regular_only). So Abriyah works for central-Baghdad dropoffs **today**, but the coverage is one big test polygon, not real per-district zones. Ops should draw real zones before launch.
2. **Pricing settings seeded** (they are — see §4).
3. **Approved captains** to accept rooms (otherwise rooms just expire).

**For the FE to test reliably, ask ops for the current zone polygons (or their bounding boxes)** so you send dropoff coords that are actually inside an `abriyah_enabled` zone. A dropoff in the wrong place is the most common "Abriyah is broken" report — it's just an out-of-zone pin.

---

## 10. Issues / gaps found during this audit

These are real findings from the live audit — share with backend/ops:

1. **Coverage is placeholder.** Only one big rectangular `abriyah_enabled` zone exists, overlapping the `regular_only` zone. Real launch needs proper district zones; until then "is this an Abriyah area?" answers are coarse.
2. **`unset` gender silently blocks women-only.** New riders default to `gender='unset'`, so women-only 403s until they set gender. There is no API hint that "you must set your gender first" — the FE has to know this. Consider a clearer error than bare `forbidden`.
3. **Full room without a captain never dispatches** — only a captain accept dispatches. If captain supply is thin, riders fill rooms that then expire. The rider UX must message this honestly ("waiting for a captain", not "waiting for riders").
4. **Captain is single-roomed across `dispatched`.** A captain can't take a new Abriyah pool until the current dispatched one clears. Fine by design, but the captain app must reflect it (no second "accept") or it 409s.
5. **`leave` is room-state-sensitive** — it 400s after dispatch. Not a bug, but undocumented until now; the rider UI must switch from "leave room" to "cancel trip" at dispatch.

None of these are code defects in the matching engine — the engine, pooling, fares, gender gates, dispatch, and expiry all work exactly as designed (verified live). They are data/UX/operational items.

---

## Appendix: verified test transcript (reproducible)

Using the test-OTP bypass (`TEST_OTP_PHONES`, code `16001600`) on prod:
- Rider `9647000000099` (set `gender='f'`) and a second rider `9647000000098`, plus an approved captain.
- `validate-pins` valid/invalid ✅
- `join` (mixed) → room opened, trip `matched`, `fare_iqd=1000` for 3.88 km ✅
- second rider, **different pickup, same dropoff zone → pooled into the SAME room**, `rider_count` 1→2 ✅
- duplicate join by same rider → `409 already in a room` ✅
- captain `accept` → room `dispatched`, member trip `accepted` ✅
- captain `members` → full roster with `pickup_breakdown` ✅
- women_only by `unset` rider → `403`; by `gender='f'` rider → `201` ✅
- tiered fare 18.72 km → `3750 IQD` ✅
- room-expiry sweep runs every 30 s; 14 rooms observed in `expired` state ✅
