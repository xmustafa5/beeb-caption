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

---

# Captain App — Open Gaps

## 6. Captain onboarding deadlock: document upload needs a token, but a pending captain can't get one  — ⏳ **OPEN (raised 2026-06-09)**

**Found:** 2026-06-09 (Captain App, Area 1 onboarding) · **Status:** awaiting backend confirmation/fix

The documented captain onboarding flow appears to **deadlock** on auth. Verified live
against `https://beeb.madebyhaithem.com` on 2026-06-09:

- `POST /api/captains/register` is **public** and returns the `Captain` object only —
  **no token** (confirmed with a real 201; body has `id`/`status:"pending"`, no `token` field).
- `POST /api/captains/{id}/documents/upload-url` and `POST /api/captains/{id}/documents`
  both require **`bearer_auth`** (openapi `security: [{bearer_auth:[]}]`; unauthenticated → 401).
- `POST /api/auth/captain/otp/verify` per the contract returns a token **only if the captain
  is registered AND admin-approved**; a pending captain → **403** (no token).
- An admin **cannot approve** until **all 5 documents are uploaded**
  (`POST /api/captains/{id}/approve` → 400 otherwise).

⇒ register (no token) → can't upload docs (needs token) → can't get a token (not approved)
→ can't be approved (docs missing). The PRD's onboarding flow assumes the captain is
authenticated while uploading documents, but no documented path issues a credential to a
**pending** captain.

**Could not fully verify** which resolution is true because the staging **MockSms fixed OTP
code is unknown to the client team** (common guesses `123456/000000/111111/654321` all → 401;
not burning more of the 10/phone/10min OTP budget guessing).

**What we need from backend — one of:**
1. **`POST /api/auth/captain/otp/verify` returns a token for a `pending` captain too**
   (reserve 403 for `rejected`/`blocked`), so the captain can upload docs and poll
   `GET /api/captains/{id}` while pending. *(Preferred — smallest client impact; the client
   is being built to this assumption.)*
2. **`POST /api/captains/register` returns a short-lived onboarding token** in its 201 body
   (e.g. `{ ...captain, token }`) scoped to the document + self-read endpoints.
3. Make the document upload + `GET /api/captains/{id}` self-read endpoints accept the
   captain `id` without a bearer (less ideal — weaker access control on ID images).

Also please confirm the **staging MockSms fixed OTP code** (and the captain test phone behind
plate `STG-1001`) so the client can E2E the verify → token → upload → status-poll path.

**Client follow-up:** Captain App Area 1 is built assuming resolution (1). The presigned-upload
service + status-poll are wired to use the captain token; if backend ships (2) instead, the
change is to read the token from the `register` response instead of from `verify`.

---

### 📨 Message to send the backend team (copy-paste)

> **Subject: Captain App onboarding — auth deadlock + need staging test creds**
>
> **1. Onboarding auth deadlock — need a decision.** Building the Captain App registration
> flow, I hit what looks like a deadlock in the live contract (verified against
> `https://beeb.madebyhaithem.com`, 2026-06-09):
> - `POST /api/captains/register` is **public** and returns the Captain object with **no token**
>   (status `pending`).
> - `POST /api/captains/{id}/documents/upload-url` and `POST /api/captains/{id}/documents`
>   both **require a Bearer token** (401 without one).
> - `POST /api/auth/captain/otp/verify` returns a token **only for approved captains** — a
>   pending captain gets **403, no token**.
> - An admin **can't approve** until all 5 documents are uploaded.
>
> So: register (no token) → can't upload docs (needs token) → can't get a token (not approved)
> → can't be approved (no docs). **How is a pending captain meant to upload their documents?**
>
> Preferred fix (smallest client impact): **`captain/otp/verify` returns a token for `pending`
> captains too** (reserve 403 for `rejected`/`blocked`), so they can upload docs and read
> `GET /api/captains/{id}` while pending. Alternatives that also work: return a short-lived
> onboarding token in the `register` 201 body, or make the document + self-read endpoints accept
> the captain id without a bearer. **Which will you do?**
>
> (Pre-empting two likely questions: "register then log in after approval to upload" doesn't
> work — approval *requires* the docs first, so docs must go up while pending. And the client is
> already built to the preferred fix with token-acquisition isolated to one function, so a
> different choice is a one-line change.)
>
> **2. Staging test credentials.** To E2E the auth flow I need:
> - the **MockSms fixed OTP code** on staging (123456/000000/111111/654321 all return 401), and
> - the **captain test phone(s)** behind plates **STG-1001** (male) and **STG-1002** (female).
>
> **3. Verification rigs for the later captain areas** (Activate Today → Online → Queue →
> Live Trip → Earnings). The two seeded captains (STG-1001/STG-1002) are already approved +
> activated + online, which is great for some paths but means a few states can never be reached
> on them. Please provide / confirm:
>   - **(a) A captain who is approved but NOT yet activated today** — or a way to reset a
>     captain's daily activation (Asia/Baghdad date) — so the "Activate Today" CTA is reachable
>     and I can exercise the **402 insufficient-funds** path on `POST /api/captain/activation/today`.
>   - **(b) Confirm captains can call `GET /api/me/wallet` + `POST /api/me/wallet/topup`**
>     (owner_type derived from the captain JWT). Needed for the top-up-then-retry loop after a 402.
>   - **(c) A trip and/or open Abriyah room sitting in a captain's queue on demand** (or how the
>     seed harness creates one), so `GET /api/captain/trip-queue` returns an offer I can accept
>     and drive through arrive → start → complete.
>   - **(d) Is FCM configured on staging, or Mock-only?** Affects whether `POST /api/me/fcm-token`
>     does anything live (the push feature is deferred to a dev build either way).
>
> **4. Minor.** No public cities endpoint (`/api/cities` → 404); I'm deriving `city_id` from
> `GET /api/zones` (fine for one seeded city). A public active-cities list with display names
> would help the registration city picker if multi-city goes live.

**Status of this ask:**
- **Hard blockers:** (1) the deadlock fix [gates document upload] and the **MockSms OTP code +
  STG-1001/STG-1002 phones** under item 2 [gates *every* captain login → blocks live verification
  of all 6 areas].
- **Needed to verify Areas 2–6** but not to build: items 3(a)–(d).
- **Nice-to-have:** item 4 (public cities list).
