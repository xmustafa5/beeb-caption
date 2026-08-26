# Captain App — Area 2: Activate Today — Design

> Spec for the second build area of the Beep Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-10. Grounded in the Captain App PRD (§3.3 Activate Today), the backend handoff
> (`docs/frontend-summary.md` → Captain App / Daily Activation Gate), the live OpenAPI spec, and
> live probes against `https://beeb.madebyhaithem.com` (2026-06-10, test captain `9647000000098`).
> Builds on Area 1 (auth + AuthGate; an approved captain now lands in the tabs).

## 1. Goal

An **approved** captain, on opening the app each day, sees today's activation state on the
Home/Drive tab:

- **Not activated** → an "Activate Today" card showing the daily fee (2,000 IQD) and an Activate CTA.
  Tapping charges the captain wallet. On success the captain is activated for the day.
- **Insufficient funds (402)** → an inline top-up sheet (preset chips + custom amount) credits the
  wallet, then **auto-retries** the activation.
- **Activated** → an "Activated for today" ready state (the Area 3 online toggle will slot in here later).

Daily activation is the gate for going online (Area 3), so it is the captain's first daily action.

## 2. Scope

**In scope**
- `services/activation.ts`: read today's activation; activate (charge).
- `hooks/use-activation.ts`: query + activate mutation.
- Rework `app/(tabs)/index.tsx` from the placeholder stub into the captain daily home (activation states).
- `components/captain/top-up-sheet.tsx`: inline top-up (preset chips + custom) reusing `services/wallet.ts`.
- EN + AR i18n under `captain.activate.*`; RTL-aware.

**Out of scope (later areas / tasks)**
- Online toggle + location streaming + WS (Area 3) — only a placeholder slot on the activated state.
- Full wallet screen / payment-methods / transaction ledger (not ported to captain; the inline sheet
  is intentionally minimal — cash/MockGateway credit only).
- Admin fee waiver (admin surface).
- Earnings (Area 6).

## 3. Backend contract (verified live 2026-06-10)

Captain Bearer token (from Area 1). Identity from the token `sub`.

| Endpoint | Behavior |
|---|---|
| `GET /api/captain/activation/today` | → `200 { activated: boolean, activation: CaptainDailyActivation \| null }`. `activated:false` → show the CTA. **403** if captain not approved; **404** unknown captain. |
| `POST /api/captain/activation/today` (empty body `{}`) | → **201 `CaptainDailyActivation`** (`status:"paid"`, `collected_at` set) on success. **402** `{ "error": "payment required: Insufficient wallet balance" }` when balance < fee (row recorded `status:"failed"` with `charge_error`). **Idempotent** — re-tapping the same day returns the same row (still 201). 403 not approved. |
| `GET /api/me/wallet` | → `200 { balance_iqd, ... }` (auto-provisions; `owner_type:"captain"`). Reused via `services/wallet.ts` `getWallet()`. |
| `POST /api/me/wallet/topup {amount_iqd, payment_method_id?}` | → `Transaction`. Without a method → cash/admin credit (MockGateway). `amount_iqd <= 0` → 400. Reused via `services/wallet.ts` `topUp(amountIqd)`. |

**CaptainDailyActivation** (key fields): `id, captain_id, date (YYYY-MM-DD), fee_amount_iqd (integer IQD), status ("pending"|"paid"|"waived"|"failed"), collected_at?, charge_error?, waived_by?, waived_reason?, created_at`.

**Verified live (test captain `9647000000098`, balance 0):** `GET activation/today` → `{activated:false, activation:null}`; `POST activation/today` → **402** `{"error":"payment required: Insufficient wallet balance"}`. The 402 recovery (top up → retry) is the central path.

> Fee source: the response's `activation.fee_amount_iqd` is authoritative when present. Before the
> first activation exists (`activation:null`), display a **2,000 IQD** default (the backend default,
> `activation.daily_fee_iqd`). The app does not hardcode the charge — it just displays the notice;
> the backend computes the actual charge.

## 4. Architecture — units

### 4.1 `services/activation.ts` (new)

```ts
export type ActivationStatus = 'pending' | 'paid' | 'waived' | 'failed'

export interface Activation {
  id: string
  date: string            // YYYY-MM-DD
  feeAmountIqd: number
  status: ActivationStatus
  collectedAt?: string | null
  chargeError?: string | null
}

export interface TodayActivation {
  activated: boolean
  activation: Activation | null
}

getTodayActivation(): Promise<TodayActivation>   // GET /api/captain/activation/today
activateToday(): Promise<Activation>             // POST /api/captain/activation/today {} → 201 (throws on 402)
```

- A `toActivation(BackendCaptainDailyActivation)` snake→camel mapper. `getTodayActivation` maps the
  nested `activation` (or null). `activateToday` posts an empty body and maps the 201 row; a 402
  propagates as an axios error for the caller to catch (the screen detects 402 via `parseApiError`).
- The default fee constant (`DEFAULT_DAILY_FEE_IQD = 2000`) lives here for the `activation:null` display case.

### 4.2 `hooks/use-activation.ts` (new)

```ts
useActivation(): {
  query: UseQueryResult<TodayActivation>     // ['captain','activation','today'], enabled when token
  activate: UseMutationResult<Activation>     // calls activateToday; on success invalidates the query
}
```

- `enabled: !!token` (token from the auth store). `activate` mutation `onSuccess` →
  `queryClient.invalidateQueries(['captain','activation','today'])` so the home re-renders activated.
