# Captain Live Trip Legs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Area 4 placeholder `app/(trip)/[id].tsx` with the real live-trip screen — map + a status-driven button (arrive→start→complete), masked call, navigate-out, cancel (accepted-only), Abriyah roster, a gated multi-stop reach panel, and a completion summary with optional captain→rider rating — synced via GET + Area 3's `lastTripUpdate`.

**Architecture:** `services/captain-trips.ts` wraps the trip + leg + cancel + proxy + rating endpoints. Small `abriyah-members.ts` (roster) and `captain-stops.ts` (reach + a gap-gated `getStops`). `hooks/use-live-trip.ts` does GET-on-mount + merges `lastTripUpdate` + leg mutations. The screen composes `trip-map` (reused) with small focused components (action bar, cancel sheet, rating stars, roster, stops list).

**Tech Stack:** Expo Router, TanStack Query, Area 3 `useCaptainPresence`, `react-native-maps` (via existing `components/trip/trip-map.tsx`), `services/routing.ts` (OSRM), `expo-location`, `Linking` (tel/maps deep-links), `lib/format-currency`.

> **No unit-test runner** (per `CLAUDE.md`). Gate per task: `npx tsc --noEmit` + `npx expo lint` clean, plus live `curl` where exercisable (pace for the edge 429). Overrides the writing-plans TDD default.

> **Core legs verified live 2026-06-11** on a real trip: GET→accepted, arrive 200, start 200 (in_progress), proxy 200 (masked `+964701…`), complete 200 (completed). Test captain `9647000000098`/`16001600`, rider `9647000000099`.

> **Multi-stop is GATED** on BACKEND_ISSUES #7 (no captain stops-list endpoint; captain token → 403 on the rider stops endpoint, verified). `getStops` returns `[]`; the stops panel stays hidden until the backend ships the endpoint. `reachStop` is wired and ready.

> **RTL:** every UI task follows CLAUDE.md RTL rules (flexDirection ternary, module-scope isRTL, no marginStart/marginEnd). Invoke `react-native-rtl-positioning` if available; else fall back to CLAUDE.md + `components/captain/document-row.tsx`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `services/captain-trips.ts` | getTrip + arrive/start/complete/cancel + getProxy + rateRider + Trip/ProxySession/CancelReason types | Create |
| `services/abriyah-members.ts` | getRoomMembers (roster) | Create |
| `services/captain-stops.ts` | reachStop + gated getStops (returns []) | Create |
| `hooks/use-live-trip.ts` | GET-on-mount + lastTripUpdate merge + leg mutations | Create |
| `components/captain/rating-stars.tsx` | 1–5★ tappable | Create |
| `components/captain/cancel-sheet.tsx` | cancel reason chips + comment | Create |
| `components/captain/trip-action-bar.tsx` | Call / Navigate / Cancel row | Create |
| `components/captain/member-roster.tsx` | Abriyah member rows | Create |
| `app/(trip)/[id].tsx` | rework placeholder → live screen | Modify |
| `i18n/en.json`, `i18n/ar.json` | `captain.live.*` strings | Modify |

Reused: `components/trip/trip-map.tsx` (`driver`/`pickup`/`dropoff`/`stops`/`routeCoords` props), `services/routing.ts` (`getRoute(a,b)→{coords}`), `hooks/use-current-location.ts`, `providers/captain-presence.tsx` (`lastTripUpdate`), `lib/format-currency.ts`, `lib/api.ts` (`parseApiError`), `components/ui/*`. (`components/captain/stops-list.tsx` is NOT built — multi-stop is gated; the screen renders no stops panel since `getStops` returns `[]`.)

---

## Task 1: Trips service (`services/captain-trips.ts`)

