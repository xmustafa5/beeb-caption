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

### 3.1 KNOWN BACKEND GAP — onboarding auth deadlock (BACKEND_ISSUES.md #6)

Document upload + `GET /api/captains/{id}` require a **bearer token**, but `register` returns
**no token** and captain `verify` returns **403 (no token) for a non-approved captain**. As the
contract reads, a pending captain cannot obtain a credential to upload their documents — a deadlock.

**This spec is built assuming the backend resolves it as: `verify` returns a token for a `pending`
captain too** (reserving 403 for `rejected`/`blocked`). That token authorizes document upload and
self-read while pending. **If the backend instead returns a token in the `register` 201 body**, the
only change is *where* the token is read (register response vs verify). The code isolates token
acquisition behind the `captain-auth` service so either resolution is a one-function change.

Until confirmed (staging MockSms OTP code is unknown to us), document upload + status hydration are
**not live-verifiable**; they are built to the contract and unit-checked via `tsc`/`lint`.

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

**Approval detection.** There are two ways onto this screen, and they differ in what credential we hold:

- **Via registration** (404 → wizard → register → `setPending(id)`): we have the captain **id** but
  no token. If the assumed backend fix lands (a pending captain can get a token via re-verify),
  "Check status" runs OTP send→verify; a 200 yields a token, then `getCaptain(id)` confirms
  `approved` → `setSession` → tabs. Until then, "Check status" re-verify still distinguishes
  pending (403) from approved (200) by status alone.
- **Via login** (403 from verify on an already-registered phone): verify returns **neither token nor
  id** on 403, so we have only the `phone`. The screen shows the await-approval state; "Check status"
  re-runs verify (200 when approved → `setSession`; still-403 → stay pending).

So detection is uniformly **re-run captain verify** (on app foreground + the "Check status" button),
which needs a fresh OTP code from the captain — never a tight timer (respects the 10/phone/10min OTP
limit; approval is a ~24h human action). `getCaptain(id)` is used only once a token exists and we
hold an id (the registration path post-fix). FCM push will later wake this screen automatically.

Detection is **on-foreground + manual button**, not a tight timer (respects the OTP rate limit;
approval is a ~24h human action).

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

## 5. Data flow

```
Phone → requestOtp → OTP screen → verifyCaptainOtp
  ├ authed       → setSession(token, captain) → AuthGate → (tabs)
  ├ pending      → setPending? (no — pending here means already-registered, no id) → status (token? getCaptain : "await push")
  └ unregistered → draft.phone = phone → register/personal → register/vehicle
                     → registerCaptain → setPending(id) → register/documents
                       → 5× uploadDocument → status (pending)
                         → [on approval] getCaptain → status approved → setSession → (tabs)
```

Note: the `pending` (403) branch from verify means the captain is registered but unapproved, and
verify returns **neither token nor id** on 403 — so on that path we hold only the `phone`. The status
screen shows the await-approval state and re-runs verify to detect approval (see §4.6). Once the
assumed backend fix lands (token on pending verify), the 200 path also yields `user_id`, and we
hydrate via `getCaptain(user_id)`.

## 6. Error handling

All via `parseApiError` / status branching (401 has an empty body — never read its message).

| Status | Context | UX |
|---|---|---|
| 401 | OTP verify | "Wrong or expired code" inline; stay on OTP. |
| 403 | OTP verify | Route to status (pending/blocked). |
| 404 | OTP verify | Route to registration. |
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

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (no token needed): `POST /api/auth/otp/send` 200; captain verify on an unknown phone+code
  path; `POST /api/captains/register` happy-path → 201 pending; `GET /api/zones` → city derivation.
- Live (needs MockSms code from backend — deferred): verify→token→`getCaptain`→tabs; document
  upload round-trip; completeness. Tracked in BACKEND_ISSUES.md #6.
- Manual: fresh phone → 404 → wizard → 201 → documents → status; approved test phone → tabs.

## 9. Open dependencies (carried from the roadmap)

1. **Onboarding auth deadlock** — BACKEND_ISSUES.md #6; built to the assumed fix.
2. **MockSms fixed OTP code + captain test phone** — needed to live-verify the token paths.
3. **City display name** — zones carry `city_id` but no city name; generic label until a cities
   endpoint exists. Single-city today makes this moot in practice.
