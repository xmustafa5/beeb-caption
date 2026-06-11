# Captain Earnings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The captain sees their earnings (gross − activation fee = net + trip count) for a selected period (Today / Week / Month) plus a trip-history list, on the Earnings tab (repurposed from the Notifications stub).

**Architecture:** `services/earnings.ts` wraps the two earnings endpoints. `hooks/use-earnings.ts` runs the summary + history queries for a period (captain id from the auth store). The Notifications tab is reworked into the Earnings screen: a period segmented control (`period-tabs`) drives the active period; an `earnings-summary` card shows the breakdown; a history list renders below. Tab 2 is re-labeled "Earnings".

**Tech Stack:** Expo Router, TanStack Query, Zustand auth store (`captain.id`), `lib/format-currency`.

> **No unit-test runner** (per `CLAUDE.md`). Gate per task: `npx tsc --noEmit` + `npx expo lint` clean, plus live `curl` where exercisable. Overrides the writing-plans TDD default.

> **Both endpoints verified live 2026-06-11** with the test captain (`9647000000098`/`16001600`, id `a0a0a0a0-0000-4000-8000-000000000098`): `earnings?period=today` → `{gross_iqd:7720, activation_fee_iqd:2000, net_iqd:5720, trip_count:2}`; `earnings/history?period=today` → `{items:[{trip_id, fare_iqd, trip_type, completed_at}, ...]}`.

> **RTL:** UI tasks follow CLAUDE.md RTL rules (flexDirection ternary, module-scope isRTL, no marginStart/marginEnd). Invoke `react-native-rtl-positioning` if available; else fall back to CLAUDE.md + `components/captain/document-row.tsx`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `services/earnings.ts` | getEarnings + getEarningsHistory + types/mappers | Create |
| `hooks/use-earnings.ts` | summary + history queries for a period | Create |
| `components/captain/period-tabs.tsx` | Today/Week/Month segmented control | Create |
| `components/captain/earnings-summary.tsx` | gross/fee/net breakdown card | Create |
| `app/(tabs)/notifications.tsx` | rework stub → Earnings screen | Modify |
| `components/tab-bar/custom-tab-bar.tsx` | re-label tab 2 to Earnings | Modify |
| `i18n/en.json`, `i18n/ar.json` | `captain.earnings.*` strings | Modify |

Reused: `lib/api.ts` (`api`, `parseApiError`), `store/auth-store.ts` (`captain.id`, `token`), `lib/format-currency.ts` (`formatIqd`), `components/ui/*`.

---

## Task 1: Earnings service (`services/earnings.ts`)

**Files:**
- Create: `services/earnings.ts`

- [ ] **Step 1: Create the service**

```ts
// services/earnings.ts
import { api } from '@/lib/api'

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

interface BackendEarnings {
  gross_iqd: number
  activation_fee_iqd: number
  net_iqd: number
  trip_count: number
  period: string
}

interface BackendHistoryItem {
  trip_id: string
  fare_iqd: number
  trip_type: string
  completed_at: string
}

export async function getEarnings(captainId: string, period: EarningsPeriod): Promise<Earnings> {
  const { data } = await api.get<BackendEarnings>(`/api/captains/${captainId}/earnings`, {
    params: { period },
  })
  return {
    grossIqd: data.gross_iqd,
    activationFeeIqd: data.activation_fee_iqd,
    netIqd: data.net_iqd,
    tripCount: data.trip_count,
    period: (data.period as EarningsPeriod) ?? period,
  }
}

export async function getEarningsHistory(
  captainId: string,
  period: EarningsPeriod,
): Promise<EarningsHistoryItem[]> {
  const { data } = await api.get<{ items: BackendHistoryItem[] }>(
    `/api/captains/${captainId}/earnings/history`,
    { params: { period } },
  )
  return (data.items ?? []).map((i) => ({
    tripId: i.trip_id,
    fareIqd: i.fare_iqd,
    tripType: i.trip_type === 'abriyah' ? 'abriyah' : 'regular',
    completedAt: i.completed_at,
  }))
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/earnings"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "services/earnings"` → clean.

