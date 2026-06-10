# Captain App — Area 1: Onboarding & Auth — Design

> Spec for the first build area of the Beeb Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-09. Grounded in the Captain App PRD (`docs/prd/Beep_Module_Captain_App_PRD_V1_0_0.md`),
> the backend handoff (`docs/frontend-summary.md` → Captain App), the live OpenAPI spec
> (`docs/openapi.json`), and live probes against `https://beeb.madebyhaithem.com` (2026-06-09).

## 1. Goal

A captain can authenticate and reach the right place based on their backend status:

- **Approved** captain logs in (OTP) → gets a JWT → lands in the app tabs.
- **Unregistered** phone → routed into the registration wizard (personal → vehicle → 5 documents) → Approval Pending.
- **Pending / rejected / blocked** captain → routed to the matching status screen.

Persist a real captain JWT (SecureStore) and resume onboarding correctly across app restarts.

This area is the foundation: **no other captain feature works without a captain token**, so it ships first.

## 2. Scope

**In scope**
- Rework the auth store from a rider `User` shape to a `Captain` shape.
- Captain OTP login (`POST /api/auth/captain/otp/verify`) with status branching (200 / 403 / 404).
- Self-registration wizard (3 paged steps) → `POST /api/captains/register`.
- 5-document presigned upload (camera or library) with per-row state + completeness gating.
- Approval-Pending / Rejected / Blocked status screens with approval detection.
- `AuthGate` rework to route on `(token, captain.status, pendingCaptainId)`.
- Captain profile query hook (`use-captain`) replacing `use-me`.
- EN + AR i18n for all new strings; RTL-aware layout.

**Out of scope (later areas / tasks)**
- Activate Today, online toggle, queue, live trip, earnings (Areas 2–6).
- FCM push registration + approval push deep-link (deferred; needs a dev build).
- Profile editing surface (gender is locked post-registration anyway).
- Admin approval (admin dashboard, separate surface).

## 3. Backend contract (verified 2026-06-09)

| Endpoint | Auth | Notes |
|---|---|---|
| `POST /api/auth/otp/send {phone}` | public | Reused as-is. 200 `{message}`. Rate limit 10/phone/10min → 400 rate-limited. |
| `POST /api/auth/captain/otp/verify {phone,code}` | public | **200** `{token, user_id}` (approved; `user_id` = captain id) · **401** wrong/expired code (empty-ish body `{error:"unauthorized"}`) · **403** registered but not approved · **404** no captain for phone. |
| `POST /api/captains/register` | **public** | Body `{phone, name, name_ar, gender("m"\|"f"), car_make, car_model, car_plate, city_id, car_color?, national_id?}` → **201 Captain** (status `pending`). **No token in response** (verified). 409 on duplicate phone/plate; 400 validation; 404 unknown city. |
| `GET /api/captains/{id}` | **bearer** | → Captain. 401 without token. Used to hydrate the profile after a 200 verify. |
| `POST /api/captains/{id}/documents/upload-url {doc_type}` | **bearer** | → `{upload_url, object_key, expires_in (~300s)}`. |
| `PUT <upload_url>` (raw bytes) | **none** (presigned) | Set `Content-Type` to the image type; **no Authorization header**. Bypasses the API body limit. |
| `POST /api/captains/{id}/documents {doc_type, object_key}` | **bearer** | Upserts (re-upload replaces). → CaptainDocument. |
| `GET /api/captains/{id}/documents/completeness` | **bearer** | → `{complete, uploaded[], missing[]}`. |
| `GET /api/zones` | public | Carries `city_id` per zone; source for the city picker. No public `/api/cities` (404). |

**Captain object** (key fields): `id, phone, name, name_ar, gender, car_make, car_model, car_plate, car_color?, city_id, national_id?, status ("pending"|"approved"|"rejected"|"blocked"), rejection_reason?, rejection_comment?, blocked_reason?, avg_rating, trip_count, cancellation_count, registered_at, updated_at, version`.

**5 required doc types:** `driver_license`, `car_registration`, `captain_selfie`, `national_id_front`, `national_id_back`.

### 3.1 Onboarding auth — RESOLVED (BACKEND_ISSUES.md #6, fixed 2026-06-10)

The onboarding deadlock is **fixed** (backend shipped our preferred option, verified live):

- `POST /api/auth/captain/otp/verify` **issues a token for a `pending` captain** (403 only for
  `rejected`/`blocked`, 404 for unknown). So: register → otp/send → verify (token while pending) →
  upload 5 docs with that token → poll `GET /api/captains/{id}` until `approved`.
- **Ownership is enforced:** a captain token may access **only its own** captain id
  (`GET /api/captains/{id}`, `…/documents*`); another id → **403**; admin → any. **Always call these
  with the captain's own id from the verify response's `user_id`** (the spec already does).