**Files:**
- Create: `services/captain-trips.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-trips.ts
import { api } from '@/lib/api'

export type TripStatus = 'requested' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
export type TripType = 'regular' | 'abriyah'
export type CancelReason = 'changed_mind' | 'wait_too_long' | 'wrong_pickup' | 'safety' | 'other'

export interface Trip {
  id: string
  tripType: TripType
  status: TripStatus
  riderId: string
  captainId?: string | null
  roomId?: string | null
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  fareIqd: number
  distanceKm: number
  cancellationReason?: string | null
  completedAt?: string | null
}

export interface ProxySession {
  riderProxyNumber: string
  captainProxyNumber: string
  expiresAt: string
}

interface BackendTrip {
  id: string
  trip_type: string
  status: string
  rider_id: string
  captain_id?: string | null
  room_id?: string | null
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  fare_iqd: number
  distance_km: number
  cancellation_reason?: string | null
  completed_at?: string | null
}

function toTrip(b: BackendTrip): Trip {
  return {
    id: b.id,
    tripType: b.trip_type === 'abriyah' ? 'abriyah' : 'regular',
    status: (b.status as TripStatus) ?? 'accepted',
    riderId: b.rider_id,
    captainId: b.captain_id ?? null,
    roomId: b.room_id ?? null,
    pickupLat: b.pickup_lat,
    pickupLng: b.pickup_lng,
    dropoffLat: b.dropoff_lat,
    dropoffLng: b.dropoff_lng,
    fareIqd: b.fare_iqd,
    distanceKm: b.distance_km,
    cancellationReason: b.cancellation_reason ?? null,
    completedAt: b.completed_at ?? null,
  }
}

export async function getTrip(id: string): Promise<Trip> {
  const { data } = await api.get<BackendTrip>(`/api/trips/${id}`)
  return toTrip(data)
}

/** Cue at pickup — no status change. */
export async function arriveTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/arrive`)
}

/** accepted → in_progress. */
export async function startTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/start`)
}

/** in_progress → completed (charges rider best-effort). */
export async function completeTrip(id: string): Promise<void> {
  await api.post(`/api/trips/${id}/complete`)
}

/** Captain cancel — allowed from requested/accepted only (else 400). */
export async function cancelTrip(id: string, reason: CancelReason, comment?: string): Promise<void> {
  await api.post(`/api/trips/${id}/cancel`, { reason, ...(comment ? { comment } : {}) })
}

/** Masked call session (lazily allocated; trip must be accepted/in_progress + have a captain). */
export async function getProxy(id: string): Promise<ProxySession> {
  const { data } = await api.get<{
    rider_proxy_number: string
    captain_proxy_number: string
    expires_at: string
  }>(`/api/captain/trips/${id}/proxy`)
  return {
    riderProxyNumber: data.rider_proxy_number,
    captainProxyNumber: data.captain_proxy_number,
    expiresAt: data.expires_at,
  }
}

/** Captain rates the rider after completion (stars 1-5). One per trip (409 repeat). */
export async function rateRider(id: string, stars: number, comment?: string): Promise<void> {
  await api.post(`/api/trips/${id}/ratings`, { stars, ...(comment ? { comment } : {}) })
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/captain-trips"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "captain-trips"` → clean.

- [ ] **Step 3: Commit**

```bash
git add services/captain-trips.ts
git commit -m "feat(captain): live-trip service (legs + cancel + proxy + rating)"
```

---

## Task 2: Abriyah members service (`services/abriyah-members.ts`)

**Files:**
- Create: `services/abriyah-members.ts`

- [ ] **Step 1: Create the service**

```ts
// services/abriyah-members.ts
import { api } from '@/lib/api'

export interface RoomMember {
  riderId: string
  name: string
  fareIqd: number
  distanceKm: number
}

interface BackendMember {
  rider_id: string
  name: string
  fare_iqd: number
  distance_km: number
}

/** Members of a dispatched Abriyah room (assigned captain only; 403 otherwise). */
export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data } = await api.get<{ members: BackendMember[] }>(
    `/api/abriyah/rooms/${roomId}/members`,
  )
  return (data.members ?? []).map((m) => ({
    riderId: m.rider_id,
    name: m.name,
    fareIqd: m.fare_iqd,
    distanceKm: m.distance_km,
  }))
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "abriyah-members"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "abriyah-members"` → clean.

- [ ] **Step 3: Commit**

```bash
git add services/abriyah-members.ts
git commit -m "feat(captain): Abriyah room members service"
```

---

## Task 3: Stops service (`services/captain-stops.ts` — gated)

