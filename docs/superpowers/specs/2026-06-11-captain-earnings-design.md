# Captain App — Area 6: Earnings — Design

> Spec for the sixth and final build area of the Beeb Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-11. Grounded in the Captain App PRD (§3.7 Earnings), the backend handoff
> (`docs/frontend-summary.md` → Captain App / Earnings), the live OpenAPI spec, and live probes
> against `https://beeb.madebyhaithem.com` (verified with real earnings data 2026-06-11).

## 1. Goal

The captain sees their earnings for a selected period (Today / Week / Month) — gross minus the daily
activation fee equals net, plus the trip count — and a trip-history list, on a dedicated **Earnings
tab** (repurposed from the unused Notifications tab stub).

## 2. Scope

**In scope**
- `services/earnings.ts`: getEarnings + getEarningsHistory + types/mappers.
- `hooks/use-earnings.ts`: summary + history queries for a period.
- Rework `app/(tabs)/notifications.tsx` → the Earnings screen (period control + summary + history).
- `components/captain/earnings-summary.tsx` (gross/fee/net card) + `components/captain/period-tabs.tsx`
  (Today/Week/Month segmented control).
- Re-label tab 2 (`notifications`) → "Earnings".
- EN + AR i18n under `captain.earnings.*`; RTL-aware.

**Out of scope (future)**
- Earnings analytics / trend graphs (Horizon 2 per PRD).
- Payout mechanism (cash settlement is ops-side, out of the app per PRD §5.2).
- Tapping a history row → trip detail (the trips are completed; no live screen needed; v1 list is read-only).

## 3. Backend contract (verified live 2026-06-11)

Captain Bearer token. The captain reads **their own** id (from the JWT `user_id`, stored as
`captain.id`).

| Endpoint | Behavior (verified) |
|---|---|
| `GET /api/captains/{id}/earnings?period=today\|week\|month` | → `200 { captain_id, gross_iqd, activation_fee_iqd, net_iqd, trip_count, period }`. `net = gross − activation fee`. (Verified: today `{gross:7720, fee:2000, net:5720, trip_count:2}`; week `{gross:11580, net:9580, trip_count:3}`.) |
| `GET /api/captains/{id}/earnings/history?period=today\|week\|month` | → `200 { captain_id, period, items: [{ trip_id, fare_iqd, trip_type ("regular"\|"abriyah"), completed_at }] }`. (Verified: lists the captain's completed trips for the period.) |

All money is integer IQD. `period` is one of `today` / `week` / `month`.

## 4. Architecture — units

### 4.1 `services/earnings.ts` (new)

```ts
export type EarningsPeriod = 'today' | 'week' | 'month'

export interface Earnings {
  grossIqd: number
  activationFeeIqd: number
  netIqd: number
  tripCount: number
  period: EarningsPeriod
}

export interface EarningsHistoryItem {
  tripId: string
  fareIqd: number
  tripType: 'regular' | 'abriyah'
  completedAt: string
}

getEarnings(captainId, period): Promise<Earnings>                 // GET .../earnings?period=
getEarningsHistory(captainId, period): Promise<EarningsHistoryItem[]>  // GET .../earnings/history?period=
```

- snake→camel mappers; `getEarningsHistory` maps `data.items ?? []`.

### 4.2 `hooks/use-earnings.ts` (new)

```ts
useEarnings(period: EarningsPeriod): {
  earnings: Earnings | undefined
  history: EarningsHistoryItem[]
  isLoading: boolean
  isRefetching: boolean
  refetch: () => void
}
```

- Reads `captainId = useAuthStore((s) => s.captain?.id)` and `token`. Two `useQuery`s:
  `['captain','earnings', captainId, period]` and `['captain','earnings','history', captainId, period]`,
  both `enabled: !!token && !!captainId`. `refetch` refetches both. `isLoading`/`isRefetching` reflect
  the summary query (the primary one).

### 4.3 `app/(tabs)/notifications.tsx` → the Earnings screen (rework)

- Local `period` state (default `'today'`).
- **`period-tabs`** segmented control at top (Today / Week / Month) → sets `period`.
- **`earnings-summary`** card for the active period: gross, − activation fee, = net (prominent),
  trip count.
- **Trip-history** section below: a header + a list of rows (each: fare, trip type, completed date).
  Empty → "No completed trips yet."
- Loading → spinner; pull-to-refresh → `refetch()`.

### 4.4 Components (new)

- `components/captain/period-tabs.tsx` — a 3-segment control: `{ value: EarningsPeriod; onChange }`.
  RTL-aware (row reverses). Active segment highlighted (tint).
- `components/captain/earnings-summary.tsx` — `{ earnings: Earnings }` → the gross/fee/net breakdown
  (a card with 3 rows + a net total + trip-count caption). IQD-formatted, tabular-nums. RTL rows.
- History rows: inline in the screen (a small mapped View per item — fare + type + date), or a tiny
  local row component; keep it inline to avoid over-componentizing.

### 4.5 Tab re-label (`components/tab-bar/custom-tab-bar.tsx`)

`TAB_DEFS[2]` is `{ name: 'notifications', icon: 'notifications', labelKey: 'tabs.notifications' }`.
Change to `{ name: 'notifications', icon: 'cash', labelKey: 'captain.earnings.tabLabel' }` (keep the
route file `notifications.tsx`; only icon + label change). If `cash`/`cash-outline` aren't valid
Ionicons, use `wallet`/`wallet-outline`.

### 4.6 i18n — `captain.earnings.*` (EN + AR)

Keys: `tabLabel`, `title`, `today`, `week`, `month`, `gross`, `activationFee`, `net`, `tripCount`
(with `{{count}}`), `history`, `historyEmpty`, `tripRegular`, `tripAbriyah`, `loadFailed`.

## 5. Data flow

```
Earnings tab → period (default 'today') → useEarnings(period)
  → GET /captains/{id}/earnings?period       → earnings-summary (gross − fee = net, trip_count)
  → GET /captains/{id}/earnings/history?period → history list (fare · type · date)
  switch period (period-tabs) → both queries refetch (keyed on period)
  pull-to-refresh → refetch()
```

## 6. Error handling

Via `parseApiError`.

| Case | UX |
|---|---|
| network / 429 | A small "Couldn't load earnings" message + pull-to-refresh to retry. |
| empty history | "No completed trips yet" empty state (not an error). |
| 401 | Interceptor → login. |
| 403 | Shouldn't occur (own id); if it does, the error message covers it. |

## 7. i18n / RTL

Arabic-primary. Invoke the `react-native-rtl-positioning` skill for the period control + summary
rows + history rows (flexDirection ternary, no physical margins). IQD via `lib/format-currency`;
amounts tabular-nums; net rendered prominently.

## 8. Verification (no unit-test runner)

Test captain `9647000000098` / `16001600`, id `a0a0a0a0-…-098` (has completed trips today).

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (**already verified 2026-06-11**): `earnings?period=today` → `{gross:7720, activation_fee:2000,
  net:5720, trip_count:2}`; `?period=week` → `{gross:11580, net:9580, trip_count:3}`;
  `earnings/history?period=today` → items list of the captain's completed trips. All shapes match.
- Manual (Expo Go): Earnings tab → Today shows the summary + history; switch to Week/Month refetches;
  pull-to-refresh works.

## 9. Open dependencies / notes

1. **Captain id** from `useAuthStore().captain?.id` (set at login in Area 1).
2. **No row navigation** — history rows are read-only (completed trips); v1 doesn't link to a detail.
3. **Tab re-label** keeps the route file `notifications.tsx`; only the displayed icon/label change
   (same minimal approach used for the Queue tab in Area 4).
