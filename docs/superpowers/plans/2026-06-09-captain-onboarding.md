# Captain Onboarding & Auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A captain can log in via OTP and be routed by backend status (approved → tabs, unregistered → registration wizard, pending/rejected/blocked → status screen), with a real captain JWT persisted in SecureStore.

**Architecture:** Rework the rider auth store into a `Captain` shape (token + captain + persisted `pendingCaptainId`). New `captain-auth`, `captain-documents`, and `cities` services wrap the backend. A 3-step paged registration wizard (`app/(auth)/register/*`) creates the captain then uploads 5 documents via presigned PUT. Status screens detect approval by re-running OTP verify. `AuthGate` routes on `(token, status, pendingCaptainId)`.

**Tech Stack:** Expo Router 6, TanStack Query, RHF + zod, Zustand + SecureStore, expo-image-picker, axios (existing `lib/api.ts`).

> **No unit-test runner in this project** (per `CLAUDE.md`). The verification gate for every task is `npx tsc --noEmit` + `npx expo lint` (both clean), plus targeted live `curl` probes against `https://beeb.madebyhaithem.com` where an endpoint is exercisable. This overrides the writing-plans TDD default per the skill-priority rule (user instructions win).

> **Backend dependency:** the onboarding auth deadlock (BACKEND_ISSUES.md #6) means document upload + status hydration are built to the *assumed* fix (verify issues a token for a pending captain). They are not live-verifiable until the MockSms OTP code is provided. Build to the contract; mark those probes as deferred.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `store/auth-store.ts` | Captain session: token, captain, pendingCaptainId | Modify (rework) |
| `store/registration-store.ts` | Ephemeral cross-step registration draft | Create |
| `lib/captain-mappers.ts` | snake_case backend ↔ camelCase Captain; gender m/f ↔ male/female; phone normalize | Create |
| `services/captain-auth.ts` | OTP verify (status branch), register, getCaptain | Create |
| `services/captain-documents.ts` | presign → PUT → confirm; completeness; DOC_TYPES | Create |
| `services/cities.ts` | derive cities from zones | Create |
| `hooks/use-captain.ts` | query captain profile, sync to store | Create (replaces use-me) |
| `hooks/use-me.ts` | rider profile hook | Delete |
| `app/(auth)/phone.tsx` | phone entry → OTP | Modify (copy + route) |
| `app/(auth)/otp.tsx` | OTP verify → branch on VerifyResult | Modify |
| `app/(auth)/register/_layout.tsx` | register stack | Create |
| `app/(auth)/register/personal.tsx` | step 1: name/name_ar/gender/national_id | Create |
| `app/(auth)/register/vehicle.tsx` | step 2: vehicle + city → register | Create |
| `app/(auth)/register/documents.tsx` | step 3: 5-doc upload checklist | Create |
| `app/(auth)/status.tsx` | pending/rejected/blocked | Create |
| `app/(auth)/profile-setup.tsx` | rider profile setup | Delete |
| `app/_layout.tsx` | AuthGate routing | Modify |
| `components/captain/document-row.tsx` | one doc row with states | Create |
| `components/captain/wizard-progress.tsx` | "Step N of 3" dots | Create |
| `i18n/en.json`, `i18n/ar.json` | captain.* strings | Modify |
| `services/auth.ts` | rider auth | Leave (unused by captain; cleanup later) |

---

## Task 1: Captain mappers (`lib/captain-mappers.ts`)

**Files:**
- Create: `lib/captain-mappers.ts`

- [ ] **Step 1: Create the mappers module**

```ts
// lib/captain-mappers.ts
// Pure conversion helpers between the backend Captain JSON (snake_case, gender m/f)
// and the app's Captain shape (camelCase, gender male/female). No network here.

export type CaptainStatus = 'pending' | 'approved' | 'rejected' | 'blocked'
export type CaptainGender = 'male' | 'female'

export interface Captain {
  id: string
  phone: string
  name: string
  nameAr: string
  gender: CaptainGender
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

export interface BackendCaptain {
  id: string
  phone: string
  name: string
  name_ar: string
  gender: string
  car_make: string
  car_model: string
  car_color?: string | null
  car_plate: string
  city_id: string
  national_id?: string | null
  status: string
  rejection_reason?: string | null
  rejection_comment?: string | null
  blocked_reason?: string | null
  avg_rating: number
  trip_count: number
}

export function toCaptainGender(g: string): CaptainGender {
  return g === 'f' ? 'female' : 'male'
}

export function toBackendGender(g: CaptainGender): 'm' | 'f' {
  return g === 'female' ? 'f' : 'm'
}

export function toCaptain(b: BackendCaptain): Captain {
  return {
    id: b.id,
    phone: b.phone,
    name: b.name,
    nameAr: b.name_ar,
    gender: toCaptainGender(b.gender),
    carMake: b.car_make,
    carModel: b.car_model,
    carColor: b.car_color ?? null,
    carPlate: b.car_plate,
    cityId: b.city_id,
    nationalId: b.national_id ?? null,
    status: (b.status as CaptainStatus) ?? 'pending',
    rejectionReason: b.rejection_reason ?? null,
    rejectionComment: b.rejection_comment ?? null,
    blockedReason: b.blocked_reason ?? null,
    avgRating: b.avg_rating ?? 0,
    tripCount: b.trip_count ?? 0,
  }
}

// The phone input stores the local Iraqi format `07XXXXXXXXX`; the backend wants
// international digits `9647XXXXXXXXX`. Identical to the rider normalizer.
export function normalizePhone(local: string): string {
  const digits = local.replace(/\D/g, '')
  if (digits.startsWith('964')) return digits
  return `964${digits.replace(/^0+/, '')}`
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: no errors referencing `lib/captain-mappers.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/captain-mappers.ts
git commit -m "feat(captain): add Captain type + backend mappers"
```

---

## Task 2: Rework the auth store (`store/auth-store.ts`)

**Files:**
- Modify: `store/auth-store.ts` (full rewrite)

- [ ] **Step 1: Rewrite the store to the Captain shape**

```ts
// store/auth-store.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as SecureStore from 'expo-secure-store'
import type { Captain } from '@/lib/captain-mappers'

interface AuthStore {
  token: string | null
  captain: Captain | null
  // Set after a successful register so a pending captain who quits the app
  // resumes on the status screen instead of the phone entry.
  pendingCaptainId: string | null
  hasHydrated: boolean
  setSession: (token: string, captain: Captain) => void
  setPending: (captainId: string) => void
  updateCaptain: (patch: Partial<Captain>) => void
  clear: () => void
  setHasHydrated: (v: boolean) => void
}

const secureStorage = {
  getItem: async (name: string) => {
    const v = await SecureStore.getItemAsync(name)
    return v ?? null
  },
  setItem: async (name: string, value: string) => {
    await SecureStore.setItemAsync(name, value)
  },
  removeItem: async (name: string) => {
    await SecureStore.deleteItemAsync(name)
  },
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      captain: null,
      pendingCaptainId: null,
      hasHydrated: false,
      setSession: (token, captain) => set({ token, captain, pendingCaptainId: null }),
      setPending: (captainId) => set({ pendingCaptainId: captainId, token: null }),
      updateCaptain: (patch) =>
        set((s) => ({ captain: s.captain ? { ...s.captain, ...patch } : s.captain })),
      clear: () => set({ token: null, captain: null, pendingCaptainId: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'beeb.auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        token: s.token,
        captain: s.captain,
        pendingCaptainId: s.pendingCaptainId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    },
  ),
)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that still import the old `User`/`setSession(token,user)` shape (`services/auth.ts`, `app/(auth)/otp.tsx`, `app/(auth)/profile-setup.tsx`, `hooks/use-me.ts`, `app/(tabs)/profile.tsx` if it reads `user`). These are fixed/deleted in later tasks. Note the list.

- [ ] **Step 3: Commit**

```bash
git add store/auth-store.ts
git commit -m "feat(captain): rework auth store to Captain session shape"
```

---

## Task 3: Captain auth service (`services/captain-auth.ts`)

**Files:**
- Create: `services/captain-auth.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-auth.ts
import { api } from '@/lib/api'
import { parseApiError } from '@/lib/api'
import {
  toCaptain,
  toBackendGender,
  normalizePhone,
  type BackendCaptain,
  type Captain,
  type CaptainGender,
} from '@/lib/captain-mappers'

export type VerifyResult =
  | { kind: 'authed'; token: string; captain: Captain }
  | { kind: 'pending' } // 403 — registered but not approved
  | { kind: 'unregistered' } // 404 — no captain for this phone

export interface RegisterCaptainInput {
  phone: string // local 07… or already-normalized; normalized here
  name: string
  nameAr: string
  gender: CaptainGender
  carMake: string
  carModel: string
  carColor?: string | null
  carPlate: string
  cityId: string
  nationalId?: string | null
}

/** Send the OTP code to the phone (same endpoint as riders). */
export async function requestOtp(phone: string): Promise<{ ok: true }> {
  await api.post('/api/auth/otp/send', { phone: normalizePhone(phone) })
  return { ok: true }
}

/**
 * Verify a captain OTP. Branches on backend status:
 *  200 → approved: token + hydrated captain
 *  403 → registered but not approved (pending/rejected/blocked)
 *  404 → no captain for this phone (route to registration)
 * 401 (wrong/expired code) and 429 are thrown for the caller to surface.
 */
export async function verifyCaptainOtp(phone: string, code: string): Promise<VerifyResult> {
  try {
    const { data } = await api.post<{ token: string; user_id: string }>(
      '/api/auth/captain/otp/verify',
      { phone: normalizePhone(phone), code },
    )
    const captain = await getCaptain(data.user_id, data.token)
    return { kind: 'authed', token: data.token, captain }
  } catch (err) {
    const info = parseApiError(err)
    if (info.status === 403) return { kind: 'pending' }
    if (info.status === 404) return { kind: 'unregistered' }
    throw err // 401 wrong code, 429, network — caller handles
  }
}

/**
 * Read a captain by id. Pass an explicit token during the verify round-trip
 * (the request interceptor only fills Authorization when it's absent).
 */
export async function getCaptain(id: string, token?: string): Promise<Captain> {
  const { data } = await api.get<BackendCaptain>(`/api/captains/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return toCaptain(data)
}