**Files:**
- Create: `services/captain-stops.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-stops.ts
import { api } from '@/lib/api'

export interface TripStop {
  id: string
  lat: number
  lng: number
  seq: number
  status: string
  reachedAt?: string | null
}

/**
 * List a trip's stops. GATED: there is no captain-facing stops-list endpoint
 * yet (BACKEND_ISSUES #7 — the rider stops endpoint 403s for a captain token,
 * and the Trip object embeds no stops). Returns [] until the backend ships a
 * captain stops-list; then this becomes one `api.get` call and the stops panel
 * activates.
 */
export async function getStops(_tripId: string): Promise<TripStop[]> {
  return []
}

/** Mark a stop reached (captain on the trip). Already supported by the backend. */
export async function reachStop(tripId: string, stopId: string): Promise<void> {
  await api.post(`/api/captain/trips/${tripId}/stops/${stopId}/reach`, {})
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "captain-stops"` → EMPTY. (`_tripId` is intentionally unused — the `_` prefix should satisfy the linter; if `no-unused-vars` still flags it, the project's eslint config may need the arg; in that case keep the `_` and report — do NOT remove the parameter, it's the future signature.)
Run: `npx expo lint 2>&1 | grep "captain-stops"` → clean (or the documented `_tripId` note).

- [ ] **Step 3: Commit**

```bash
git add services/captain-stops.ts
git commit -m "feat(captain): stops reach service (list gated on backend gap #7)"
```

---

## Task 4: i18n strings (`captain.live.*`)

**Files:**
- Modify: `i18n/en.json` (add `live` inside `captain`)
- Modify: `i18n/ar.json` (matching block)

- [ ] **Step 1: Add to `i18n/en.json`'s `captain` object** (after `trip`; valid JSON):

```json
    "live": {
      "arrivedAtPickup": "Arrived at pickup",
      "startTrip": "Start trip",
      "completeTrip": "Complete trip",
      "call": "Call",
      "navigate": "Navigate",
      "cancel": "Cancel trip",
      "cancelTitle": "Cancel this trip?",
      "cancelConfirm": "Cancel trip",
      "keepTrip": "Keep trip",
      "reason_changed_mind": "Changed my mind",
      "reason_wait_too_long": "Waited too long",
      "reason_wrong_pickup": "Wrong pickup",
      "reason_safety": "Safety concern",
      "reason_other": "Other",
      "commentOptional": "Add a note (optional)",
      "completedTitle": "Trip completed",
      "fareCollected": "Fare: {{fare}}",
      "rateRider": "Rate your rider",
      "submitRating": "Submit",
      "skip": "Skip",
      "done": "Done",
      "cancelledTitle": "Trip cancelled",
      "cancelledBody": "This trip is no longer active.",
      "riders": "Riders",
      "fareLabel": "Fare",
      "distanceLabel": "{{km}} km",
      "legFailed": "Couldn't update the trip. Please try again.",
      "cancelFailed": "Couldn't cancel. Please try again.",
      "callUnavailable": "Calling isn't available right now."
    },
```

- [ ] **Step 2: Add to `i18n/ar.json`'s `captain` object:**

```json
    "live": {
      "arrivedAtPickup": "وصلت إلى نقطة الانطلاق",
      "startTrip": "ابدأ الرحلة",
      "completeTrip": "أكمل الرحلة",
      "call": "اتصال",
      "navigate": "التنقل",
      "cancel": "إلغاء الرحلة",
      "cancelTitle": "إلغاء هذه الرحلة؟",
      "cancelConfirm": "إلغاء الرحلة",
      "keepTrip": "الإبقاء على الرحلة",
      "reason_changed_mind": "غيّرت رأيي",
      "reason_wait_too_long": "الانتظار طويل جدًا",
      "reason_wrong_pickup": "نقطة انطلاق خاطئة",
      "reason_safety": "مخاوف تتعلق بالسلامة",
      "reason_other": "أخرى",
      "commentOptional": "أضف ملاحظة (اختياري)",
      "completedTitle": "اكتملت الرحلة",
      "fareCollected": "الأجرة: {{fare}}",
      "rateRider": "قيّم الراكب",
      "submitRating": "إرسال",
      "skip": "تخطٍ",
      "done": "تم",
      "cancelledTitle": "أُلغيت الرحلة",
      "cancelledBody": "لم تعد هذه الرحلة نشطة.",
      "riders": "الركّاب",
      "fareLabel": "الأجرة",
      "distanceLabel": "{{km}} كم",
      "legFailed": "تعذّر تحديث الرحلة. حاول مرة أخرى.",
      "cancelFailed": "تعذّر الإلغاء. حاول مرة أخرى.",
      "callUnavailable": "الاتصال غير متاح حاليًا."
    },
```