- The **pending token is onboarding-scoped** — every operational endpoint returns **403 until
  approved**, matching the area sequencing.

**Consequence for this spec:** the "no token while pending" degraded branch (§4.6) is **dead** — a
pending captain always holds a token, so the status screen always polls `GET /api/captains/{id}` and
never needs a re-verify fallback. Token acquisition stays isolated in `captain-auth` (one place).

**Test credentials (staging fixed-code bypass — no SMS):**
- **Captain (approved, male):** phone `9647000000098`, code `16001600`, id
  `a0a0a0a0-0000-4000-8000-000000000098`, plate `FE-TEST-098`.
- **Rider:** phone `9647000000099`, code `16001600`.
- (Real seeded captains STG-1001/1002 = `9647700000001`/`…002` now use **real SMS** — prefer the
  bypass numbers for E2E.) The approved test captain is **not activated today** with a **0 balance**,
  so the Activate-Today CTA + 402 path are reachable as-is for Area 2.

## 4. Architecture — units

Each unit has one purpose, a clear interface, and is independently understandable.

### 4.1 `store/auth-store.ts` (rework in place)

```ts
type CaptainStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
type Gender = 'male' | 'female'        // captains are always m/f (no 'unset')

interface Captain {
  id: string
  phone: string
  name: string
  nameAr: string
  gender: Gender
  carMake: string
  carModel: string
  carColor?: string | null
  carPlate: string
  cityId: string
  nationalId?: string | null
  status: CaptainStatus
  rejectionReason?: string | null
  rejectionComment?: string | null
  blockedReason?: string | null
  avgRating: number
  tripCount: number
}

interface AuthStore {
  token: string | null              // JWT; null until a token is issued
  captain: Captain | null           // full profile once readable
  pendingCaptainId: string | null   // set after register so a pending captain resumes the status screen
  hasHydrated: boolean
  setSession: (token: string, captain: Captain) => void
  setPending: (captainId: string) => void   // also clears token
  updateCaptain: (patch: Partial<Captain>) => void
  clear: () => void                          // full logout: token + captain + pendingCaptainId
  setHasHydrated: (v: boolean) => void
}
```

- SecureStore-backed `persist` (keep `name: 'beeb.auth'` for continuity), `partialize` to
  `{ token, captain, pendingCaptainId }`, `onRehydrateStorage` → `setHasHydrated(true)` (root gating unchanged).
- `clear()` is called by the api 401 interceptor (already wired in `lib/api.ts` — it calls
  `useAuthStore.getState().clear()`; we keep that method name).

### 4.2 `services/captain-auth.ts` (new)

Shared helpers (`normalizePhone`, gender mappers) move into a small `lib/phone.ts` /
`lib/gender.ts` or are re-exported; rider `services/auth.ts` can stay for now (not deleted, just
unused by captain screens — a later cleanup task may remove rider-only services).

```ts
type VerifyResult =
  | { kind: 'authed'; token: string; captain: Captain }
  | { kind: 'pending' }       // 403 — registered, not approved
  | { kind: 'unregistered' }  // 404 — no captain for this phone

requestOtp(phone): Promise<{ ok: true }>                     // POST /api/auth/otp/send
verifyCaptainOtp(phone, code): Promise<VerifyResult>         // POST /api/auth/captain/otp/verify, branch on status
registerCaptain(input): Promise<Captain>                     // POST /api/captains/register → 201
getCaptain(id): Promise<Captain>                             // GET /api/captains/{id} (bearer)
```

- `verifyCaptainOtp` maps backend → `VerifyResult`: 200 → fetch `getCaptain(user_id)` with the
  fresh token passed explicitly (interceptor only fills Authorization when absent) → `authed`;
  403 → `pending`; 404 → `unregistered`. **401 (wrong code) and 429 propagate as errors** for the
  caller to surface inline (branch on status, not body — 401 body is empty-ish).
- A `toCaptain(BackendCaptain)` mapper converts snake_case → the camelCase `Captain` shape and
  gender `m/f` → `male/female`.

### 4.3 `services/captain-documents.ts` (new)

```ts
type DocType = 'driver_license' | 'car_registration' | 'captain_selfie'
             | 'national_id_front' | 'national_id_back'

requestUploadUrl(captainId, docType): Promise<{ uploadUrl, objectKey, expiresIn }>
uploadDocument(captainId, docType, localUri): Promise<CaptainDocument>  // orchestrates: presign → PUT bytes → confirm
getCompleteness(captainId): Promise<{ complete: boolean; uploaded: DocType[]; missing: DocType[] }>
```

