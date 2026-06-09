# Phase 5a — Rider Wallet (Design)

> Date: 2026-06-07 · Customer (Rider) App · First slice of roadmap Phase 5.
> Backend: all wallet endpoints live (`docs/frontend-summary.md` §Phase 10, verified
> in `docs/openapi.json`). Scheduled trips and multi-stop are deferred to later
> cycles (Phase 5b / 5c) — out of scope here.

## Goal

Give the rider a complete wallet surface: see balance, top up (cash credit or via a
saved card through MockGateway), manage cards on file, and review the transaction
ledger. Trip fares already auto-charge the wallet server-side on completion; this
spec is the rider-facing view + funding of that wallet.

## Scope

**In:** balance, top-up (preset chips + custom amount; card or cash), payment-method
CRUD (add/set-default/delete), transaction history (infinite scroll).

**Out:** scheduled trips, multi-stop, FCM push, real PSP integration (MockGateway
only — a one-line backend swap later). No CVV/expiry capture (the gateway tokenizes
on card number alone).

## Approach

Mirror the established Phase 1–4 pattern exactly: a single service module owning all
backend shapes, TanStack Query hooks owning caching/mutations with hierarchical keys,
and a dedicated route group for screens. No new architecture, no Zustand slice
(wallet data is server state — TanStack Query is the source of truth).

## File layout

```
services/wallet.ts                  # axios calls + backend->app mappers (only place that knows backend shapes)
hooks/use-wallet.ts                 # useQuery ['wallet']
hooks/use-payment-methods.ts        # useQuery ['payment-methods'] + add/setDefault/delete mutations
hooks/use-transactions.ts           # useInfiniteQuery ['transactions'] (limit/offset)
app/(wallet)/_layout.tsx            # Stack
app/(wallet)/index.tsx              # Wallet home: balance, Top up CTA, recent transactions, link to methods
app/(wallet)/top-up.tsx             # presented modal: preset chips + custom amount + card/cash picker
app/(wallet)/payment-methods.tsx    # list, add (modal form), set-default, delete
i18n/{en,ar}.json                   # new "wallet" section
app/(tabs)/profile.tsx              # replace "Payment method · Cash" stub -> Wallet + Payment methods rows
```

Reuse: `lib/format-currency.ts` (`formatIqd`), `lib/api.ts` (`parseApiError`,
`apiErrorKey`), `components/forms/{input,form-error}`, `components/ui/button`,
`components/ui/settings-row`.

## Backend contract & data mapping

All money is **integer IQD**. Format with `formatIqd`; never parse decimals.

| Concern | Endpoint | Notes |
|---|---|---|
| Balance | `GET /api/me/wallet` | Auto-provisions on first call. → `{ balanceIqd }`. Key `['wallet']`. |
| Top up | `POST /api/me/wallet/topup {amount_iqd, payment_method_id?}` | With method → MockGateway charge then credit; without → cash/admin credit. `amount<=0` → 400; gateway reject → 402. On success invalidate `['wallet']` + `['transactions']`. |
| Cards (list/add) | `GET/POST /api/me/payment-methods` | `POST {card_number, method_type:"card", set_as_default?}`. Response carries **only `masked_last4`**; raw number sent once, `gateway_token` never returned. |
| Set default | `PUT /api/me/payment-methods/{id}/default` | 204. |
| Delete card | `DELETE /api/me/payment-methods/{id}` | 204. |
| Transactions | `GET /api/me/transactions?limit=&offset=` | **Bare array, newest-first** (limit/offset scheme). `useInfiniteQuery`, flatten with `useMemo`. |

**App types (mapped in `services/wallet.ts`):**

- `Wallet { balanceIqd: number }`
- `PaymentMethod { id, methodType, maskedLast4: string | null, isDefault: boolean }`
- `Transaction { id, txType, status, amountIqd, createdAt, tripId?, failureReason? }`
  - `txType ∈ trip_fare | daily_fee | topup | refund | cancellation_penalty`
  - `status ∈ pending | succeeded | failed | reversed`

**Sign convention (display):** `topup`/`refund` → credit (`+`, `colors.success`);
`trip_fare`/`daily_fee`/`cancellation_penalty` → debit (`−`, `colors.destructive`).
`failed`/`reversed` rows render muted with their status label.

## Screens

### Wallet home — `app/(wallet)/index.tsx`
- Tinted balance card (large `balanceIqd`, tabular-nums) + **Top up** CTA → `top-up`.
- **Payment methods** row: shows default `**** last4` or "Add a card" → `payment-methods`.
- **Recent transactions** (infinite scroll): per-row icon by `txType`, label, signed
  amount, date; muted for `failed`/`reversed`. Empty state "No transactions yet".
  Pull-to-refresh invalidates `['wallet']` + `['transactions']`.

### Top up — `app/(wallet)/top-up.tsx` (presentation: modal)
- Preset chips **5,000 / 10,000 / 25,000** + custom amount input (validated > 0).
- **Pay with**: radio list of saved cards + **"Cash / pay later"** (omits
  `payment_method_id`). No cards → only Cash + an "Add a card" shortcut.
- Confirm shows the amount; `loading` during mutation; 400 inline, 402 toast (backend
  message via `parseApiError`).

### Payment methods — `app/(wallet)/payment-methods.tsx`
- Card list (`**** last4`, default badge). Row actions: **Set default** (`PUT`,
  optimistic toggle, revert on error), **Delete** (`DELETE`, confirm Alert).
- **Add card** (modal): RHF + zod — card number (digits, length 13–19), optional
  "set as default". `POST`; only `maskedLast4` returns. No CVV/expiry.

## Navigation wiring
`app/(tabs)/profile.tsx`: remove the `paymentMethod · Cash` stub row; add **Wallet**
(→ `/(wallet)`) and **Payment methods** (→ `/(wallet)/payment-methods`) rows.

## Error handling
Reuse `parseApiError`/`apiErrorKey`: 400 → inline "enter a valid amount"; 402 → toast
with backend message; 429/network → existing localized keys; 403 (no rider wallet) →
defensive generic error (shouldn't occur for rider tokens).

## RTL
All screens RTL-aware per CLAUDE.md: `flexDirection` reversal + physical-edge
ternaries, no `marginStart/End`. Invoke the `react-native-rtl-positioning` skill when
writing layout. Amount rows use `fontVariant: ['tabular-nums']`.

## Testing / verification
- `tsc --noEmit` + eslint clean.
- Confirm wallet/transactions/payment-method endpoints are live (401-gated) via curl,
  as done for prior phases.
- The authenticated happy-path (real top-up, card add) needs a rider token — flag it
  as needs-live-test rather than claiming it works unverified (same posture as the
  Abriyah flow).

## Out-of-scope follow-ups (later cycles)
- Phase 5b: scheduled trips (`/api/rider/scheduled-trips`).
- Phase 5c: multi-stop (`/api/rider/trips/{id}/stops`).
- FCM push (`POST /api/me/fcm-token`) once a custom dev build exists.
- Real PSP swap (backend-side).