- [ ] **Step 3: Validate + parity + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run: `node -e "const en=require('./i18n/en.json').captain,ar=require('./i18n/ar.json').captain;const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?Object.keys(v).map(kk=>k+'.'+kk):[k]).sort();const ek=keys(en),ak=keys(ar);console.log('en-only:',ek.filter(k=>!ak.includes(k)));console.log('ar-only:',ak.filter(k=>!ek.includes(k)))"` → both EMPTY.
Run: `npx tsc --noEmit 2>&1 | grep -i "i18n"` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for live trip"
```

---

## Task 5: Live-trip hook (`hooks/use-live-trip.ts`)

**Files:**
- Create: `hooks/use-live-trip.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-live-trip.ts
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getTrip,
  arriveTrip,
  startTrip,
  completeTrip,
  cancelTrip,
  type Trip,
  type TripStatus,
  type CancelReason,
} from '@/services/captain-trips'
import { useCaptainPresence } from '@/providers/captain-presence'

/**
 * Live trip state for the driving screen. GET on mount is the source of truth;
 * Area 3's lastTripUpdate WS frame patches the status live (covers a rider/admin
 * cancel). Leg mutations call the service, patch status where deterministic, and
 * refetch on settle. `arrived` is a local cue flag (arrive has no status change).
 */