- [ ] **Step 3: Live probe (single set)**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
CID=a0a0a0a0-0000-4000-8000-000000000098
curl -s -o /dev/null -w "earnings [%{http_code}]\n" "$BASE/api/captains/$CID/earnings?period=today" -H "Authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "history  [%{http_code}]\n" "$BASE/api/captains/$CID/earnings/history?period=today" -H "Authorization: Bearer $TOKEN"
```
Expected: both `[200]`. (Shapes already confirmed.) If `429`, wait ~60s; the contract is verified.

- [ ] **Step 4: Commit**

```bash
git add services/earnings.ts
git commit -m "feat(captain): earnings service"
```

---

## Task 2: i18n strings (`captain.earnings.*`)

**Files:**
- Modify: `i18n/en.json` (add `earnings` inside `captain`)
- Modify: `i18n/ar.json` (matching block)

- [ ] **Step 1: Add to `i18n/en.json`'s `captain` object** (after `live`; valid JSON):

```json
    "earnings": {
      "tabLabel": "Earnings",
      "title": "Earnings",
      "today": "Today",
      "week": "Week",
      "month": "Month",
      "gross": "Gross",
      "activationFee": "Activation fee",
      "net": "Net",
      "tripCount": "{{count}} trips",
      "history": "Trip history",
      "historyEmpty": "No completed trips yet.",
      "tripRegular": "Regular",
      "tripAbriyah": "Abriyah",
      "loadFailed": "Couldn't load earnings. Pull to refresh."
    },
```

- [ ] **Step 2: Add to `i18n/ar.json`'s `captain` object:**

```json
    "earnings": {
      "tabLabel": "الأرباح",
      "title": "الأرباح",
      "today": "اليوم",
      "week": "الأسبوع",
      "month": "الشهر",
      "gross": "الإجمالي",
      "activationFee": "رسوم التفعيل",
      "net": "الصافي",
      "tripCount": "{{count}} رحلات",
      "history": "سجل الرحلات",
      "historyEmpty": "لا توجد رحلات مكتملة بعد.",
      "tripRegular": "عادي",
      "tripAbriyah": "عبريّة",
      "loadFailed": "تعذّر تحميل الأرباح. اسحب للتحديث."
    },
```

- [ ] **Step 3: Validate + parity + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run: `node -e "const en=require('./i18n/en.json').captain,ar=require('./i18n/ar.json').captain;const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?Object.keys(v).map(kk=>k+'.'+kk):[k]).sort();const ek=keys(en),ak=keys(ar);console.log('en-only:',ek.filter(k=>!ak.includes(k)));console.log('ar-only:',ak.filter(k=>!ek.includes(k)))"` → both EMPTY.
Run: `npx tsc --noEmit 2>&1 | grep -i "i18n"` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for earnings"
```

---

## Task 3: Earnings hook (`hooks/use-earnings.ts`)

**Files:**
- Create: `hooks/use-earnings.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-earnings.ts
import { useQuery } from '@tanstack/react-query'
import { getEarnings, getEarningsHistory, type EarningsPeriod } from '@/services/earnings'
import { useAuthStore } from '@/store/auth-store'

/**
 * Earnings summary + trip history for a period. Reads the captain id from the
 * auth store; both queries are keyed on the period so switching periods refetches.
 */
export function useEarnings(period: EarningsPeriod) {
  const token = useAuthStore((s) => s.token)
  const captainId = useAuthStore((s) => s.captain?.id)
  const enabled = !!token && !!captainId

  const summary = useQuery({
    queryKey: ['captain', 'earnings', captainId, period],
    queryFn: () => getEarnings(captainId as string, period),
    enabled,
    staleTime: 1000 * 60,
  })

  const history = useQuery({
    queryKey: ['captain', 'earnings', 'history', captainId, period],
    queryFn: () => getEarningsHistory(captainId as string, period),
    enabled,
    staleTime: 1000 * 60,
  })

  return {
    earnings: summary.data,
    history: history.data ?? [],
    isLoading: summary.isLoading,
    isRefetching: summary.isRefetching || history.isRefetching,
    refetch: () => { summary.refetch(); history.refetch() },
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "use-earnings"` → EMPTY. (Confirm `useAuthStore` exposes `s.captain?.id` and `s.token` — it does, from Area 1.)
Run: `npx expo lint 2>&1 | grep "use-earnings"` → clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-earnings.ts
git commit -m "feat(captain): use-earnings hook"
```

---

## Task 4: Period tabs (`components/captain/period-tabs.tsx`)

**Files:**
- Create: `components/captain/period-tabs.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back to CLAUDE.md).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/period-tabs.tsx
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import type { EarningsPeriod } from '@/services/earnings'