- `uploadDocument` = presign → `fetch(uploadUrl, {method:'PUT', headers:{'Content-Type': mime}, body: blob})`
  (no auth header; pattern lifted from `uploadRiderPhoto` in `services/auth.ts`) → confirm with
  `object_key`. Throws on a non-2xx PUT so the row can show "failed · retry".
- The 5 doc types live in a `const DOC_TYPES = [...] as const` (ordered as displayed).

### 4.4 `services/cities.ts` (new, tiny)

```ts
getCities(): Promise<{ id: string }[]>   // GET /api/zones → dedupe by city_id
```

- The registration city step calls this. **Exactly one city → auto-select, no picker UI.**
  Multiple → a simple picker (labelled generically; zones carry no city display name — noted as a
  follow-up if multi-city ships). Logged dependency in the roadmap (city name source).

### 4.5 Registration wizard — `app/(auth)/register/`

Paged, one screen per step (approved layout). A lightweight **wizard store** (Zustand, in-memory,
not persisted) holds the cross-step draft so each screen stays focused:

```ts
// store/registration-store.ts  (ephemeral; cleared on submit/abandon)
interface RegistrationDraft {
  phone: string            // carried from the OTP step
  name, nameAr, gender, nationalId?
  carMake, carModel, carColor?, carPlate
  cityId: string
  setStep1(...), setStep2(...), reset()
}
```