export function useLiveTrip(id: string) {
  const { lastTripUpdate } = useCaptainPresence()
  const queryClient = useQueryClient()
  const [arrived, setArrived] = useState(false)

  const key = ['trip', id] as const
  const query = useQuery({ queryKey: key, queryFn: () => getTrip(id), enabled: !!id })

  // Live status from the WS frame (only when it's THIS trip).
  useEffect(() => {
    if (lastTripUpdate && lastTripUpdate.id === id) {
      queryClient.setQueryData<Trip | undefined>(key, (prev) =>
        prev ? { ...prev, status: lastTripUpdate.status as TripStatus } : prev,
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastTripUpdate, id])

  function patchStatus(status: TripStatus) {
    queryClient.setQueryData<Trip | undefined>(key, (prev) => (prev ? { ...prev, status } : prev))
  }

  const arriveM = useMutation({
    mutationFn: () => arriveTrip(id),
    onSuccess: () => setArrived(true),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const startM = useMutation({
    mutationFn: () => startTrip(id),
    onSuccess: () => patchStatus('in_progress'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const completeM = useMutation({
    mutationFn: () => completeTrip(id),
    onSuccess: () => patchStatus('completed'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const cancelM = useMutation({
    mutationFn: ({ reason, comment }: { reason: CancelReason; comment?: string }) =>
      cancelTrip(id, reason, comment),
    onSuccess: () => patchStatus('cancelled'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  return {
    trip: query.data,
    isLoading: query.isLoading,
    arrived,
    arrive: () => arriveM.mutateAsync(),
    start: () => startM.mutateAsync(),
    complete: () => completeM.mutateAsync(),
    cancel: (reason: CancelReason, comment?: string) => cancelM.mutateAsync({ reason, comment }),
    busy: arriveM.isPending || startM.isPending || completeM.isPending || cancelM.isPending,
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "use-live-trip"` → EMPTY. (`useCaptainPresence()` returns the value object — destructure `{ lastTripUpdate }`. Confirm `lastTripUpdate` is `{ id, status } | null` on the context — it is, from Area 3.)
Run: `npx expo lint 2>&1 | grep "use-live-trip"` → clean (the `eslint-disable` line is intentional for the status-patch effect).

- [ ] **Step 3: Commit**

```bash
git add hooks/use-live-trip.ts
git commit -m "feat(captain): live-trip hook (GET + WS status + legs)"
```

---

## Task 6: Rating stars (`components/captain/rating-stars.tsx`)

**Files:**
- Create: `components/captain/rating-stars.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back to CLAUDE.md).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/rating-stars.tsx
import { View, TouchableOpacity, I18nManager } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

const isRTL = I18nManager.isRTL

interface RatingStarsProps {
  value: number
  onChange: (stars: number) => void
}

export function RatingStars({ value, onChange }: RatingStarsProps) {
  const colors = useThemeColors()
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={6}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={32} color={colors.tint} />
        </TouchableOpacity>
      ))}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "rating-stars"` → EMPTY. (`star`/`star-outline` are valid Ionicons.)
Run: `npx expo lint 2>&1 | grep "rating-stars"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/rating-stars.tsx
git commit -m "feat(captain): rating stars component"
```

---

## Task 7: Cancel sheet (`components/captain/cancel-sheet.tsx`)

**Files:**
- Create: `components/captain/cancel-sheet.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/cancel-sheet.tsx
import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import type { CancelReason } from '@/services/captain-trips'

const isRTL = I18nManager.isRTL
const REASONS: CancelReason[] = ['changed_mind', 'wait_too_long', 'wrong_pickup', 'safety', 'other']

interface CancelSheetProps {
  visible: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: (reason: CancelReason, comment?: string) => void
}

export function CancelSheet({ visible, submitting, onClose, onConfirm }: CancelSheetProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState<CancelReason>('changed_mind')
  const [comment, setComment] = useState('')

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
          <Text style={{ ...Typography['heading-md'], color: colors.text }}>{t('captain.live.cancelTitle')}</Text>

          <View style={{ gap: Spacing.sm }}>
            {REASONS.map((r) => {
              const active = reason === r
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setReason(r)}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: Spacing.md,
                    paddingHorizontal: Spacing.lg,
                    borderRadius: 14,
                    borderCurve: 'continuous',
                    borderWidth: 1.5,
                    borderColor: active ? colors.tint : colors.border,
                    backgroundColor: active ? colors.tint + '14' : colors.surface,
                  }}
                >
                  <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
                    {t(`captain.live.reason_${r}`)}
                  </Text>
                  {active && <Text style={{ color: colors.tint }}>●</Text>}
                </TouchableOpacity>
              )
            })}
          </View>

          <Input
            value={comment}
            onChangeText={setComment}
            placeholder={t('captain.live.commentOptional')}
          />

          <Button
            label={t('captain.live.cancelConfirm')}
            variant="destructive"
            loading={submitting}
            onPress={() => onConfirm(reason, comment || undefined)}
          />
          <Button label={t('captain.live.keepTrip')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "cancel-sheet"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "cancel-sheet"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/cancel-sheet.tsx
git commit -m "feat(captain): cancel reason sheet"
```

---

## Task 8: Action bar (`components/captain/trip-action-bar.tsx`)

**Files:**
- Create: `components/captain/trip-action-bar.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/trip-action-bar.tsx
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

const isRTL = I18nManager.isRTL

interface TripActionBarProps {
  onCall: () => void
  onNavigate: () => void
  onCancel?: () => void // shown only when provided (accepted state)
}

export function TripActionBar({ onCall, onNavigate, onCancel }: TripActionBarProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
      <ActionButton icon="call" label={t('captain.live.call')} onPress={onCall} colors={colors} />
      <ActionButton icon="navigate" label={t('captain.live.navigate')} onPress={onNavigate} colors={colors} />
      {onCancel && (
        <ActionButton icon="close-circle" label={t('captain.live.cancel')} onPress={onCancel} colors={colors} destructive />
      )}
    </View>
  )
}

interface ActionButtonProps {
  icon: React.ComponentProps<typeof Icon>['name']
  label: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  destructive?: boolean
}

function ActionButton({ icon, label, onPress, colors, destructive }: ActionButtonProps) {
  const tone = destructive ? colors.destructive : colors.tint
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: Spacing.md,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name={icon} size={20} color={tone} />
      <Text style={{ ...Typography['caption-sm'], color: tone, fontStyle: 'normal' }}>{label}</Text>
    </TouchableOpacity>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "trip-action-bar"` → EMPTY. (`call`/`navigate`/`close-circle` valid Ionicons.)
Run: `npx expo lint 2>&1 | grep "trip-action-bar"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/trip-action-bar.tsx
git commit -m "feat(captain): live-trip action bar (call/navigate/cancel)"
```

---

## Task 9: Member roster (`components/captain/member-roster.tsx`)

**Files:**
- Create: `components/captain/member-roster.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/member-roster.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { formatIqd } from '@/lib/format-currency'
import type { RoomMember } from '@/services/abriyah-members'

const isRTL = I18nManager.isRTL

interface MemberRosterProps {
  members: RoomMember[]
}

export function MemberRoster({ members }: MemberRosterProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  if (members.length === 0) return null

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.live.riders')}
      </Text>
      {members.map((m) => (
        <View
          key={m.riderId}
          style={{
            flexDirection: isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderCurve: 'continuous',
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
          }}
        >
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{m.name}</Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
            {formatIqd(m.fareIqd)} · {t('captain.live.distanceLabel', { km: m.distanceKm.toFixed(1) })}
          </Text>
        </View>
      ))}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "member-roster"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "member-roster"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/member-roster.tsx
git commit -m "feat(captain): Abriyah member roster component"
```

---

## Task 10: Live-trip screen (`app/(trip)/[id].tsx`)

**Files:**
- Modify: `app/(trip)/[id].tsx` (full rewrite from the placeholder)

This task has RTL layout + composes everything. **First invoke `react-native-rtl-positioning`** (or fall back).

- [ ] **Step 1: Rewrite the screen**

Replace the ENTIRE file with:

```tsx
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Linking, Platform, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { TripMap } from '@/components/trip/trip-map'
import { TripActionBar } from '@/components/captain/trip-action-bar'
import { CancelSheet } from '@/components/captain/cancel-sheet'
import { RatingStars } from '@/components/captain/rating-stars'
import { MemberRoster } from '@/components/captain/member-roster'
import { useLiveTrip } from '@/hooks/use-live-trip'
import { getProxy, rateRider, type CancelReason } from '@/services/captain-trips'
import { getRoomMembers } from '@/services/abriyah-members'
import { getRoute } from '@/services/routing'
import { useCurrentLocation, type LatLng } from '@/hooks/use-current-location'
import { formatIqd } from '@/lib/format-currency'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL

export default function LiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { location } = useCurrentLocation()

  const { trip, isLoading, arrived, arrive, start, complete, cancel, busy } = useLiveTrip(id)
  const [error, setError] = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [stars, setStars] = useState(0)
  const [routeCoords, setRouteCoords] = useState<LatLng[]>([])

  const status = trip?.status
  const pickup: LatLng | undefined = trip ? { latitude: trip.pickupLat, longitude: trip.pickupLng } : undefined
  const dropoff: LatLng | undefined = trip ? { latitude: trip.dropoffLat, longitude: trip.dropoffLng } : undefined
  // Navigate/route target: pickup until started, dropoff once in_progress.
  const target = status === 'in_progress' ? dropoff : pickup

  // Abriyah roster.
  const roster = useQuery({
    queryKey: ['abriyah', 'members', trip?.roomId],
    queryFn: () => getRoomMembers(trip!.roomId as string),
    enabled: trip?.tripType === 'abriyah' && !!trip?.roomId,
  })

  // Route line from captain → target.
  useEffect(() => {
    let cancelled = false
    if (!location || !target) { setRouteCoords([]); return }
    getRoute(location, target).then((r) => { if (!cancelled) setRouteCoords(r?.coords ?? []) })
    return () => { cancelled = true }
  }, [location, target?.latitude, target?.longitude])

  async function onPrimary() {
    setError(null)
    try {
      if (status === 'accepted' && !arrived) await arrive()
      else if (status === 'accepted' && arrived) await start()
      else if (status === 'in_progress') await complete()
    } catch (err) {
      setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.legFailed'))
    }
  }

  async function onCall() {
    setError(null)
    try {
      const proxy = await getProxy(id)
      Linking.openURL(`tel:${proxy.captainProxyNumber}`)
    } catch {
      setError(t('captain.live.callUnavailable'))
    }
  }

  function onNavigate() {
    if (!target) return
    const ll = `${target.latitude},${target.longitude}`
    const url = Platform.select({
      ios: `https://maps.google.com/?daddr=${ll}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    })
    if (url) Linking.openURL(url)
  }

  async function onCancelConfirm(reason: CancelReason, comment?: string) {
    setError(null)
    try {
      await cancel(reason, comment)
      setShowCancel(false)
    } catch (err) {
      setError(t(parseApiError(err).isNetwork ? 'common.networkError' : 'captain.live.cancelFailed'))
    }
  }

  async function onSubmitRating() {
    try { if (stars > 0) await rateRider(id, stars) } catch { /* 409 already-rated → ignore */ }
    router.replace('/(tabs)')
  }

  if (isLoading || !trip) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  // Cancelled (own or rider/admin via WS)
  if (status === 'cancelled') {
    return (
      <CenteredState icon="close-circle" tone={colors.destructive} title={t('captain.live.cancelledTitle')} body={t('captain.live.cancelledBody')}
        button={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} colors={colors} insets={insets} />
    )
  }

  // Completed → summary + optional rating
  if (status === 'completed') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark-circle" size={40} color={colors.success} />
        </View>
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.live.completedTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
          {t('captain.live.fareCollected', { fare: formatIqd(trip.fareIqd) })}
        </Text>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.live.rateRider')}</Text>
        <RatingStars value={stars} onChange={setStars} />
        <Button label={stars > 0 ? t('captain.live.submitRating') : t('captain.live.skip')} onPress={onSubmitRating} />
      </View>
    )
  }

  // Active (accepted / in_progress)
  const primaryLabel =
    status === 'accepted' && !arrived ? t('captain.live.arrivedAtPickup')
    : status === 'accepted' && arrived ? t('captain.live.startTrip')
    : t('captain.live.completeTrip')

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '52%' }}>
        <TripMap
          driver={location ?? undefined}
          pickup={pickup}
          dropoff={dropoff}
          routeCoords={routeCoords}
          showsUserLocation={false}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}
      >
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal' }}>{t('captain.live.fareLabel')}</Text>
          <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'] }}>{formatIqd(trip.fareIqd)}</Text>
        </View>

        {trip.tripType === 'abriyah' && <MemberRoster members={roster.data ?? []} />}

        <FormError message={error} />

        <Button label={primaryLabel} loading={busy} onPress={onPrimary} />

        <TripActionBar
          onCall={onCall}
          onNavigate={onNavigate}
          onCancel={status === 'accepted' ? () => setShowCancel(true) : undefined}
        />
      </ScrollView>

      <CancelSheet
        visible={showCancel}
        submitting={busy}
        onClose={() => setShowCancel(false)}
        onConfirm={onCancelConfirm}
      />
    </View>
  )
}

interface CenteredStateProps {
  icon: React.ComponentProps<typeof Icon>['name']
  tone: string
  title: string
  body: string
  button: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  insets: { top: number; bottom: number }
}

function CenteredState({ icon, tone, title, body, button, onPress, colors, insets }: CenteredStateProps) {
  const { t } = useTranslation()
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tone + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={40} color={tone} />
      </View>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{title}</Text>
      <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{body}</Text>
      <Button label={button} onPress={onPress} />
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "(trip)/\[id\]"` → EMPTY. Confirm `TripMap` accepts `driver`/`pickup`/`dropoff`/`routeCoords`/`showsUserLocation` props (it does, per `components/trip/trip-map.tsx`). Confirm `useCurrentLocation` exports `LatLng`. The `CenteredState` uses `useTranslation` but doesn't reference `t` — remove the unused `const { t } = useTranslation()` from `CenteredState` if lint flags it (the labels are passed in as props). Confirm Ionicons `close-circle`/`checkmark-circle` valid.
Run: `npx expo lint 2>&1 | grep "(trip)"` → clean (fix any unused-var like the `t` in CenteredState).

- [ ] **Step 3: Commit**

```bash
git add "app/(trip)/[id].tsx"
git commit -m "feat(captain): live-trip screen (legs/call/navigate/cancel/rating/roster)"
```

---

## Task 11: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: tsc exit 0; lint 0 errors (pre-existing template warnings acceptable; no NEW Area-5 warnings).

- [ ] **Step 2: Live E2E — drive a fresh trip through all legs (paced)**

Run (single block; if 429, wait ~60s and re-run). This creates a trip via the rider, the captain accepts + drives it, exercising the exact endpoints the screen calls:
```bash
BASE=https://beeb.madebyhaithem.com
RIDER=$(curl -s -X POST $BASE/api/auth/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000099","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
CAP=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
TRIP=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $RIDER" -H 'Content-Type: application/json' -d '{"pickup_lat":33.30,"pickup_lng":44.55,"dropoff_lat":33.33,"dropoff_lng":44.60}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo "trip: ${TRIP:-<rider may have an active trip; reuse the queue offer>}"
curl -s -o /dev/null -w "online   [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"online":true}'
[ -z "$TRIP" ] && TRIP=$(curl -s $BASE/api/captain/trip-queue -H "Authorization: Bearer $CAP" | python3 -c "import sys,json;o=[x for x in json.load(sys.stdin).get('offers',[]) if x['offer_type']=='trip'];print(o[0]['id'] if o else '')")
echo "driving trip: $TRIP"
curl -s -o /dev/null -w "accept   [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/accept -H "Authorization: Bearer $CAP"
curl -s -o /dev/null -w "arrive   [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/arrive -H "Authorization: Bearer $CAP"
curl -s -o /dev/null -w "start    [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/start -H "Authorization: Bearer $CAP"
curl -s -o /dev/null -w "proxy    [%{http_code}]\n" $BASE/api/captain/trips/$TRIP/proxy -H "Authorization: Bearer $CAP"
curl -s -o /dev/null -w "complete [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/complete -H "Authorization: Bearer $CAP"
curl -s -o /dev/null -w "rate     [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/ratings -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"stars":5}'
curl -s -o /dev/null -w "offline  [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"online":false}'
```
Expected: accept/arrive/start/proxy/complete 200; rate 201 (or 409 if the captain already rated this trip on a re-run — acceptable). This is the exact leg + proxy + rating chain the screen drives. Note any non-2xx.

- [ ] **Step 3: Manual smoke (Expo Go), best-effort**

Accept a trip from the Queue (Area 4) → live screen → map renders with pickup/dropoff/route → "Arrived" → "Start" → "Complete" → completed summary → tap stars → Submit → back to tabs. Call opens the dialer with a masked number; Navigate opens Google Maps; Cancel (while accepted) shows the reason sheet. Record results.

- [ ] **Step 4: Final commit (only if smoke fixes were needed)**

```bash
git add -A && git commit -m "chore(captain): live-trip verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **Core legs + proxy already verified live** (2026-06-11). Cancel + rating verified in Task 11.
- **Multi-stop is gated** (BACKEND_ISSUES #7) — `getStops` returns `[]`; NO stops panel/component is built. Don't build `stops-list`.
- **`useCaptainPresence()` is destructured** (`{ lastTripUpdate }`) — not a selector.
- **Navigate/route target** = pickup while `accepted`, dropoff once `in_progress`.
- **Rating skip** — `onSubmitRating` rates only if `stars > 0`, ignores a 409 (already rated), then returns to tabs. Both Submit and Skip route to tabs.
- **Ionicons names** (`star`/`star-outline`, `call`, `navigate`, `close-circle`, `checkmark-circle`) — tsc (the `Icon` name union) flags any invalid one; substitute the nearest valid.
- **`CenteredState` unused `t`** — if the helper doesn't use `t`, remove the `useTranslation()` line to satisfy lint (labels come in as props).
- **`TripMap`** is reused as-is; pass `showsUserLocation={false}` since we render the captain via the `driver` marker.
- **Rate limit:** pace the live checks; a deferred WS/abriyah-roster live check is acceptable (the core chain is verified).