const isRTL = I18nManager.isRTL
const PERIODS: EarningsPeriod[] = ['today', 'week', 'month']

interface PeriodTabsProps {
  value: EarningsPeriod
  onChange: (period: EarningsPeriod) => void
}

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 4,
        gap: 4,
      }}
    >
      {PERIODS.map((p) => {
        const active = value === p
        return (
          <TouchableOpacity
            key={p}
            onPress={() => onChange(p)}
            activeOpacity={0.85}
            style={{
              flex: 1,
              paddingVertical: Spacing.sm + 2,
              borderRadius: 11,
              borderCurve: 'continuous',
              backgroundColor: active ? colors.card : 'transparent',
              alignItems: 'center',
              ...(active ? { boxShadow: '0px 1px 4px rgba(13, 24, 42, 0.08)' } : {}),
            }}
          >
            <Text
              style={{
                ...Typography['caption-sm'],
                color: active ? colors.text : colors.subtle,
                fontStyle: 'normal',
                fontFamily: active ? 'Poppins_600SemiBold' : undefined,
              }}
            >
              {t(`captain.earnings.${p}`)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "period-tabs"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "period-tabs"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/period-tabs.tsx
git commit -m "feat(captain): earnings period tabs"
```

---

## Task 5: Earnings summary card (`components/captain/earnings-summary.tsx`)

**Files:**
- Create: `components/captain/earnings-summary.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/earnings-summary.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { formatIqd } from '@/lib/format-currency'
import type { Earnings } from '@/services/earnings'

const isRTL = I18nManager.isRTL

interface EarningsSummaryProps {
  earnings: Earnings
}

export function EarningsSummary({ earnings }: EarningsSummaryProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 22,
        borderCurve: 'continuous',
        padding: Spacing.xl,
        gap: Spacing.md,
        boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
      }}
    >
      <Row label={t('captain.earnings.gross')} value={formatIqd(earnings.grossIqd)} colors={colors} />
      <Row label={t('captain.earnings.activationFee')} value={`- ${formatIqd(earnings.activationFeeIqd)}`} colors={colors} muted />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{t('captain.earnings.net')}</Text>
        <Text style={{ ...Typography['heading-md'], color: colors.text, fontVariant: ['tabular-nums'] }}>{formatIqd(earnings.netIqd)}</Text>
      </View>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.earnings.tripCount', { count: earnings.tripCount })}
      </Text>
    </View>
  )
}

interface RowProps {
  label: string
  value: string
  colors: ReturnType<typeof useThemeColors>
  muted?: boolean
}

function Row({ label, value, colors, muted }: RowProps) {
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>{label}</Text>
      <Text style={{ ...Typography['body-md'], color: muted ? colors.subtle : colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "earnings-summary"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "earnings-summary"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/earnings-summary.tsx
git commit -m "feat(captain): earnings summary card"
```

---

## Task 6: Earnings screen + tab re-label

**Files:**
- Modify: `app/(tabs)/notifications.tsx` (full rewrite → Earnings)
- Modify: `components/tab-bar/custom-tab-bar.tsx` (re-label tab 2)

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Re-label tab 2 in `components/tab-bar/custom-tab-bar.tsx`**

In `TAB_DEFS`, change the THIRD entry from:
```tsx
  { name: 'notifications', icon: 'notifications', labelKey: 'tabs.notifications' },
```
to:
```tsx
  { name: 'notifications', icon: 'cash',          labelKey: 'captain.earnings.tabLabel' },
```
(Keep `name: 'notifications'` — the route file stays `notifications.tsx`. If `cash`/`cash-outline` aren't valid Ionicons, use `wallet`/`wallet-outline` and report.)

- [ ] **Step 2: Rewrite `app/(tabs)/notifications.tsx` into the Earnings screen**

Replace the ENTIRE file with:
```tsx
import { useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { PeriodTabs } from '@/components/captain/period-tabs'
import { EarningsSummary } from '@/components/captain/earnings-summary'
import { useEarnings } from '@/hooks/use-earnings'
import { formatIqd } from '@/lib/format-currency'
import type { EarningsPeriod } from '@/services/earnings'

const isRTL = I18nManager.isRTL

export default function EarningsScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const [period, setPeriod] = useState<EarningsPeriod>('today')
  const { earnings, history, isLoading, isRefetching, refetch } = useEarnings(period)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.earnings.title')}
      </Text>

      <PeriodTabs value={period} onChange={setPeriod} />

      {isLoading ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl * 2 }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : earnings ? (
        <EarningsSummary earnings={earnings} />
      ) : (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal' }}>
          {t('captain.earnings.loadFailed')}
        </Text>
      )}

      <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.earnings.history')}
      </Text>

      {history.length === 0 ? (
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.earnings.historyEmpty')}
        </Text>
      ) : (
        history.map((item) => (
          <View
            key={item.tripId}
            style={{
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: colors.card,
              borderRadius: 14,
              borderCurve: 'continuous',
              paddingVertical: Spacing.md,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', gap: 2 }}>
              <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
                {t(item.tripType === 'abriyah' ? 'captain.earnings.tripAbriyah' : 'captain.earnings.tripRegular')}
              </Text>
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
                {new Date(item.completedAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
              {formatIqd(item.fareIqd)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "\(tabs\)/notifications|custom-tab-bar"` → EMPTY. (Confirm `new Date(...).toLocaleDateString()` is fine in RN — it is. Confirm `colors.card/border/subtle/destructive/tint` exist — they do.)
Run: `npx expo lint 2>&1 | grep -E "notifications|custom-tab-bar"` → clean (no NEW warnings).

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/notifications.tsx" components/tab-bar/custom-tab-bar.tsx
git commit -m "feat(captain): Earnings tab (period summary + history)"
```

---

## Task 7: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: tsc exit 0; lint 0 errors (pre-existing template warnings acceptable; no NEW Area-6 warnings).

- [ ] **Step 2: Live re-confirm (all three periods + history)**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
CID=a0a0a0a0-0000-4000-8000-000000000098
for P in today week month; do
  echo -n "$P: "; curl -s "$BASE/api/captains/$CID/earnings?period=$P" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print('gross=%s fee=%s net=%s trips=%s'%(d.get('gross_iqd'),d.get('activation_fee_iqd'),d.get('net_iqd'),d.get('trip_count')))"
done
echo -n "history today count: "; curl -s "$BASE/api/captains/$CID/earnings/history?period=today" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('items',[])))"
```
Expected: each period prints gross/fee/net/trips; history prints a count. (Confirms the exact data the screen renders.)

- [ ] **Step 3: Manual smoke (Expo Go), best-effort**

Earnings tab → Today shows the summary (gross − fee = net + trip count) + history rows → switch to Week/Month refetches → pull-to-refresh works. Record results.

- [ ] **Step 4: Final commit (only if smoke fixes were needed)**

```bash
git add -A && git commit -m "chore(captain): earnings verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **Captain id** = `useAuthStore((s) => s.captain?.id)`; queries `enabled` only when token + id present.
- **Tab re-label** keeps the route file `notifications.tsx`; only icon/label change (same pattern as the Queue tab in Area 4).
- **Period switch** refetches because both query keys include `period`.
- **`net = gross − activation fee`** comes from the backend; the summary card just displays the three values (it does not compute net itself — uses `earnings.netIqd`).
- **Ionicons** `cash`/`cash-outline` — if invalid, use `wallet`/`wallet-outline`; tsc (the Icon name union via TAB_DEFS' `IoniconName` type) flags it.
- **History rows are inline** (no separate component) — intentional, avoids over-componentizing a short list.