- The screen owns 402 handling (the mutation surfaces the error to the screen, which opens the sheet).

### 4.3 `app/(tabs)/index.tsx` (rework the stub)

The captain daily home. States:
- **Loading** → centered spinner.
- **`activated === true`** → "Activated for today" ready card: a checkmark, "You're activated"
  copy, the paid fee, and a **placeholder region** where Area 3's online toggle will mount (a
  commented anchor + a muted "Online toggle coming next" line — NOT a fake toggle).
- **`activated === false`** → **Activate Today card**: hero/card visual language (matching Area 1),
  the fee notice (`activation?.feeAmountIqd ?? DEFAULT_DAILY_FEE_IQD`, IQD-formatted), an **Activate**
  button (loading while the mutation runs). 
  - On mutation **402** → the card switches to an "insufficient funds" state: shows the wallet balance
    (fetched via `getWallet`) + the fee, and a **"Top up & activate"** button that opens the top-up sheet.
  - On other errors → inline `FormError` with the mapped message; CTA stays.
- A pull-to-refresh / refetch on focus keeps the state fresh (Baghdad-midnight rollover).

### 4.4 `components/captain/top-up-sheet.tsx` (new)

A modal sheet (RN `Modal` or a bottom sheet built from existing primitives — keep it simple, a
slide-up `View` over a dim backdrop):
- Receives the current `balanceIqd` and `feeIqd` as **props** (the home screen already fetched the
  balance via `getWallet` when it hit the 402, so the sheet does not re-fetch). Exposes
  `visible`, `onClose`, and `onToppedUp()` props.
- **Preset chips:** 2,000 / 5,000 / 10,000 IQD (2,000 = one day) + a **custom amount** `Input`
  (numeric). One selected at a time; custom overrides chips.
- **Confirm** → `topUp(amountIqd)` (existing `services/wallet.ts`). On success: close the sheet and
  invoke an `onToppedUp()` callback (the home screen then re-runs `activate`). On 400 (bad amount) →
  inline error in the sheet. Loading state on the button.
- RTL-aware (chips row, amount field).

### 4.5 i18n — `captain.activate.*` (EN + AR)

Keys: `title`, `subtitle`, `feeNotice` (e.g. "Daily activation fee: {{fee}}"), `activateCta`,
`activatedTitle`, `activatedBody`, `onlineComingSoon`, `insufficientTitle`, `insufficientBody`
(with balance), `topUpAndActivate`, `topUpTitle`, `amountLabel`, `customAmount`, `confirmTopUp`,
`activateFailed`, `topUpFailed`, `amountInvalid`. Preset chip labels are formatted amounts (no key needed).

## 5. Data flow

```
Home (tab index) mount → useActivation().query → getTodayActivation
  ├ activated:true  → "Activated for today" ready state (online-toggle placeholder)
  └ activated:false → Activate Today card (fee notice)
        → tap Activate → activate mutation → activateToday()
            ├ 201 paid → invalidate ['captain','activation','today'] → activated state
            └ 402 (parseApiError.status===402) → insufficient-funds card (show getWallet balance)
                  → tap "Top up & activate" → TopUpSheet
                       → choose amount → topUp(amountIqd)
                          ├ success → onToppedUp() → activate mutation retry → 201 → activated
                          └ 400 → inline "amountInvalid" in sheet
```

## 6. Error handling

Via `parseApiError` (401 has empty body — branch on status).

| Status | Context | UX |
|---|---|---|
| 402 | activate | Switch to insufficient-funds card + top-up sheet (NOT a generic error). |
| 400 | top-up | Inline "enter a valid amount" in the sheet. |
| 403 | activate/get | Defensive: "Your account isn't approved" (shouldn't occur — AuthGate gates approved-only). |
| 401 | any | Interceptor clears session → AuthGate routes to login. |
| 429 / network | any | `common.rateLimited` / `common.networkError`. |

## 7. i18n / RTL

Arabic-primary. Invoke the `react-native-rtl-positioning` skill for the new layouts (the card,
the top-up sheet chips row, the amount field). Reuse `flexDirection: isRTL ? 'row-reverse' : 'row'`
and physical-edge ternaries; no `marginStart`/`marginEnd`. IQD via `lib/format-currency`,
tabular-nums for amounts.

## 8. Verification (no unit-test runner)

Test captain: `9647000000098` / `16001600` (approved, 0 balance, not activated today).

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live: `GET activation/today` → `{activated:false}`; `POST activation/today` → **402** (confirmed);
  `POST /api/me/wallet/topup {amount_iqd:5000}` → succeeds; retry `POST activation/today` → **201 paid**;
  `GET activation/today` → `{activated:true}`; re-`POST` → same row (idempotent).
- Manual (Expo Go): home shows Activate card → tap → 402 → top-up sheet → confirm → auto-retry →
  activated state. (Note: once the test captain is activated for the day, the CTA won't reappear until
  the Baghdad-midnight rollover or a backend reset — verify the 402→top-up→activated sequence in one pass.)

## 9. Open dependencies / notes

1. **Reuse `services/wallet.ts`** as-is (`getWallet`, `topUp`) — confirmed working with a captain token.
2. **Online toggle placeholder** on the activated state is intentional — Area 3 replaces it; do not
   build a non-functional toggle.
3. **One-shot live test:** activating the test captain consumes the "not activated" state for the
   Baghdad day; plan the live verification as a single 402→top-up→activated pass. The backend offered
   to reset activation / pre-set a sub-fee balance if a re-run is needed.
