# Captain Activate Today — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An approved captain sees today's activation state on the Home/Drive tab, can activate (charging the wallet), and on a 402 insufficient-funds error can top up inline and auto-retry to become activated.

**Architecture:** A thin `services/activation.ts` wraps the two activation endpoints; `hooks/use-activation.ts` exposes a query + activate mutation. The Home tab (`app/(tabs)/index.tsx`) is reworked from a stub into the captain daily home rendering loading / activated / not-activated / insufficient-funds states. A `components/captain/top-up-sheet.tsx` modal reuses the existing `services/wallet.ts` to credit the wallet, then the home auto-retries activation.

**Tech Stack:** Expo Router, TanStack Query, Zustand auth store, RN `Modal`, existing `services/wallet.ts` + `lib/format-currency.ts`, RHF not needed (single numeric field).

> **No unit-test runner** (per `CLAUDE.md`). Verification gate per task: `npx tsc --noEmit` + `npx expo lint` clean, plus live `curl` against `https://beeb.madebyhaithem.com` where exercisable. This overrides the writing-plans TDD default (user instructions win).

> **Test captain (staging bypass):** phone `9647000000098`, code `16001600`, approved, **wallet balance 0, not activated today** — so `POST /api/captain/activation/today` returns **402** as-is (verified live 2026-06-10). The full 402→top-up→activated sequence is a **one-shot** per Baghdad day (activating consumes the not-activated state); run it in a single pass.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `services/activation.ts` | activation read + activate (charge); Activation type + mapper + DEFAULT_DAILY_FEE_IQD | Create |
| `hooks/use-activation.ts` | query `['captain','activation','today']` + activate mutation | Create |
| `components/captain/top-up-sheet.tsx` | inline top-up modal (preset chips + custom) reusing wallet service | Create |
| `app/(tabs)/index.tsx` | captain daily home: loading / activated / not-activated / insufficient-funds | Modify (rework stub) |
| `i18n/en.json`, `i18n/ar.json` | `captain.activate.*` strings | Modify |

Reused as-is: `services/wallet.ts` (`getWallet`, `topUp`), `lib/format-currency.ts` (`formatIqd`), `lib/api.ts` (`parseApiError`), `components/ui/button.tsx`, `components/forms/input.tsx`, `components/forms/form-error.tsx`, `store/auth-store.ts`.

---

## Task 1: Activation service (`services/activation.ts`)

**Files:**
- Create: `services/activation.ts`

- [ ] **Step 1: Create the service**

```ts
// services/activation.ts
import { api } from '@/lib/api'

// Backend default daily fee; shown only before the first activation row exists
// (the server computes the real charge — we never charge a hardcoded amount).
export const DEFAULT_DAILY_FEE_IQD = 2000

export type ActivationStatus = 'pending' | 'paid' | 'waived' | 'failed'

export interface Activation {
  id: string
  date: string // YYYY-MM-DD
  feeAmountIqd: number
  status: ActivationStatus
  collectedAt?: string | null
  chargeError?: string | null
}

export interface TodayActivation {
  activated: boolean
  activation: Activation | null
}

interface BackendActivation {
  id: string
  captain_id: string
  date: string
  fee_amount_iqd: number
  status: string
  collected_at?: string | null
  charge_error?: string | null
}

function toActivation(b: BackendActivation): Activation {
  return {
    id: b.id,
    date: b.date,
    feeAmountIqd: b.fee_amount_iqd,
    status: (b.status as ActivationStatus) ?? 'pending',
    collectedAt: b.collected_at ?? null,
    chargeError: b.charge_error ?? null,
  }
}

/** Today's activation gate state. 403 if the captain is not approved. */
export async function getTodayActivation(): Promise<TodayActivation> {
  const { data } = await api.get<{ activated: boolean; activation: BackendActivation | null }>(
    '/api/captain/activation/today',
  )
  return {
    activated: data.activated,
    activation: data.activation ? toActivation(data.activation) : null,
  }
}

/**
 * Activate for today (charges the captain wallet). 201 → paid row. A 402
 * (insufficient balance) propagates as an axios error for the caller to catch
 * and recover via top-up. Idempotent: re-activating the same day returns the
 * same row.
 */
export async function activateToday(): Promise<Activation> {
  const { data } = await api.post<BackendActivation>('/api/captain/activation/today', {})
  return toActivation(data)
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/activation"` → expect EMPTY.
Run: `npx expo lint 2>&1 | grep "services/activation"` → expect clean.