/** Self-register (public). Returns the pending Captain (no token in the response). */
export async function registerCaptain(input: RegisterCaptainInput): Promise<Captain> {
  const body = {
    phone: normalizePhone(input.phone),
    name: input.name,
    name_ar: input.nameAr,
    gender: toBackendGender(input.gender),
    car_make: input.carMake,
    car_model: input.carModel,
    car_plate: input.carPlate,
    city_id: input.cityId,
    ...(input.carColor ? { car_color: input.carColor } : {}),
    ...(input.nationalId ? { national_id: input.nationalId } : {}),
  }
  const { data } = await api.post<BackendCaptain>('/api/captains/register', body)
  return toCaptain(data)
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: no new errors in `services/captain-auth.ts`.

- [ ] **Step 3: Live probe (register happy-path, no token needed)**

Run:
```bash
CITY=$(curl -s https://beeb.madebyhaithem.com/api/zones | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["city_id"])')
P="964750$(printf '%07d' $((RANDOM%9000000+1000000)))"; PL="PLAN-$((RANDOM%9000))"
curl -s -w "\nHTTP %{http_code}\n" -X POST https://beeb.madebyhaithem.com/api/captains/register \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$P\",\"name\":\"Plan Test\",\"name_ar\":\"اختبار\",\"gender\":\"m\",\"car_make\":\"Kia\",\"car_model\":\"Rio\",\"car_plate\":\"$PL\",\"city_id\":\"$CITY\"}"
```
Expected: `HTTP 201` with a Captain body whose `status` is `pending`. (Confirms the request shape the service builds.)

- [ ] **Step 4: Commit**

```bash
git add services/captain-auth.ts
git commit -m "feat(captain): captain OTP verify + register service"
```

---

## Task 4: Captain documents service (`services/captain-documents.ts`)

**Files:**
- Create: `services/captain-documents.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-documents.ts
import { api } from '@/lib/api'

export const DOC_TYPES = [
  'driver_license',
  'car_registration',
  'captain_selfie',
  'national_id_front',
  'national_id_back',
] as const

export type DocType = (typeof DOC_TYPES)[number]

export interface Completeness {
  complete: boolean
  uploaded: DocType[]
  missing: DocType[]
}

/**
 * Upload one document via the presigned-PUT flow:
 *   1. POST .../documents/upload-url { doc_type } → { upload_url, object_key }
 *   2. PUT the raw image bytes to upload_url (NO auth header — presigned)
 *   3. POST .../documents { doc_type, object_key } (bearer) → confirm/upsert
 * Throws if any step fails so the UI can show "failed · retry".
 */
export async function uploadDocument(
  captainId: string,
  docType: DocType,
  localUri: string,
): Promise<void> {
  const { data: slot } = await api.post<{
    upload_url: string
    object_key: string
    expires_in: number
  }>(`/api/captains/${captainId}/documents/upload-url`, { doc_type: docType })

  const file = await fetch(localUri)
  const blob = await file.blob()
  const put = await fetch(slot.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'image/jpeg' },
    body: blob,
  })
  if (!put.ok) throw new Error(`document upload failed: ${put.status}`)

  await api.post(`/api/captains/${captainId}/documents`, {
    doc_type: docType,
    object_key: slot.object_key,
  })
}

/** Which of the 5 required docs are present. */
export async function getCompleteness(captainId: string): Promise<Completeness> {
  const { data } = await api.get<Completeness>(
    `/api/captains/${captainId}/documents/completeness`,
  )
  return data
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: no new errors. (Live verification deferred — needs a captain token; tracked in BACKEND_ISSUES.md #6.)

- [ ] **Step 3: Commit**

```bash
git add services/captain-documents.ts
git commit -m "feat(captain): document presigned-upload service"
```

---

## Task 5: Cities service (`services/cities.ts`)

**Files:**
- Create: `services/cities.ts`

- [ ] **Step 1: Create the service**

```ts
// services/cities.ts
import { api } from '@/lib/api'

export interface City {
  id: string
}

interface BackendZone {
  city_id: string
}

/**
 * The backend exposes no public cities list; derive the distinct cities from the
 * public zones endpoint (each zone carries a city_id). Today there is one Baghdad
 * city. Returns distinct city ids in first-seen order.
 */
export async function getCities(): Promise<City[]> {
  const { data } = await api.get<BackendZone[]>('/api/zones')
  const seen = new Set<string>()
  const out: City[] = []
  for (const z of data ?? []) {
    if (z.city_id && !seen.has(z.city_id)) {
      seen.add(z.city_id)
      out.push({ id: z.city_id })
    }
  }
  return out
}
```

- [ ] **Step 2: Typecheck + lint + live probe**

Run: `npx tsc --noEmit && npx expo lint`
Run: `curl -s https://beeb.madebyhaithem.com/api/zones | python3 -c 'import sys,json;d=json.load(sys.stdin);print(sorted({z["city_id"] for z in d}))'`
Expected: clean typecheck; the curl prints exactly one city id.

- [ ] **Step 3: Commit**

```bash
git add services/cities.ts
git commit -m "feat(captain): derive cities from zones for registration"
```

---

## Task 6: Registration draft store (`store/registration-store.ts`)

**Files:**
- Create: `store/registration-store.ts`

- [ ] **Step 1: Create the ephemeral draft store**

```ts
// store/registration-store.ts
import { create } from 'zustand'
import type { CaptainGender } from '@/lib/captain-mappers'

// In-memory only (NOT persisted) — holds the cross-step registration draft so
// each wizard screen stays focused. Cleared on submit or abandon.
interface RegistrationDraft {
  phone: string
  name: string
  nameAr: string
  gender: CaptainGender
  nationalId: string
  carMake: string
  carModel: string
  carColor: string
  carPlate: string
  cityId: string
  setPhone: (phone: string) => void
  setStep1: (v: Pick<RegistrationDraft, 'name' | 'nameAr' | 'gender' | 'nationalId'>) => void
  setStep2: (v: Pick<RegistrationDraft, 'carMake' | 'carModel' | 'carColor' | 'carPlate' | 'cityId'>) => void
  reset: () => void
}

const EMPTY = {
  phone: '',
  name: '',
  nameAr: '',
  gender: 'male' as CaptainGender,
  nationalId: '',
  carMake: '',
  carModel: '',
  carColor: '',
  carPlate: '',
  cityId: '',
}

export const useRegistrationStore = create<RegistrationDraft>((set) => ({
  ...EMPTY,
  setPhone: (phone) => set({ phone }),
  setStep1: (v) => set(v),
  setStep2: (v) => set(v),
  reset: () => set(EMPTY),
}))
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add store/registration-store.ts
git commit -m "feat(captain): ephemeral registration draft store"
```

---

## Task 7: i18n strings (`i18n/en.json`, `i18n/ar.json`)

**Files:**
- Modify: `i18n/en.json` (replace the `captain` object)
- Modify: `i18n/ar.json` (add the matching `captain` object)

- [ ] **Step 1: Replace the `captain` object in `i18n/en.json`**

Replace the existing `"captain": { ... }` block (the 4-line scaffold) with:

```json
  "captain": {
    "appName": "Beeb Captain",
    "welcomeTitle": "Drive with Beeb",
    "welcomeSubtitle": "Accept trips, go online, and earn — on your schedule.",
    "startCta": "Start as a Captain",
    "auth": {
      "phoneTitle": "Captain sign in",
      "phoneSubtitle": "We'll send a one-time code to your phone.",
      "otpWrong": "That code is wrong or has expired. Try again.",
      "otpVerifyFailed": "Couldn't verify the code. Please try again."
    },
    "register": {
      "step": "Step {{current}} of {{total}}",
      "personalTitle": "Your details",
      "vehicleTitle": "Your vehicle",
      "documentsTitle": "Your documents",
      "name": "Full name (English)",
      "nameInvalid": "Enter your full name",
      "nameAr": "Full name (Arabic)",
      "nameArInvalid": "Enter your name in Arabic",
      "gender": "Gender",
      "genderMale": "Male",
      "genderFemale": "Female",
      "genderNote": "Gender can't be changed after registration.",
      "nationalId": "National ID (optional)",
      "carMake": "Make",
      "carMakeInvalid": "Enter the car make",
      "carModel": "Model",
      "carModelInvalid": "Enter the car model",
      "carColor": "Color (optional)",
      "carPlate": "Plate number",
      "carPlateInvalid": "Enter the plate number",
      "city": "City",
      "next": "Next",
      "submit": "Submit registration",
      "duplicate": "This phone or plate is already registered.",
      "registerFailed": "Couldn't submit your registration. Please try again.",
      "citiesFailed": "Couldn't load cities. Please try again."
    },
    "documents": {
      "subtitle": "{{uploaded}} of {{total}} uploaded",
      "tapToAdd": "Tap to add",
      "uploading": "Uploading…",
      "uploaded": "Uploaded · tap to replace",
      "failed": "Upload failed · tap to retry",
      "submit": "Submit registration",
      "submitRemaining": "Submit ({{remaining}} left)",
      "sourceTitle": "Add document",
      "takePhoto": "Take photo",
      "chooseLibrary": "Choose from library",
      "permission": "Camera and photo access is needed to upload documents.",
      "driver_license": "Driver license",
      "car_registration": "Car registration",
      "captain_selfie": "Selfie with car",
      "national_id_front": "National ID — front",
      "national_id_back": "National ID — back"
    },
    "status": {
      "pendingTitle": "Waiting for approval",
      "pendingBody": "We're reviewing your registration. This usually takes up to 24 hours.",
      "submittedAgo": "Submitted {{ago}}",
      "checkStatus": "Check status",
      "stillPending": "Still under review. We'll notify you when you're approved.",
      "rejectedTitle": "Registration not approved",
      "rejectedBody": "Unfortunately your registration was not approved.",
      "blockedTitle": "Account blocked",
      "blockedBody": "Your account has been blocked. Please contact support.",
      "contactSupport": "Contact support",
      "reason": "Reason: {{reason}}",
      "reason_documents_invalid": "Documents were invalid or unclear.",
      "reason_vehicle_unfit": "The vehicle did not meet requirements.",
      "reason_identity_mismatch": "Identity did not match the documents.",
      "reason_existing_account": "An account already exists.",
      "reason_other": "Please contact support for details."
    },
    "scaffoldHome": "Captain app scaffold — features coming next.",
    "scaffoldTrips": "Your trips & earnings will appear here.",
    "scaffoldProfile": "Captain"
  }
```

- [ ] **Step 2: Add the matching `captain` object to `i18n/ar.json`**

Add (or replace) the `"captain"` key in `i18n/ar.json` with the Arabic translations:

```json
  "captain": {
    "appName": "بيب كابتن",
    "welcomeTitle": "قُد مع بيب",
    "welcomeSubtitle": "اقبل الرحلات، اتصل بالإنترنت، واكسب — حسب جدولك.",
    "startCta": "ابدأ ككابتن",
    "auth": {
      "phoneTitle": "تسجيل دخول الكابتن",
      "phoneSubtitle": "سنرسل رمزًا لمرة واحدة إلى هاتفك.",
      "otpWrong": "الرمز خاطئ أو منتهي الصلاحية. حاول مرة أخرى.",
      "otpVerifyFailed": "تعذّر التحقق من الرمز. حاول مرة أخرى."
    },
    "register": {
      "step": "الخطوة {{current}} من {{total}}",
      "personalTitle": "بياناتك",
      "vehicleTitle": "مركبتك",
      "documentsTitle": "مستنداتك",
      "name": "الاسم الكامل (إنجليزي)",
      "nameInvalid": "أدخل اسمك الكامل",
      "nameAr": "الاسم الكامل (عربي)",
      "nameArInvalid": "أدخل اسمك بالعربية",
      "gender": "الجنس",
      "genderMale": "ذكر",
      "genderFemale": "أنثى",
      "genderNote": "لا يمكن تغيير الجنس بعد التسجيل.",
      "nationalId": "رقم الهوية (اختياري)",
      "carMake": "الصنع",
      "carMakeInvalid": "أدخل صنع السيارة",
      "carModel": "الطراز",
      "carModelInvalid": "أدخل طراز السيارة",
      "carColor": "اللون (اختياري)",
      "carPlate": "رقم اللوحة",
      "carPlateInvalid": "أدخل رقم اللوحة",
      "city": "المدينة",
      "next": "التالي",
      "submit": "إرسال التسجيل",
      "duplicate": "رقم الهاتف أو اللوحة مسجّل مسبقًا.",
      "registerFailed": "تعذّر إرسال تسجيلك. حاول مرة أخرى.",
      "citiesFailed": "تعذّر تحميل المدن. حاول مرة أخرى."
    },
    "documents": {
      "subtitle": "تم رفع {{uploaded}} من {{total}}",
      "tapToAdd": "اضغط للإضافة",
      "uploading": "جارٍ الرفع…",
      "uploaded": "تم الرفع · اضغط للاستبدال",
      "failed": "فشل الرفع · اضغط لإعادة المحاولة",
      "submit": "إرسال التسجيل",
      "submitRemaining": "إرسال (متبقٍ {{remaining}})",
      "sourceTitle": "إضافة مستند",
      "takePhoto": "التقاط صورة",
      "chooseLibrary": "اختيار من المعرض",
      "permission": "نحتاج إذن الكاميرا والصور لرفع المستندات.",
      "driver_license": "رخصة القيادة",
      "car_registration": "تسجيل السيارة",
      "captain_selfie": "صورة ذاتية مع السيارة",
      "national_id_front": "الهوية الوطنية — الأمام",
      "national_id_back": "الهوية الوطنية — الخلف"
    },
    "status": {
      "pendingTitle": "في انتظار الموافقة",
      "pendingBody": "نقوم بمراجعة تسجيلك. تستغرق المراجعة عادةً حتى 24 ساعة.",
      "submittedAgo": "أُرسل {{ago}}",
      "checkStatus": "التحقق من الحالة",
      "stillPending": "لا تزال قيد المراجعة. سنخطرك عند الموافقة.",
      "rejectedTitle": "لم تتم الموافقة على التسجيل",
      "rejectedBody": "للأسف لم تتم الموافقة على تسجيلك.",
      "blockedTitle": "الحساب محظور",
      "blockedBody": "تم حظر حسابك. يرجى التواصل مع الدعم.",
      "contactSupport": "تواصل مع الدعم",
      "reason": "السبب: {{reason}}",
      "reason_documents_invalid": "المستندات غير صالحة أو غير واضحة.",
      "reason_vehicle_unfit": "المركبة لا تستوفي المتطلبات.",
      "reason_identity_mismatch": "الهوية لا تطابق المستندات.",
      "reason_existing_account": "يوجد حساب مسبقًا.",
      "reason_other": "يرجى التواصل مع الدعم للمزيد."
    },
    "scaffoldHome": "هيكل تطبيق الكابتن — الميزات قادمة.",
    "scaffoldTrips": "ستظهر رحلاتك وأرباحك هنا.",
    "scaffoldProfile": "الكابتن"
  }
```

- [ ] **Step 3: Validate JSON + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"`
Run: `npx tsc --noEmit`
Expected: `json ok`; no new TS errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for onboarding"
```

---

## Task 8: Wizard progress component (`components/captain/wizard-progress.tsx`)

**Files:**
- Create: `components/captain/wizard-progress.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/captain/wizard-progress.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

const isRTL = I18nManager.isRTL

interface WizardProgressProps {
  current: number // 1-based
  total: number
}

export function WizardProgress({ current, total }: WizardProgressProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const dots = Array.from({ length: total })

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.xs + 2 }}>
        {dots.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              backgroundColor: i < current ? colors.onTint : 'rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </View>
      <Text style={{ ...Typography['caption-sm'], color: colors.onTint, opacity: 0.85, fontStyle: 'normal' }}>
        {t('captain.register.step', { current, total })}
      </Text>
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/wizard-progress.tsx
git commit -m "feat(captain): wizard progress indicator"
```

---

## Task 9: Document row component (`components/captain/document-row.tsx`)

**Files:**
- Create: `components/captain/document-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/captain/document-row.tsx
import { View, Text, TouchableOpacity, ActivityIndicator, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { DocType } from '@/services/captain-documents'

const isRTL = I18nManager.isRTL

export type DocState = 'empty' | 'uploading' | 'uploaded' | 'failed'

const ICONS: Record<DocType, React.ComponentProps<typeof Icon>['name']> = {
  driver_license: 'card-outline',
  car_registration: 'document-text-outline',
  captain_selfie: 'camera-outline',
  national_id_front: 'id-card-outline',
  national_id_back: 'id-card-outline',
}

interface DocumentRowProps {
  docType: DocType
  state: DocState
  onPress: () => void
}

export function DocumentRow({ docType, state, onPress }: DocumentRowProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()

  const statusColor =
    state === 'uploaded' ? colors.success
    : state === 'failed' ? colors.destructive
    : state === 'uploading' ? colors.tint
    : colors.subtle

  const statusText =
    state === 'uploaded' ? t('captain.documents.uploaded')
    : state === 'failed' ? t('captain.documents.failed')
    : state === 'uploading' ? t('captain.documents.uploading')
    : t('captain.documents.tapToAdd')

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={state === 'uploading'}
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: state === 'empty' ? colors.border : statusColor,
        borderStyle: state === 'empty' ? 'dashed' : 'solid',
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: Spacing.md + 2,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={ICONS[docType]} size={20} color={colors.subtle} />
      </View>
      <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
          {t(`captain.documents.${docType}`)}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: statusColor, fontStyle: 'normal' }}>
          {statusText}
        </Text>
      </View>
      {state === 'uploading' ? (
        <ActivityIndicator color={colors.tint} />
      ) : (
        <Icon
          name={
            state === 'uploaded' ? 'checkmark-circle'
            : state === 'failed' ? 'refresh'
            : 'add'
          }
          size={22}
          color={statusColor}
        />
      )}
    </TouchableOpacity>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean. If `card-outline`/`id-card-outline`/`refresh`/`add` aren't valid Ionicons names, substitute the nearest valid name (the `Icon` component is Ionicons-backed); confirm by checking `components/ui/icon.tsx` accepts the name type.

- [ ] **Step 3: Commit**

```bash
git add components/captain/document-row.tsx
git commit -m "feat(captain): document row with upload states"
```

---

## Task 10: Captain profile hook (`hooks/use-captain.ts`), delete `use-me.ts`

**Files:**
- Create: `hooks/use-captain.ts`
- Delete: `hooks/use-me.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-captain.ts
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getCaptain } from '@/services/captain-auth'
import { useAuthStore } from '@/store/auth-store'

/**
 * Fetches the captain profile and syncs it into the persisted store. Runs only
 * when authenticated (token + captain id present). Refreshes on app open.
 */
export function useCaptain() {
  const token = useAuthStore((s) => s.token)
  const id = useAuthStore((s) => s.captain?.id)

  const query = useQuery({
    queryKey: ['captain', id],
    queryFn: () => getCaptain(id as string),
    enabled: !!token && !!id,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (query.data) useAuthStore.getState().updateCaptain(query.data)
  }, [query.data])

  return query
}
```

- [ ] **Step 2: Delete the rider hook**

```bash
git rm hooks/use-me.ts
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: any error now points to a former `useMe` importer (e.g. `app/(tabs)/index.tsx`). Note it for Task 14 (tabs cleanup).

- [ ] **Step 4: Commit**

```bash
git add hooks/use-captain.ts
git commit -m "feat(captain): captain profile hook; drop rider use-me"
```

---

## Task 11: Phone + OTP screens (`app/(auth)/phone.tsx`, `app/(auth)/otp.tsx`)

**Files:**
- Modify: `app/(auth)/phone.tsx` (swap copy + service import)
- Modify: `app/(auth)/otp.tsx` (branch on VerifyResult)

- [ ] **Step 1: Update `app/(auth)/phone.tsx`**

Change the import on line 18 from:
```ts
import { requestOtp } from '@/services/auth'
```
to:
```ts
import { requestOtp } from '@/services/captain-auth'
```

Change the two hero strings (the `t('auth.phoneTitle')` / `t('auth.phoneSubtitle')` used in the title block, lines ~137 and ~148) to the captain copy:
```tsx
{t('captain.auth.phoneTitle')}
```
```tsx
{t('captain.auth.phoneSubtitle')}
```
Leave the `Input` label (`t('auth.phoneTitle')`) and the helper row (`t('auth.phoneSubtitle')`) as-is OR switch them too — keep the form field label as `t('auth.phoneTitle')` to avoid touching the field; switch only the hero title/subtitle. The OTP send + navigation to `/(auth)/otp` is unchanged.

- [ ] **Step 2: Update `app/(auth)/otp.tsx` imports + success handler**

Change the imports (lines 18 + 20):
```ts
import { requestOtp, verifyCaptainOtp } from '@/services/captain-auth'
import { useRegistrationStore } from '@/store/registration-store'
```
(remove the `import { verifyOtp } from '@/services/auth'`; keep `parseApiError, apiErrorKey` from `@/lib/api`; keep `useAuthStore`.)

Replace the `mutation` (the `useMutation` block that called `verifyOtp`) with:
```tsx
  const mutation = useMutation({
    mutationFn: (c: string) => verifyCaptainOtp(phone, c),
    onMutate: () => setApiError(null),
    onSuccess: (res) => {
      if (res.kind === 'authed') {
        useAuthStore.getState().setSession(res.token, res.captain)
        router.replace('/(tabs)')
      } else if (res.kind === 'pending') {
        // Registered but not approved — verify gave no id; status screen will
        // re-verify to detect approval.
        router.replace('/(auth)/status')
      } else {
        // unregistered — seed the registration draft phone and start the wizard.
        useRegistrationStore.getState().setPhone(phone)
        router.replace('/(auth)/register/personal')
      }
    },
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork
        ? 'common.networkError'
        : info.status === 401
          ? 'captain.auth.otpWrong'
          : info.status === 429
            ? 'common.rateLimited'
            : 'captain.auth.otpVerifyFailed'
      setApiError(t(key))
    },
  })