- `register/personal.tsx` — name (EN), name_ar (AR), gender chips (m/f, **required**; the backend
  locks gender after submit, and Area 1 has no edit surface, so it's simply collected once here),
  national ID (optional). RHF + zod per step. Next → vehicle.
- `register/vehicle.tsx` — make, model, color (optional), plate; city (auto-selected or picker).
  "Submit" here calls `registerCaptain(draft)` → on 201, `setPending(captain.id)` +
  store the id for the documents step → navigate to documents. (Register before the doc step
  because upload-url needs the captain id.)
- `register/documents.tsx` — the 5-row checklist. Each row: empty / uploading (progress) /
  uploaded (✓, tap to replace) / failed (tap to retry). Tap → action sheet (Take photo / Choose
  from library, `expo-image-picker`). On all 5 confirmed (verify via `getCompleteness` or local
  state) → "Submit registration" enabled → navigate to the status screen (pending).
- Phone enters the draft from the existing OTP screen's `unregistered` branch (it passes `phone`).

`expo-image-picker` is already a dependency. Camera + library both enabled (per approved doc-step design).

### 4.6 Status screens — `app/(auth)/status.tsx`

One screen, switches on `captain.status` / pending context:
- **pending** — "في انتظار الموافقة / Waiting for approval", submitted-ago (from `registered_at`),
  "~within 24h", **[Check status]** button + re-check on app foreground, **[Contact Support]**.
- **rejected** — reason (mapped enum → localized copy) + comment + Contact Support; a
  "Re-submit" path is out of scope here (reconsider is admin-driven).
- **blocked** — blocked reason + force-logout (`clear()`), Contact Support.

**Approval detection (post-fix — simplified).** Because verify now issues a token for pending
captains, **the captain always reaches the status screen holding a token + their own id** — via
either route:

- **Via registration:** register (public, no token) → immediately `verifyCaptainOtp(phone, code)`
  to obtain the **pending token** + `user_id` → `setSession(token, captain)` → upload the 5 docs →
  status screen.
- **Via login** (already-registered, unapproved): verify returns 200 with a pending token +
  captain whose `status !== 'approved'` → `setSession` → status screen.

So detection is uniformly **`getCaptain(id)` on app-foreground + a "Check status" button** (we have a
token, so no re-OTP needed). When `status` flips to `approved`, `updateCaptain` lands it and the
`AuthGate` routes to the tabs automatically. On-foreground + manual button, not a tight timer
(approval is a ~24h human action). FCM push will later wake this screen automatically.

> **Flow change vs. the original plan:** the registration `documents` step now requires the captain
> to be authenticated *before* uploading. So after `registerCaptain` returns the pending captain, the
> wizard calls `verifyCaptainOtp` (the captain already passed OTP at the start of onboarding, but
> register issues no token, so we verify once to mint the pending token) → `setSession` → then upload.
> Net: `setPending(id)` is replaced by a real `setSession(token, captain)` as soon as register
> completes + verify mints the token. The `pendingCaptainId` field remains useful only as a
> persisted-resume hint if verify hasn't run yet; with the token in hand we key off `captain.status`.

### 4.7 `AuthGate` rework (`app/_layout.tsx`)

Routes on `(token, captain?.status, pendingCaptainId)`:

```
if (token && captain?.status === 'approved')      → ensure in (tabs)
else if (token && captain && status !== approved) → (auth)/status
else if (pendingCaptainId)                         → (auth)/status   // pending, no token
else if (!token)                                   → (auth)/phone    // unless already mid-(auth)
```

- The `(auth)` group keeps `phone` and `otp`; `profile-setup.tsx` is **removed** (rider concept).
- The OTP screen's verify success switches on `VerifyResult.kind`: `authed` → `setSession` → tabs;
  `pending` → status; `unregistered` → seed the registration draft phone → `register/personal`.

### 4.8 `hooks/use-captain.ts` (replaces `use-me.ts`)

`useQuery(['captain', id], () => getCaptain(id), { enabled: !!token })` → syncs into the store via
`updateCaptain`. Refreshes the profile on app open for an authed (approved) captain.

## 5. Data flow (post-fix — verified 2026-06-10)

`verifyCaptainOtp` now returns **200 + token** for **both approved and pending** captains; **403** is
only `rejected`/`blocked`; **404** is unknown (→ register). The captain shape's `status` field then
decides routing.

```
Phone → requestOtp(send) → OTP screen → verifyCaptainOtp(phone, code)
  ├ 200 authed  → setSession(token, captain)
  │                 ├ status approved          → AuthGate → (tabs)
  │                 └ status pending            → AuthGate → (auth)/status  (poll getCaptain → approved → tabs)
  ├ 403 blocked → status: 'blocked' → (auth)/status (force-logout / support)
  │   403 rejected → status: 'rejected' → (auth)/status (reason + support)
  └ 404 unregistered → draft.phone = phone → register/personal → register/vehicle
                         → registerCaptain (201 pending, NO token)
                         → requestOtp(send) + verifyCaptainOtp  →  200 pending token + id
                         → setSession(token, captain)  → register/documents (authenticated)
                           → 5× uploadDocument(captain.id, …)
                           → (auth)/status (pending) → [on approval] getCaptain → tabs
```

**OTP timing (verified live 2026-06-10):** the backend validates the OTP code *before* checking
captain existence, so the `404` "route to register" branch only fires on a **valid** code (a wrong
code is 401 regardless). And `register` issues no token — so after register the wizard does **one more
`otp/send` + `verifyCaptainOtp`** to mint the pending token before uploading docs. For the staging
**bypass numbers the fixed code `16001600` is reusable** (verify twice → 200/200; `otp/send` is a
200 no-op), so this second round-trip is seamless in testing; real phones get a fresh SMS naturally.

## 6. Error handling

All via `parseApiError` / status branching (401 has an empty body — never read its message).

| Status | Context | UX |
|---|---|---|
| 401 | OTP verify | "Wrong or expired code" inline; stay on OTP. |
| 403 | OTP verify | Rejected/blocked captain → route to status screen (no token issued). |
| 404 | OTP verify | Valid code but no captain → route to registration. |
| 200 (status pending) | OTP verify | Token issued; route to status screen and poll `getCaptain`. |
| 409 | register | "Phone or plate already registered" inline on the vehicle step. |
| 400 | register | Field validation message from the envelope. |
| 4xx/5xx | doc PUT/confirm | Row → "failed · tap to retry"; never blocks other rows. |
| 429 | any | "Too many attempts, try again shortly." |
| network | any | "Check your connection" (`common.networkError`). |

## 7. i18n / RTL

- New keys under `captain.*` (auth, register, documents, status) in `i18n/en.json` + `i18n/ar.json`.
- Arabic-primary; invoke the `react-native-rtl-positioning` skill for every new layout. Reuse the
  template's `flexDirection: isRTL ? 'row-reverse' : 'row'` and physical-edge ternaries (no
  `marginStart`/`marginEnd`). Gender chips, doc rows, wizard nav, and progress dots are RTL-aware.

## 8. Verification (no unit-test runner)

Test captain (staging bypass): phone `9647000000098`, code `16001600`, id
`a0a0a0a0-0000-4000-8000-000000000098`.

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (no token): `POST /api/auth/otp/send` 200; `POST /api/captains/register` → 201 pending;
  `GET /api/zones` → city derivation.
- Live (with the bypass token — now available): verify → 200 `{token, user_id}`; `getCaptain(own id)`
  → 200 approved; `getCaptain(other id)` → 403 (ownership); `documents/completeness` → 200.
- Manual: fresh phone → (valid code) 404 → wizard → 201 → re-verify mints pending token → documents →
  status; the approved bypass captain → tabs.

## 9. Open dependencies

1. ~~Onboarding auth deadlock~~ — **RESOLVED 2026-06-10** (BACKEND_ISSUES.md #6); built and verified.
2. ~~MockSms fixed OTP code + test phone~~ — **PROVIDED**: bypass captain `9647000000098` / `16001600`.
3. **City display name** — zones carry `city_id` but no city name; generic label until a public
   cities endpoint exists (backend offered a small additive PR). Single-city today makes this moot.