- [ ] **Step 3: Live probe (confirms shapes against the test captain)**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s $BASE/api/captain/activation/today -H "Authorization: Bearer $TOKEN"
```
Expected: `{"activated":false,"activation":null}` (confirms the GET shape the service maps). Do NOT POST here — that consumes the one-shot 402 test; the controller runs the full sequence in Task 5.

- [ ] **Step 4: Commit**

```bash
git add services/activation.ts
git commit -m "feat(captain): daily activation service"
```

---

## Task 2: Activation hook (`hooks/use-activation.ts`)

**Files:**
- Create: `hooks/use-activation.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-activation.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTodayActivation, activateToday } from '@/services/activation'
import { useAuthStore } from '@/store/auth-store'

const KEY = ['captain', 'activation', 'today'] as const

/**
 * Reads today's activation gate state and exposes an `activate` mutation.
 * The query runs only when authenticated; activate invalidates it on success
 * so the home screen re-renders the activated state.
 */
export function useActivation() {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: KEY,
    queryFn: getTodayActivation,
    enabled: !!token,
    staleTime: 1000 * 60, // 1 min — daily rollover is at Baghdad midnight
  })

  const activate = useMutation({
    mutationFn: activateToday,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return { query, activate }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "hooks/use-activation"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "use-activation"` → clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-activation.ts
git commit -m "feat(captain): use-activation hook"
```

---

## Task 3: i18n strings (`captain.activate.*`)

**Files:**
- Modify: `i18n/en.json` (add `activate` inside the `captain` object)
- Modify: `i18n/ar.json` (add the matching `activate` block)

- [ ] **Step 1: Add to the `captain` object in `i18n/en.json`**

Insert this `"activate": { ... }` key inside the existing `"captain": { ... }` object (e.g. right after the `"auth"` block; mind comma rules — it must be valid JSON):

```json
    "activate": {
      "homeTitle": "Today",
      "notActivatedTitle": "Activate to start driving",
      "feeNotice": "Daily activation fee: {{fee}}",
      "activateCta": "Activate today",
      "activatedTitle": "You're activated for today",
      "activatedBody": "Paid {{fee}} · you're ready to go online.",
      "onlineComingSoon": "Going online is coming next.",
      "insufficientTitle": "Not enough balance",
      "insufficientBody": "Your wallet has {{balance}}. The daily fee is {{fee}}.",
      "topUpAndActivate": "Top up & activate",
      "topUpTitle": "Top up your wallet",
      "amountLabel": "Amount",
      "customAmount": "Custom amount",
      "confirmTopUp": "Top up",
      "activateFailed": "Couldn't activate. Please try again.",
      "topUpFailed": "Top-up failed. Please try again.",
      "amountInvalid": "Enter a valid amount"
    },
```

- [ ] **Step 2: Add the matching block to `i18n/ar.json`** inside its `"captain"` object:

```json
    "activate": {
      "homeTitle": "اليوم",
      "notActivatedTitle": "فعّل حسابك لبدء القيادة",
      "feeNotice": "رسوم التفعيل اليومي: {{fee}}",
      "activateCta": "تفعيل اليوم",
      "activatedTitle": "تم تفعيلك لليوم",
      "activatedBody": "تم دفع {{fee}} · أنت جاهز للاتصال بالإنترنت.",
      "onlineComingSoon": "الاتصال بالإنترنت قادم قريبًا.",
      "insufficientTitle": "الرصيد غير كافٍ",
      "insufficientBody": "رصيد محفظتك {{balance}}. الرسوم اليومية {{fee}}.",
      "topUpAndActivate": "اشحن وفعّل",
      "topUpTitle": "اشحن محفظتك",
      "amountLabel": "المبلغ",
      "customAmount": "مبلغ مخصص",
      "confirmTopUp": "اشحن",
      "activateFailed": "تعذّر التفعيل. حاول مرة أخرى.",
      "topUpFailed": "فشل الشحن. حاول مرة أخرى.",
      "amountInvalid": "أدخل مبلغًا صحيحًا"
    },
```

- [ ] **Step 3: Validate JSON + parity + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run (parity of the captain subtree):
```bash
node -e "const en=require('./i18n/en.json').captain,ar=require('./i18n/ar.json').captain;const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?Object.keys(v).map(kk=>k+'.'+kk):[k]).sort();const ek=keys(en),ak=keys(ar);console.log('en-only:',ek.filter(k=>!ak.includes(k)));console.log('ar-only:',ak.filter(k=>!ek.includes(k)))"
```
Expected: both arrays EMPTY. If not, fix the mismatch.
Run: `npx tsc --noEmit 2>&1 | grep -i "i18n"` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for Activate Today"
```

---

## Task 4: Top-up sheet (`components/captain/top-up-sheet.tsx`)

**Files:**
- Create: `components/captain/top-up-sheet.tsx`

This component has RTL layout. **First invoke the `react-native-rtl-positioning` skill** and confirm the layout follows it (the code uses `flexDirection: isRTL ? 'row-reverse' : 'row'` for the chips row, captures `isRTL` at module scope, no `marginStart`/`marginEnd`, no `scaleX(-1)`).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/top-up-sheet.tsx
import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/forms/form-error'
import { formatIqd } from '@/lib/format-currency'
import { topUp } from '@/services/wallet'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL
const PRESETS = [2000, 5000, 10000]

interface TopUpSheetProps {
  visible: boolean
  balanceIqd: number
  feeIqd: number
  onClose: () => void
  onToppedUp: () => void
}

export function TopUpSheet({ visible, balanceIqd, feeIqd, onClose, onToppedUp }: TopUpSheetProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [preset, setPreset] = useState<number | null>(PRESETS[0])
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  const amount = custom ? parseInt(custom.replace(/\D/g, ''), 10) || 0 : (preset ?? 0)

  const mutation = useMutation({
    mutationFn: () => topUp(amount),
    onMutate: () => setError(null),
    onSuccess: () => onToppedUp(),
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork
        ? 'common.networkError'
        : info.status === 400
          ? 'captain.activate.amountInvalid'
          : 'captain.activate.topUpFailed'
      setError(t(key))
    },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.lg,
          }}
        >
          <Text style={{ ...Typography['heading-md'], color: colors.text }}>
            {t('captain.activate.topUpTitle')}
          </Text>

          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
            {PRESETS.map((p) => {
              const active = !custom && preset === p
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { setPreset(p); setCustom(''); setError(null) }}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing.md,
                    borderRadius: 14,
                    borderCurve: 'continuous',
                    backgroundColor: active ? colors.tint : colors.surface,
                    borderWidth: 1.5,
                    borderColor: active ? colors.tint : colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...Typography['caption-sm'],
                      color: active ? colors.onTint : colors.text,
                      fontStyle: 'normal',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatIqd(p)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Input
            label={t('captain.activate.customAmount')}
            value={custom}
            onChangeText={(v) => { setCustom(v.replace(/\D/g, '')); setError(null) }}
            keyboardType="number-pad"
            placeholder={t('captain.activate.amountLabel')}
          />

          <FormError message={error} />

          <Button
            label={t('captain.activate.confirmTopUp')}
            loading={mutation.isPending}
            disabled={amount <= 0}
            onPress={() => mutation.mutate()}
          />
        </View>
      </View>
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "top-up-sheet"` → EMPTY. (`topUp(amountIqd: number, paymentMethodId?: string)` exists in `services/wallet.ts` and returns a `Transaction`; calling `topUp(amount)` is valid.)
Run: `npx expo lint 2>&1 | grep "top-up-sheet"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/top-up-sheet.tsx
git commit -m "feat(captain): inline wallet top-up sheet"
```

---

## Task 5: Rework the Home tab (`app/(tabs)/index.tsx`)

**Files:**
- Modify: `app/(tabs)/index.tsx` (full rewrite from the stub)

This screen has RTL-aware layout. **First invoke the `react-native-rtl-positioning` skill** and confirm the layout (it uses `alignItems` edge ternaries and no physical margins).

- [ ] **Step 1: Rewrite the home screen**

Replace the ENTIRE contents of `app/(tabs)/index.tsx` with:

```tsx
import { useState } from 'react'
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { TopUpSheet } from '@/components/captain/top-up-sheet'
import { useActivation } from '@/hooks/use-activation'
import { DEFAULT_DAILY_FEE_IQD } from '@/services/activation'
import { getWallet } from '@/services/wallet'
import { formatIqd } from '@/lib/format-currency'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

export default function HomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { query, activate } = useActivation()

  const [error, setError] = useState<string | null>(null)
  const [showTopUp, setShowTopUp] = useState(false)
  const [insufficient, setInsufficient] = useState(false)
  const [balanceIqd, setBalanceIqd] = useState(0)

  const activation = query.data?.activation ?? null
  const feeIqd = activation?.feeAmountIqd ?? DEFAULT_DAILY_FEE_IQD

  async function runActivate() {
    setError(null)
    try {
      await activate.mutateAsync()
      setInsufficient(false)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 402) {
        // Fetch balance so the insufficient-funds card + sheet can show it.
        try {
          const w = await getWallet()
          setBalanceIqd(w.balanceIqd)
        } catch {
          setBalanceIqd(0)
        }
        setInsufficient(true)
      } else {
        const key = info.isNetwork
          ? 'common.networkError'
          : info.status === 429
            ? 'common.rateLimited'
            : 'captain.activate.activateFailed'
        setError(t(key))
      }
    }
  }

  function header() {
    return (
      <Text style={{ ...Typography['caption'], color: colors.subtle, fontStyle: 'normal' }}>
        {t('captain.activate.homeTitle')}
      </Text>
    )
  }

  // Loading
  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  const activated = query.data?.activated === true

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
    >
      {header()}

      {activated ? (
        // Activated ready state
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.md,
            alignItems: 'center',
            boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
          }}
        >
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
            {t('captain.activate.activatedTitle')}
          </Text>
          <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
            {t('captain.activate.activatedBody', { fee: formatIqd(feeIqd) })}
          </Text>
          {/* Area 3 (online toggle) mounts here. */}
          <Text style={{ ...Typography['caption-sm'], color: colors.muted, textAlign: 'center', fontStyle: 'normal' }}>
            {t('captain.activate.onlineComingSoon')}
          </Text>
        </View>
      ) : (
        // Not activated → activate card (with insufficient-funds sub-state)
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.lg,
            boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
          }}
        >
          <View style={{ gap: Spacing.sm, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-md'], color: colors.text }}>
              {t('captain.activate.notActivatedTitle')}
            </Text>
            <Text style={{ ...Typography.body, color: colors.subtle, fontStyle: 'normal' }}>
              {insufficient
                ? t('captain.activate.insufficientBody', { balance: formatIqd(balanceIqd), fee: formatIqd(feeIqd) })
                : t('captain.activate.feeNotice', { fee: formatIqd(feeIqd) })}
            </Text>
          </View>

          <FormError message={error} />

          {insufficient ? (
            <Button
              label={t('captain.activate.topUpAndActivate')}
              onPress={() => setShowTopUp(true)}
              leading={<Icon name="wallet-outline" size={18} color={colors.onTint} />}
            />
          ) : (
            <Button
              label={t('captain.activate.activateCta')}
              loading={activate.isPending}
              onPress={runActivate}
            />
          )}
        </View>
      )}

      <TopUpSheet
        visible={showTopUp}
        balanceIqd={balanceIqd}
        feeIqd={feeIqd}
        onClose={() => setShowTopUp(false)}
        onToppedUp={() => {
          setShowTopUp(false)
          runActivate()
        }}
      />
    </ScrollView>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "(tabs)/index"` → EMPTY. If `Typography['caption']` isn't a valid preset key, use `'caption-sm'` instead (check `constants/Typography.ts`). If `wallet-outline`/`checkmark-circle` error as Ionicons names, substitute a valid one (the `Icon` name type will flag it).
Run: `npx expo lint 2>&1 | grep "(tabs)/index"` → clean.

- [ ] **Step 3: Live end-to-end probe (the one-shot sequence)**

Run the full 402 → top-up → activated sequence with the test captain:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "GET before:"; curl -s $BASE/api/captain/activation/today -H "Authorization: Bearer $TOKEN"
echo; echo "POST (expect 402):"; curl -s -w " [%{http_code}]\n" -X POST $BASE/api/captain/activation/today -H "Authorization: Bearer $TOKEN" -d '{}'
echo "topup 5000:"; curl -s -o /dev/null -w "[%{http_code}]\n" -X POST $BASE/api/me/wallet/topup -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"amount_iqd":5000}'
echo "POST retry (expect 201 paid):"; curl -s -w " [%{http_code}]\n" -X POST $BASE/api/captain/activation/today -H "Authorization: Bearer $TOKEN" -d '{}'
echo "GET after:"; curl -s $BASE/api/captain/activation/today -H "Authorization: Bearer $TOKEN"
```
Expected: GET before `activated:false`; POST `402`; topup `200`/`201`; retry `201` with `status:"paid"`; GET after `activated:true`. This proves the exact flow the UI drives. (After this, the captain is activated for the Baghdad day — the not-activated UI state can't be re-reached until rollover; that's expected.)

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat(captain): Activate Today home with 402 top-up recovery"
```

---

## Task 6: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint across the app**

Run: `npx tsc --noEmit && npx expo lint`
Expected: both clean (no errors introduced by Area 2; note any pre-existing unrelated warnings).

- [ ] **Step 2: Confirm the live sequence result from Task 5 Step 3 is recorded**

Confirm the Task 5 probe showed: 402 → topup ok → 201 paid → `activated:true`. If the test captain was already activated (GET before returned `activated:true` because a prior run consumed it), note that the 402 leg couldn't be re-exercised this Baghdad day and that the code path is unchanged — do not treat it as a failure; the 402 mapping was verified during design (2026-06-10).

- [ ] **Step 3: Manual smoke (Expo Go), best-effort**

Start `npx expo start`; log in as the test captain; confirm the home tab renders the activation card (or the activated ready state if already activated), the top-up sheet opens with preset chips, and amounts format as IQD. Record results; don't block on the one-shot activation state.

- [ ] **Step 4: Final commit (only if smoke fixes were needed)**

```bash
git add -A && git commit -m "chore(captain): Activate Today verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **One-shot live test:** activating the test captain consumes the not-activated state for the Baghdad day. Run Task 5 Step 3 as a single pass. If it's already activated from a prior run, the 402 leg is not re-runnable today — the backend offered to reset; otherwise rely on the design-time 402 verification.
- **Ionicons names** (`checkmark-circle`, `wallet-outline`) and the `Typography['caption']` key are best-guesses; `tsc` will flag any invalid one — substitute the nearest valid value.
- **`topUp`** is reused from `services/wallet.ts` with signature `topUp(amountIqd: number, paymentMethodId?: string)` — the sheet calls `topUp(amount)` (cash/MockGateway credit, no method).
- **No fake online toggle** on the activated state — only the "coming next" line; Area 3 replaces that region.