```

Change the `resendMutation`'s `mutationFn` to use the captain `requestOtp` (already imported). Optionally swap the hero `t('auth.otpTitle')`/`t('auth.otpSubtitle', {phone})` — leave as `auth.*` (generic OTP copy is fine and already translated).

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: `phone.tsx`/`otp.tsx` clean. Remaining errors only in not-yet-created routes (`register/*`, `status`) which are referenced by string paths (Expo Router) — string `router.replace` paths don't fail typecheck, so these should be clean once the files exist (Tasks 12–13). If Expo Router typed-routes flags missing routes, proceed — they resolve when the route files land.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/phone.tsx app/\(auth\)/otp.tsx
git commit -m "feat(captain): captain OTP flow with status branching"
```

---

## Task 12: Registration wizard (`app/(auth)/register/*`)

**Files:**
- Create: `app/(auth)/register/_layout.tsx`
- Create: `app/(auth)/register/personal.tsx`
- Create: `app/(auth)/register/vehicle.tsx`
- Create: `app/(auth)/register/documents.tsx`

- [ ] **Step 1: Create `app/(auth)/register/_layout.tsx`**

```tsx
// app/(auth)/register/_layout.tsx
import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'

export default function RegisterLayout() {
  const colors = useThemeColors()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  )
}
```

- [ ] **Step 2: Create `app/(auth)/register/personal.tsx`**

```tsx
// app/(auth)/register/personal.tsx
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { useRegistrationStore } from '@/store/registration-store'
import type { CaptainGender } from '@/lib/captain-mappers'

const isRTL = I18nManager.isRTL

const schema = z.object({
  name: z.string().min(2, 'captain.register.nameInvalid'),
  nameAr: z.string().min(2, 'captain.register.nameArInvalid'),
  gender: z.enum(['male', 'female']),
  nationalId: z.string().optional(),
})
type Form = z.infer<typeof schema>

export default function PersonalStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()

  const { control, handleSubmit, watch, setValue, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: draft.name, nameAr: draft.nameAr, gender: draft.gender, nationalId: draft.nationalId },
    mode: 'onChange',
  })
  const gender = watch('gender')

  const onNext = (v: Form) => {
    draft.setStep1({ name: v.name, nameAr: v.nameAr, gender: v.gender, nationalId: v.nationalId ?? '' })
    router.push('/(auth)/register/vehicle')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}
      >
        <View
          style={{
            backgroundColor: colors.tint,
            paddingTop: insets.top + Spacing.lg,
            paddingHorizontal: Spacing.xl,
            paddingBottom: Spacing.xl * 1.6,
            borderBottomLeftRadius: 36,
            borderBottomRightRadius: 36,
            borderCurve: 'continuous',
            gap: Spacing.lg,
          }}
        >
          <WizardProgress current={1} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.onTint, fontSize: 28, lineHeight: 34 }}>
            {t('captain.register.personalTitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, marginTop: Spacing.lg, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', padding: Spacing.xl, gap: Spacing.lg, boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)' }}>
            <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.name')} value={value} onChangeText={onChange} autoCapitalize="words"
                error={errors.name ? t(errors.name.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="nameAr" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.nameAr')} value={value} onChangeText={onChange}
                error={errors.nameAr ? t(errors.nameAr.message ?? '') : undefined} />
            )} />
            <View style={{ gap: Spacing.sm }}>
              <Text style={{ ...Typography['input-label'], color: colors.subtle }}>{t('captain.register.gender')}</Text>
              <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
                {(['male', 'female'] as CaptainGender[]).map((g) => {
                  const active = gender === g
                  return (
                    <TouchableOpacity key={g} onPress={() => setValue('gender', g, { shouldValidate: true })} activeOpacity={0.85}
                      style={{ flex: 1, paddingVertical: Spacing.md + 2, borderRadius: 14, borderCurve: 'continuous',
                        backgroundColor: active ? colors.tint : colors.surface, borderWidth: 1.5,
                        borderColor: active ? colors.tint : colors.border, alignItems: 'center', gap: 4 }}>
                      <Icon name={g === 'male' ? 'male' : 'female'} size={20} color={active ? colors.onTint : colors.subtle} />
                      <Text style={{ ...Typography['caption-sm'], color: active ? colors.onTint : colors.text, fontStyle: 'normal',
                        fontFamily: active ? 'Poppins_600SemiBold' : undefined }}>
                        {t(g === 'male' ? 'captain.register.genderMale' : 'captain.register.genderFemale')}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>{t('captain.register.genderNote')}</Text>
            </View>
            <Controller control={control} name="nationalId" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.nationalId')} value={value ?? ''} onChangeText={onChange} keyboardType="number-pad" />
            )} />
          </View>

          <View style={{ flex: 1 }} />
          <Button label={t('captain.register.next')} disabled={!isValid} onPress={handleSubmit(onNext)}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
```

- [ ] **Step 3: Create `app/(auth)/register/vehicle.tsx`**

```tsx
// app/(auth)/register/vehicle.tsx
import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { useRegistrationStore } from '@/store/registration-store'
import { registerCaptain } from '@/services/captain-auth'
import { getCities } from '@/services/cities'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

const schema = z.object({
  carMake: z.string().min(1, 'captain.register.carMakeInvalid'),
  carModel: z.string().min(1, 'captain.register.carModelInvalid'),
  carColor: z.string().optional(),
  carPlate: z.string().min(2, 'captain.register.carPlateInvalid'),
})
type Form = z.infer<typeof schema>

export default function VehicleStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const draft = useRegistrationStore()
  const [apiError, setApiError] = useState<string | null>(null)

  const cities = useQuery({ queryKey: ['cities'], queryFn: getCities, staleTime: 1000 * 60 * 10 })

  const { control, handleSubmit, formState: { errors, isValid } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { carMake: draft.carMake, carModel: draft.carModel, carColor: draft.carColor, carPlate: draft.carPlate },
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: (v: Form) => {
      const cityId = draft.cityId || cities.data?.[0]?.id || ''
      draft.setStep2({ carMake: v.carMake, carModel: v.carModel, carColor: v.carColor ?? '', carPlate: v.carPlate, cityId })
      return registerCaptain({
        phone: draft.phone,
        name: draft.name,
        nameAr: draft.nameAr,
        gender: draft.gender,
        nationalId: draft.nationalId || null,
        carMake: v.carMake,
        carModel: v.carModel,
        carColor: v.carColor || null,
        carPlate: v.carPlate,
        cityId,
      })
    },
    onMutate: () => setApiError(null),
    onSuccess: (captain) => {
      useAuthStore.getState().setPending(captain.id)
      router.replace('/(auth)/register/documents')
    },
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork ? 'common.networkError'
        : info.status === 409 ? 'captain.register.duplicate'
        : info.status === 429 ? 'common.rateLimited'
        : 'captain.register.registerFailed'
      setApiError(t(key))
    },
  })

  const noCity = cities.isError
  const submitDisabled = !isValid || mutation.isPending || cities.isLoading || noCity

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}>
        <View style={{ backgroundColor: colors.tint, paddingTop: insets.top + Spacing.lg, paddingHorizontal: Spacing.xl,
          paddingBottom: Spacing.xl * 1.6, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, borderCurve: 'continuous', gap: Spacing.lg }}>
          <WizardProgress current={2} total={3} />
          <Text style={{ ...Typography['heading-lg'], color: colors.onTint, fontSize: 28, lineHeight: 34 }}>
            {t('captain.register.vehicleTitle')}
          </Text>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, marginTop: Spacing.lg, gap: Spacing.lg }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 22, borderCurve: 'continuous', padding: Spacing.xl, gap: Spacing.lg, boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)' }}>
            <Controller control={control} name="carMake" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carMake')} value={value} onChangeText={onChange}
                error={errors.carMake ? t(errors.carMake.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="carModel" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carModel')} value={value} onChangeText={onChange}
                error={errors.carModel ? t(errors.carModel.message ?? '') : undefined} />
            )} />
            <Controller control={control} name="carColor" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carColor')} value={value ?? ''} onChangeText={onChange} />
            )} />
            <Controller control={control} name="carPlate" render={({ field: { onChange, value } }) => (
              <Input label={t('captain.register.carPlate')} value={value} onChangeText={onChange} autoCapitalize="characters"
                error={errors.carPlate ? t(errors.carPlate.message ?? '') : undefined} />
            )} />
          </View>

          <View style={{ flex: 1 }} />
          {noCity && <FormError message={t('captain.register.citiesFailed')} />}
          <FormError message={apiError} />
          <Button label={t('captain.register.submit')} loading={mutation.isPending} disabled={submitDisabled}
            onPress={handleSubmit((v) => mutation.mutate(v))}
            trailing={<Icon name={isRTL ? 'arrow-back' : 'arrow-forward'} size={18} color={colors.onTint} />} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
```

- [ ] **Step 4: Create `app/(auth)/register/documents.tsx`**

```tsx
// app/(auth)/register/documents.tsx
import { useState } from 'react'
import { View, Text, ScrollView, ActionSheetIOS, Alert, Platform, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { WizardProgress } from '@/components/captain/wizard-progress'
import { DocumentRow, type DocState } from '@/components/captain/document-row'
import { DOC_TYPES, uploadDocument, type DocType } from '@/services/captain-documents'
import { useAuthStore } from '@/store/auth-store'

type StateMap = Record<DocType, DocState>
const INITIAL: StateMap = {
  driver_license: 'empty', car_registration: 'empty', captain_selfie: 'empty',
  national_id_front: 'empty', national_id_back: 'empty',
}

export default function DocumentsStep() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const captainId = useAuthStore((s) => s.pendingCaptainId)
  const [states, setStates] = useState<StateMap>(INITIAL)

  const uploadedCount = DOC_TYPES.filter((d) => states[d] === 'uploaded').length
  const allDone = uploadedCount === DOC_TYPES.length

  async function pickAndUpload(docType: DocType, fromCamera: boolean) {
    if (!captainId) return
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('captain.documents.permission')); return }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'] })
    if (result.canceled || !result.assets?.[0]) return

    const uri = result.assets[0].uri
    setStates((s) => ({ ...s, [docType]: 'uploading' }))
    try {
      await uploadDocument(captainId, docType, uri)
      setStates((s) => ({ ...s, [docType]: 'uploaded' }))
    } catch {
      setStates((s) => ({ ...s, [docType]: 'failed' }))
    }
  }

  function chooseSource(docType: DocType) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [t('captain.documents.takePhoto'), t('captain.documents.chooseLibrary'), t('common.cancel')], cancelButtonIndex: 2, title: t('captain.documents.sourceTitle') },
        (i) => { if (i === 0) pickAndUpload(docType, true); else if (i === 1) pickAndUpload(docType, false) },
      )
    } else {
      Alert.alert(t('captain.documents.sourceTitle'), undefined, [
        { text: t('captain.documents.takePhoto'), onPress: () => pickAndUpload(docType, true) },
        { text: t('captain.documents.chooseLibrary'), onPress: () => pickAndUpload(docType, false) },
        { text: t('common.cancel'), style: 'cancel' },
      ])
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + Spacing.xl }}>
        <View style={{ backgroundColor: colors.tint, paddingTop: insets.top + Spacing.lg, paddingHorizontal: Spacing.xl,
          paddingBottom: Spacing.xl * 1.6, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, borderCurve: 'continuous', gap: Spacing.lg }}>
          <WizardProgress current={3} total={3} />
          <View style={{ gap: Spacing.xs, alignItems: I18nManager.isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-lg'], color: colors.onTint, fontSize: 28, lineHeight: 34 }}>
              {t('captain.register.documentsTitle')}
            </Text>
            <Text style={{ ...Typography['caption-sm'], color: colors.onTint, opacity: 0.85, fontStyle: 'normal' }}>
              {t('captain.documents.subtitle', { uploaded: uploadedCount, total: DOC_TYPES.length })}
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: Spacing.xl, marginTop: Spacing.lg, gap: Spacing.sm }}>
          {DOC_TYPES.map((d) => (
            <DocumentRow key={d} docType={d} state={states[d]} onPress={() => chooseSource(d)} />
          ))}
          <View style={{ flex: 1, minHeight: Spacing.lg }} />
          <Button
            label={allDone ? t('captain.documents.submit') : t('captain.documents.submitRemaining', { remaining: DOC_TYPES.length - uploadedCount })}
            disabled={!allDone}
            onPress={() => router.replace('/(auth)/status')}
          />
        </View>
      </ScrollView>
    </View>
  )
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean. If `ImagePicker.launchImageLibraryAsync` `mediaTypes` type errors (SDK 54 may want `ImagePicker.MediaTypeOptions.Images` or the string-array form), use whichever the installed `expo-image-picker` types accept — check `node_modules/expo-image-picker` types if needed.

- [ ] **Step 6: Commit**

```bash
git add app/\(auth\)/register
git commit -m "feat(captain): 3-step registration wizard"
```

---

## Task 13: Status screen (`app/(auth)/status.tsx`)

**Files:**
- Create: `app/(auth)/status.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// app/(auth)/status.tsx
import { useState, useCallback } from 'react'
import { View, Text, ScrollView, AppState, Linking, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useAuthStore } from '@/store/auth-store'
import { getCaptain } from '@/services/captain-auth'

const isRTL = I18nManager.isRTL
// KNOWN FOLLOW-UP: the real captain-support WhatsApp number is an ops fact not yet
// provided. Ship this env-driven with a documented fallback; the executor should
// surface it to the user, not silently keep the placeholder.
const SUPPORT_URL =
  process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_URL ?? 'https://wa.me/9647500000000'

export default function StatusScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const token = useAuthStore((s) => s.token)
  const captainId = useAuthStore((s) => s.captain?.id ?? s.pendingCaptainId)
  const status = useAuthStore((s) => s.captain?.status) ?? 'pending'
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // If we hold a token + id (deadlock resolved path), re-read the captain on
  // focus to detect approval. Without a token there is nothing to poll — the
  // captain re-authenticates via the phone flow when they expect approval.
  const refresh = useCallback(async () => {
    if (!token || !captainId) { setNote(t('captain.status.stillPending')); return }
    setChecking(true)
    try {
      const captain = await getCaptain(captainId)
      useAuthStore.getState().updateCaptain(captain)
      if (captain.status !== 'approved') setNote(t('captain.status.stillPending'))
      // AuthGate routes to (tabs) automatically once status === 'approved' + token present.
    } finally {
      setChecking(false)
    }
  }, [token, captainId, t])

  useFocusEffect(useCallback(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh() })
    refresh()
    return () => sub.remove()
  }, [refresh]))

  const isRejected = status === 'rejected'
  const isBlocked = status === 'blocked'
  const title = isBlocked ? t('captain.status.blockedTitle') : isRejected ? t('captain.status.rejectedTitle') : t('captain.status.pendingTitle')
  const body = isBlocked ? t('captain.status.blockedBody') : isRejected ? t('captain.status.rejectedBody') : t('captain.status.pendingBody')
  const icon = isBlocked ? 'lock-closed' : isRejected ? 'close-circle' : 'hourglass'
  const tone = isBlocked || isRejected ? colors.destructive : colors.tint
  const reasonKey = useAuthStore.getState().captain?.rejectionReason
  const reasonText = reasonKey ? t(`captain.status.reason_${reasonKey}`, { defaultValue: t('captain.status.reason_other') }) : null

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.xl }}>
        <View style={{ alignItems: 'center', gap: Spacing.lg }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: tone + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={44} color={tone} />
          </View>
          <Text style={{ ...Typography['heading-lg'], color: colors.text, textAlign: 'center' }}>{title}</Text>
          <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{body}</Text>
          {isRejected && reasonText && (
            <Text style={{ ...Typography['caption-sm'], color: colors.destructive, textAlign: 'center', fontStyle: 'normal' }}>
              {t('captain.status.reason', { reason: reasonText })}
            </Text>
          )}
          {!isRejected && !isBlocked && note && (
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{note}</Text>
          )}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ gap: Spacing.md }}>
          {!isRejected && !isBlocked && (
            <Button label={t('captain.status.checkStatus')} loading={checking} onPress={refresh} />
          )}
          <Button
            label={t('captain.status.contactSupport')}
            variant="secondary"
            onPress={() => Linking.openURL(SUPPORT_URL)}
            leading={<Icon name="logo-whatsapp" size={18} color={colors.text} />}
          />
          {isBlocked && (
            <Button label={t('profile.logout')} variant="ghost" onPress={() => useAuthStore.getState().clear()} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean. If `useFocusEffect` isn't exported from `expo-router` in this version, import it from `@react-navigation/native` instead (already a dep). If the Ionicons names (`hourglass`, `lock-closed`, `close-circle`, `logo-whatsapp`) error, swap to valid ones.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/status.tsx
git commit -m "feat(captain): approval pending / rejected / blocked status screen"
```

---

## Task 14: AuthGate rework + delete profile-setup + fix tab references

**Files:**
- Modify: `app/_layout.tsx` (AuthGate + register the new `(auth)` routes are file-based, no Stack.Screen change needed beyond `(auth)`/`(tabs)`)
- Delete: `app/(auth)/profile-setup.tsx`
- Modify: `app/(tabs)/index.tsx`, `app/(tabs)/profile.tsx` (anything reading the old `user` shape)

- [ ] **Step 1: Rework `AuthGate` in `app/_layout.tsx`**

Replace the `AuthGate` function (the block starting `function AuthGate(` through its closing brace) with:

```tsx
function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const captain = useAuthStore((s) => s.captain)
  const pendingCaptainId = useAuthStore((s) => s.pendingCaptainId)
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)'
    const isApproved = !!token && captain?.status === 'approved'
    const isPendingLike =
      (!!token && !!captain && captain.status !== 'approved') || !!pendingCaptainId

    if (isApproved) {
      if (inAuthGroup) router.replace('/(tabs)')
    } else if (isPendingLike) {
      // Pending/rejected/blocked or mid-onboarding → status screen, unless the
      // captain is actively in the registration wizard.
      const path = segments.join('/')
      const inRegister = path.startsWith('(auth)/register')
      if (!inRegister && path !== '(auth)/status') router.replace('/(auth)/status')
    } else if (!token) {
      if (!inAuthGroup) router.replace('/(auth)/phone')
    }
  }, [token, captain, pendingCaptainId, segments])

  return <>{children}</>
}
```

(The root `<Stack>` already declares `(auth)` and `(tabs)` — no change needed there.)

- [ ] **Step 2: Delete the rider profile-setup screen**

```bash
git rm app/\(auth\)/profile-setup.tsx
```

- [ ] **Step 3: Typecheck and fix tab references**

Run: `npx tsc --noEmit`
For every remaining error (former `useMe`/`user` reads in `app/(tabs)/index.tsx` and `app/(tabs)/profile.tsx`):
- Replace `import { useMe } from '@/hooks/use-me'` + `useMe()` with `import { useCaptain } from '@/hooks/use-captain'` + `useCaptain()`.
- Replace `useAuthStore((s) => s.user)` reads with `useAuthStore((s) => s.captain)` and adjust field access (`captain?.name`, `captain?.phone`). For the logout button keep `useAuthStore.getState().clear()`.
- If a tab references rider-only fields that don't exist on `Captain` (e.g. `email`, `photoUri`), remove that UI for now (it's a placeholder tab; full captain tabs come in later areas).

Re-run until `npx tsc --noEmit` is clean.

- [ ] **Step 4: Lint**

Run: `npx expo lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(captain): AuthGate routes on captain status; drop rider profile-setup"
```

---

## Task 15: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint across the whole app**

Run: `npx tsc --noEmit && npx expo lint`
Expected: both clean, no warnings introduced by captain code.

- [ ] **Step 2: Live probe — register happy-path is still green**

Run:
```bash
CITY=$(curl -s https://beeb.madebyhaithem.com/api/zones | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["city_id"])')
P="964750$(printf '%07d' $((RANDOM%9000000+1000000)))"; PL="VER-$((RANDOM%9000))"
curl -s -w "\nHTTP %{http_code}\n" -X POST https://beeb.madebyhaithem.com/api/captains/register \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$P\",\"name\":\"Ver\",\"name_ar\":\"تحقق\",\"gender\":\"f\",\"car_make\":\"Hyundai\",\"car_model\":\"Accent\",\"car_plate\":\"$PL\",\"city_id\":\"$CITY\"}"
```
Expected: `HTTP 201`, `status:"pending"`.

- [ ] **Step 3: Manual smoke (Expo Go) — note results, don't block on backend-gated steps**

Start: `npx expo start` and on a device/simulator confirm:
- App opens to the captain phone screen (no rider profile-setup).
- Entering a fresh phone → OTP → (with a real code) → 404 path → registration wizard renders all 3 steps; doc rows show empty/upload states.
- The Approval-Pending screen renders with Check status + Contact support.
- **Deferred (needs MockSms code):** the verify→token→tabs path and the document PUT round-trip — record as pending in BACKEND_ISSUES.md #6, do not block the commit.

- [ ] **Step 4: Final area commit (if any smoke fixes were needed)**

```bash
git add -A
git commit -m "chore(captain): onboarding area verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **Deadlock paths (documents, status hydration with token) are not live-verifiable** until the MockSms OTP code lands — they are built to the contract and gated behind `tsc`/`lint`. Don't treat their absence of a live test as a failure.
- **Ionicons names** in `document-row.tsx` / `status.tsx` are best-guesses; if `npx tsc`/lint or runtime warns, swap to a valid Ionicons name (the `Icon` type will tell you).
- **`expo-image-picker` `mediaTypes`** API shifted across SDKs — use the form the installed types accept.
- **`useFocusEffect`** import source may be `@react-navigation/native` rather than `expo-router` in this version — fall back if needed.
- Rider `services/auth.ts` is intentionally left in place (unused by captain screens) — a later cleanup task removes rider-only code once no captain area depends on it.
