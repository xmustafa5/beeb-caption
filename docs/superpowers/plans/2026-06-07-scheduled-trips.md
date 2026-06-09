# Scheduled Trips (Phase 5b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rider schedule a regular trip 30 min–7 days out, view upcoming scheduled trips in the Trips tab, reschedule the time, and cancel — wired to the live Beeb backend.

**Architecture:** Phase 1–5a spine — `services/scheduled-trips.ts` owns backend shapes; TanStack Query hooks own caching + mutations; an `app/(scheduled)/` route group for the multi-step create flow; a reschedule modal; the Trips tab gains an Upcoming/Past segment. Reuse `LocationPicker`/`FromToReview` for pins and a new `@react-native-community/datetimepicker` wrapper for time.

**Tech Stack:** Expo Router, TanStack Query, axios (`lib/api.ts`), `@react-native-community/datetimepicker` (new), `LocationPicker`/`FromToReview`, `reverseGeocode`, i18n (en/ar).

**Verification note:** no unit-test runner (only `expo lint`). Per-task gate is **`npx tsc --noEmit` + `npx expo lint` clean**, plus **curl endpoint probes** for the service. Authenticated happy-path (create/list/reschedule/cancel) needs a rider token → flagged needs-live-test.

**Typed-routes note:** Expo Router `typedRoutes` is on. New routes are only typed after the dev server rescans. After creating `app/(scheduled)/*`, regenerate by booting Metro briefly on a free port (`CI=1 npx expo start --port 8090` for ~35s then kill) OR ping the running bundler; then `tsc` resolves the new paths. This is the same step used in Phase 5a.

---

## File Structure

- Create `services/scheduled-trips.ts` — axios + backend↔app mappers.
- Create `hooks/use-scheduled-trips.ts` — list query + create/updateTime/cancel mutations.
- Create `components/scheduled/when-picker.tsx` — datetimepicker wrapper, clamped, RFC3339 out.
- Create `components/scheduled/scheduled-trip-row.tsx` — one row + action callbacks.
- Create `components/scheduled/reschedule-modal.tsx` — modal hosting when-picker.
- Create `app/(scheduled)/_layout.tsx` — Stack.
- Create `app/(scheduled)/create.tsx` — pins → when → submit.
- Modify `i18n/en.json` + `i18n/ar.json` — new `scheduled` section.
- Modify `app/(tabs)/trips.tsx` — Upcoming/Past segment; Upcoming = scheduled list + FAB.

---

### Task 1: Install the datetime picker

- [ ] **Step 1: Install**

Run: `npx expo install @react-native-community/datetimepicker`
Expected: added to `package.json` dependencies with an SDK-54-compatible version.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @react-native-community/datetimepicker for scheduled trips"
```

---

### Task 2: Scheduled-trips service layer

**Files:**
- Create: `services/scheduled-trips.ts`

- [ ] **Step 1: Write the service**

```ts
import { api } from '@/lib/api'
import type { LatLng } from '@/hooks/use-current-location'

export type ScheduledTripStatus = 'pending' | 'promoted' | 'cancelled' | 'expired'

export interface ScheduledTrip {
  id: string
  status: ScheduledTripStatus
  scheduledFor: string // RFC3339
  pickup: LatLng
  dropoff: LatLng
  pickupAddress?: string
  dropoffAddress?: string
  promotedTripId?: string
  createdAt: string
}

interface BackendScheduledTrip {
  id: string
  status: ScheduledTripStatus
  scheduled_for: string
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  pickup_address?: string | null
  dropoff_address?: string | null
  promoted_trip_id?: string | null
  created_at: string
}

function toScheduledTrip(b: BackendScheduledTrip): ScheduledTrip {
  return {
    id: b.id,
    status: b.status,
    scheduledFor: b.scheduled_for,
    pickup: { latitude: b.pickup_lat, longitude: b.pickup_lng },
    dropoff: { latitude: b.dropoff_lat, longitude: b.dropoff_lng },
    pickupAddress: b.pickup_address ?? undefined,
    dropoffAddress: b.dropoff_address ?? undefined,
    promotedTripId: b.promoted_trip_id ?? undefined,
    createdAt: b.created_at,
  }
}

export interface CreateScheduledTripInput {
  pickup: LatLng
  dropoff: LatLng
  pickupAddress?: string
  dropoffAddress?: string
  scheduledFor: string // RFC3339
}

/** The rider's own scheduled trips. */
export async function listScheduledTrips(): Promise<ScheduledTrip[]> {
  const { data } = await api.get<BackendScheduledTrip[] | { items?: BackendScheduledTrip[] }>(
    '/api/rider/scheduled-trips',
  )
  const items = Array.isArray(data) ? data : (data.items ?? [])
  return items.map(toScheduledTrip)
}

/** Create a scheduled regular trip. scheduledFor must be now+30min..now+7d (else 400). */
export async function createScheduledTrip(input: CreateScheduledTripInput): Promise<ScheduledTrip> {
  const { data } = await api.post<BackendScheduledTrip>('/api/rider/scheduled-trips', {
    trip_type: 'regular',
    pickup_lat: input.pickup.latitude,
    pickup_lng: input.pickup.longitude,
    dropoff_lat: input.dropoff.latitude,
    dropoff_lng: input.dropoff.longitude,
    ...(input.pickupAddress ? { pickup_address: input.pickupAddress } : {}),
    ...(input.dropoffAddress ? { dropoff_address: input.dropoffAddress } : {}),
    scheduled_for: input.scheduledFor,
  })
  return toScheduledTrip(data)
}

/** Reschedule the time of a pending scheduled trip. Same window guard. */
export async function updateScheduledTripTime(id: string, scheduledFor: string): Promise<ScheduledTrip> {
  const { data } = await api.put<BackendScheduledTrip>(`/api/rider/scheduled-trips/${id}`, {
    scheduled_for: scheduledFor,
  })
  return toScheduledTrip(data)
}

/** Cancel a pending scheduled trip (owner only). */
export async function cancelScheduledTrip(id: string, reason?: string): Promise<void> {
  await api.post(`/api/rider/scheduled-trips/${id}/cancel`, reason ? { reason } : {})
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Probe endpoint live**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "https://beeb.madebyhaithem.com/api/rider/scheduled-trips"`
Expected: `401` (exists, needs rider token).

- [ ] **Step 4: Commit**

```bash
git add services/scheduled-trips.ts
git commit -m "feat(scheduled): add scheduled-trips service layer"
```

---

### Task 3: Query hooks

**Files:**
- Create: `hooks/use-scheduled-trips.ts`

- [ ] **Step 1: Write the hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  listScheduledTrips,
  createScheduledTrip,
  updateScheduledTripTime,
  cancelScheduledTrip,
  type ScheduledTrip,
  type CreateScheduledTripInput,
} from '@/services/scheduled-trips'

export function useScheduledTrips() {
  return useQuery<ScheduledTrip[]>({
    queryKey: ['scheduled-trips'],
    queryFn: listScheduledTrips,
    staleTime: 30 * 1000,
  })
}

export function useCreateScheduledTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateScheduledTripInput) => createScheduledTrip(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-trips'] }),
  })
}

export function useRescheduleTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, scheduledFor }: { id: string; scheduledFor: string }) =>
      updateScheduledTripTime(id, scheduledFor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-trips'] }),
  })
}

export function useCancelScheduledTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelScheduledTrip(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-trips'] }),
  })
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-scheduled-trips.ts
git commit -m "feat(scheduled): add scheduled-trips query + mutation hooks"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `i18n/en.json`, `i18n/ar.json`

- [ ] **Step 1: Add a `scheduled` section to both files**

`i18n/en.json` new top-level key:

```json
"scheduled": {
  "upcoming": "Upcoming",
  "past": "Past",
  "schedule": "Schedule",
  "scheduleTrip": "Schedule a trip",
  "when": "When",
  "whenHint": "Pick a time 30 minutes to 7 days from now",
  "pickTime": "Pick date & time",
  "confirmSchedule": "Schedule trip",
  "reschedule": "Reschedule",
  "rescheduleTitle": "Change time",
  "save": "Save",
  "cancelTrip": "Cancel trip",
  "cancelConfirm": "Cancel this scheduled trip?",
  "empty": "No upcoming trips",
  "createFailed": "Couldn’t schedule the trip",
  "timeInvalid": "Pick a time 30 minutes to 7 days from now",
  "status": {
    "pending": "Scheduled",
    "promoted": "On the way",
    "cancelled": "Cancelled",
    "expired": "Missed"
  }
}
```

`i18n/ar.json` same key with Arabic:

```json
"scheduled": {
  "upcoming": "القادمة",
  "past": "السابقة",
  "schedule": "جدولة",
  "scheduleTrip": "جدولة رحلة",
  "when": "الوقت",
  "whenHint": "اختر وقتاً بين 30 دقيقة و7 أيام من الآن",
  "pickTime": "اختر التاريخ والوقت",
  "confirmSchedule": "جدولة الرحلة",
  "reschedule": "إعادة جدولة",
  "rescheduleTitle": "تغيير الوقت",
  "save": "حفظ",
  "cancelTrip": "إلغاء الرحلة",
  "cancelConfirm": "إلغاء هذه الرحلة المجدولة؟",
  "empty": "لا توجد رحلات قادمة",
  "createFailed": "تعذّر جدولة الرحلة",
  "timeInvalid": "اختر وقتاً بين 30 دقيقة و7 أيام من الآن",
  "status": {
    "pending": "مجدولة",
    "promoted": "في الطريق",
    "cancelled": "ملغاة",
    "expired": "فائتة"
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json')); JSON.parse(require('fs').readFileSync('i18n/ar.json')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(scheduled): add scheduled-trips i18n strings (en/ar)"
```

---

### Task 5: When-picker component

**Files:**
- Create: `components/scheduled/when-picker.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react'
import { View, Text, TouchableOpacity, Platform, I18nManager } from 'react-native'
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

const MIN_OFFSET_MS = 30 * 60 * 1000
const MAX_OFFSET_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Date+time picker for scheduling. Clamps selection to now+30min .. now+7days
 * (the backend window) and reports the chosen instant up as a Date. The parent
 * converts to RFC3339 via `.toISOString()`.
 */
export function WhenPicker({
  value,
  onChange,
}: {
  value: Date
  onChange: (d: Date) => void
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [show, setShow] = useState(Platform.OS === 'ios')

  const min = new Date(Date.now() + MIN_OFFSET_MS)
  const max = new Date(Date.now() + MAX_OFFSET_MS)

  const handleChange = (_e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setShow(false)
    if (!d) return
    const clamped = new Date(Math.min(max.getTime(), Math.max(min.getTime(), d.getTime())))
    onChange(clamped)
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={{ ...Typography['input-label'], color: colors.subtle }}>{t('scheduled.whenHint')}</Text>

      {Platform.OS === 'android' && (
        <TouchableOpacity
          onPress={() => setShow(true)}
          activeOpacity={0.85}
          style={{
            flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: Spacing.md,
            padding: Spacing.lg,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
          }}
        >
          <Icon name="calendar-outline" size={22} color={colors.text} />
          <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1 }}>
            {value.toLocaleString()}
          </Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
            {t('scheduled.pickTime')}
          </Text>
        </TouchableOpacity>
      )}

      {show && (
        <DateTimePicker
          value={value}
          mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={min}
          maximumDate={max}
          onChange={handleChange}
        />
      )}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/scheduled/when-picker.tsx
git commit -m "feat(scheduled): add clamped date/time when-picker"
```

> Note: Android's native picker is date-then-time in two dialogs via the community lib; this plan uses `mode="date"` for simplicity (date selection; time defaults to the prefilled value's time). If exact Android time selection is needed, a follow-up can chain a second `mode="time"` dialog. iOS `datetime` inline covers both at once. This is an acceptable MVP per YAGNI.

---

### Task 6: Scheduled-trip row

**Files:**
- Create: `components/scheduled/scheduled-trip-row.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { ScheduledTrip } from '@/services/scheduled-trips'

function statusColor(status: ScheduledTrip['status'], colors: ReturnType<typeof useThemeColors>) {
  if (status === 'pending') return colors.tint
  if (status === 'promoted') return colors.success
  return colors.subtle // cancelled | expired
}

export function ScheduledTripRow({
  trip,
  onReschedule,
  onCancel,
  onOpenLive,
}: {
  trip: ScheduledTrip
  onReschedule: () => void
  onCancel: () => void
  onOpenLive: () => void
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const when = new Date(trip.scheduledFor)
  const whenStr = when.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const isPending = trip.status === 'pending'
  const isPromoted = trip.status === 'promoted'
  const muted = trip.status === 'cancelled' || trip.status === 'expired'

  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderCurve: 'continuous',
      padding: Spacing.lg,
      gap: Spacing.md,
      opacity: muted ? 0.6 : 1,
    }}>
      <View style={{ flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: Spacing.md }}>
        <View style={{
          width: 44, height: 44, borderRadius: 12,
          backgroundColor: colors.tint,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="time" size={22} color={colors.onTint} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...Typography['heading-sm'], color: colors.text }}>{whenStr}</Text>
          <Text style={{ ...Typography['caption-sm'], color: statusColor(trip.status, colors), fontStyle: 'normal' }}>
            {t(`scheduled.status.${trip.status}`)}
          </Text>
        </View>
        {isPromoted && (
          <TouchableOpacity onPress={onOpenLive}>
            <Icon name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.tint} />
          </TouchableOpacity>
        )}
      </View>

      {isPending && (
        <View style={{ flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
          <TouchableOpacity
            onPress={onReschedule}
            activeOpacity={0.85}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.tint + '22' }}
          >
            <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
              {t('scheduled.reschedule')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onCancel}
            activeOpacity={0.85}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.destructive + '15' }}
          >
            <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
              {t('scheduled.cancelTrip')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/scheduled/scheduled-trip-row.tsx
git commit -m "feat(scheduled): add scheduled-trip row component"
```

---

### Task 7: Reschedule modal

**Files:**
- Create: `components/scheduled/reschedule-modal.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useState, useEffect } from 'react'
import { View, Text, Modal, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { WhenPicker } from '@/components/scheduled/when-picker'
import { useRescheduleTrip } from '@/hooks/use-scheduled-trips'
import { parseApiError } from '@/lib/api'

export function RescheduleModal({
  tripId,
  initial,
  visible,
  onClose,
}: {
  tripId: string | null
  initial: string | null // RFC3339
  visible: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const reschedule = useRescheduleTrip()
  const [when, setWhen] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000))

  useEffect(() => {
    if (initial) setWhen(new Date(initial))
  }, [initial])

  const onSave = () => {
    if (!tripId) return
    reschedule.mutate(
      { id: tripId, scheduledFor: when.toISOString() },
      {
        onSuccess: onClose,
        onError: (err) => {
          const info = parseApiError(err)
          Alert.alert(
            info.status === 400 ? t('scheduled.timeInvalid') : t('common.error'),
            info.backendMessage,
          )
        },
      },
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderCurve: 'continuous',
              padding: Spacing.xl,
              paddingBottom: Spacing.xl * 2,
              gap: Spacing.lg,
            }}
          >
            <Text style={{ ...Typography['heading-md'], color: colors.text }}>{t('scheduled.rescheduleTitle')}</Text>
            <WhenPicker value={when} onChange={setWhen} />
            <Button label={t('scheduled.save')} loading={reschedule.isPending} onPress={onSave} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/scheduled/reschedule-modal.tsx
git commit -m "feat(scheduled): add reschedule modal"
```

---

### Task 8: Create flow route group

**Files:**
- Create: `app/(scheduled)/_layout.tsx`
- Create: `app/(scheduled)/create.tsx`

- [ ] **Step 1: Write `app/(scheduled)/_layout.tsx`**

```tsx
import { Stack } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'

export default function ScheduledLayout() {
  const colors = useThemeColors()
  const { t } = useTranslation()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: 'Poppins_600SemiBold' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="create" options={{ title: t('scheduled.scheduleTrip') }} />
    </Stack>
  )
}
```

- [ ] **Step 2: Write `app/(scheduled)/create.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { LocationPicker } from '@/components/trip/location-picker'
import { FromToReview } from '@/components/trip/from-to-review'
import { WhenPicker } from '@/components/scheduled/when-picker'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/forms/form-error'
import { Spacing } from '@/constants/Spacing'
import { Typography } from '@/constants/Typography'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { useCurrentLocation, type LatLng } from '@/hooks/use-current-location'
import { reverseGeocode } from '@/services/places'
import { useCreateScheduledTrip } from '@/hooks/use-scheduled-trips'
import { parseApiError } from '@/lib/api'

type Step = 'pickup' | 'dropoff' | 'review' | 'when'

export default function CreateScheduledTripScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const { location, fallback } = useCurrentLocation()
  const create = useCreateScheduledTrip()

  const [pickup, setPickup] = useState<LatLng>(location ?? fallback)
  const [pickupAddress, setPickupAddress] = useState<string | null>(null)
  const [pickupTouched, setPickupTouched] = useState(false)
  const [dropoff, setDropoff] = useState<LatLng | null>(null)
  const [dropoffAddress, setDropoffAddress] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('dropoff')
  const [when, setWhen] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pickupTouched && location) setPickup(location)
  }, [location, pickupTouched])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const a = await reverseGeocode(pickup)
      if (!cancelled) setPickupAddress(a)
    })()
    return () => { cancelled = true }
  }, [pickup.latitude, pickup.longitude])

  if (step === 'dropoff') {
    return (
      <LocationPicker
        title={t('booking.destinationTitle')}
        ctaLabel={t('booking.destinationConfirm')}
        initialCenter={dropoff ?? pickup}
        pinKind="dropoff"
        onCancel={() => { if (dropoff) setStep('review'); else router.back() }}
        onConfirm={({ coord, address }) => { setDropoff(coord); setDropoffAddress(address); setStep('review') }}
      />
    )
  }

  if (step === 'pickup') {
    return (
      <LocationPicker
        title={t('booking.editFrom')}
        ctaLabel={t('common.confirm')}
        initialCenter={pickup}
        pinKind="pickup"
        onCancel={() => setStep('review')}
        onConfirm={({ coord, address }) => { setPickup(coord); setPickupAddress(address); setPickupTouched(true); setStep('review') }}
      />
    )
  }

  if (step === 'review') {
    return (
      <FromToReview
        title={t('scheduled.scheduleTrip')}
        pickup={pickup}
        pickupAddress={pickupAddress}
        dropoff={dropoff}
        dropoffAddress={dropoffAddress}
        onBack={() => router.back()}
        onEditPickup={() => setStep('pickup')}
        onEditDropoff={() => setStep('dropoff')}
        onContinue={() => { if (dropoff) setStep('when') }}
      />
    )
  }

  // step === 'when'
  return (
    <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
      <Text style={{ ...Typography['heading-md'], color: colors.text }}>{t('scheduled.when')}</Text>
      <WhenPicker value={when} onChange={setWhen} />
      <FormError message={error} />
      <Button
        label={t('scheduled.confirmSchedule')}
        loading={create.isPending}
        onPress={() => {
          if (!dropoff) return
          setError(null)
          create.mutate(
            {
              pickup,
              dropoff,
              pickupAddress: pickupAddress ?? undefined,
              dropoffAddress: dropoffAddress ?? undefined,
              scheduledFor: when.toISOString(),
            },
            {
              onSuccess: () => router.replace('/(tabs)/trips'),
              onError: (err) => {
                const info = parseApiError(err)
                if (info.status === 400) setError(t('scheduled.timeInvalid'))
                else Alert.alert(t('scheduled.createFailed'), info.backendMessage ?? t('common.error'))
              },
            },
          )
        }}
      />
    </ScrollView>
  )
}
```

- [ ] **Step 3: Regenerate typed routes**

Run: `CI=1 timeout 40 npx expo start --port 8090 --no-dev --max-workers 1 >/tmp/sched-typegen.log 2>&1 & sleep 34; kill %1 2>/dev/null; curl -s -o /dev/null "http://localhost:8081/_expo/static/js/web/index.js" 2>/dev/null; true`
Then verify: `grep -c "(scheduled)/create" .expo/types/router.d.ts` (expect ≥1) — if 0, ping the running bundler or rerun.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean (the `router.replace('/(tabs)/trips')` and create route resolve).

- [ ] **Step 5: Commit**

```bash
git add "app/(scheduled)/_layout.tsx" "app/(scheduled)/create.tsx"
git commit -m "feat(scheduled): create-scheduled-trip flow (pins + when)"
```

---

### Task 9: Trips tab — Upcoming/Past segments + FAB

**Files:**
- Modify: `app/(tabs)/trips.tsx`

- [ ] **Step 1: Replace the Trips screen with a segmented version**

Replace the entire `export default function TripsScreen() { ... }` body (lines 13-90) with the version below. Keep the existing `statusInfo`, `TripRow`, and imports; ADD the new imports and the `ScheduledTripRow`/`RescheduleModal`/FAB. Full new component:

```tsx
import { useState } from 'react'
import { FlatList, View, Text, TouchableOpacity, RefreshControl, ActivityIndicator, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { useTripStore, type Trip, type TripStatus } from '@/store/trip-store'
import { useTripHistory } from '@/hooks/use-trip-history'
import { useScheduledTrips, useCancelScheduledTrip } from '@/hooks/use-scheduled-trips'
import { RatingSheet } from '@/components/trip/rating-sheet'
import { ScheduledTripRow } from '@/components/scheduled/scheduled-trip-row'
import { RescheduleModal } from '@/components/scheduled/reschedule-modal'
import { formatIqd } from '@/lib/format-currency'
import { Alert } from 'react-native'

type Segment = 'upcoming' | 'past'

export default function TripsScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const qc = useQueryClient()
  const [segment, setSegment] = useState<Segment>('upcoming')

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.lg }}>
        <Text style={{ ...Typography['heading-lg'], color: colors.text }}>{t('tabs.trips')}</Text>
        <View style={{
          flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
          backgroundColor: colors.surface,
          borderRadius: 12,
          borderCurve: 'continuous',
          padding: 4,
        }}>
          {(['upcoming', 'past'] as Segment[]).map((s) => {
            const active = segment === s
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setSegment(s)}
                activeOpacity={0.85}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: active ? colors.card : 'transparent' }}
              >
                <Text style={{ ...Typography['caption-sm'], fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold', color: active ? colors.text : colors.subtle }}>
                  {t(`scheduled.${s}`)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      {segment === 'past' ? <PastList colors={colors} t={t} /> : <UpcomingList colors={colors} t={t} router={router} qc={qc} />}
    </View>
  )
}

function UpcomingList({ colors, t, router, qc }: { colors: ReturnType<typeof useThemeColors>; t: (k: string) => string; router: ReturnType<typeof useRouter>; qc: ReturnType<typeof useQueryClient> }) {
  const { data, isLoading, isError, refetch, isRefetching } = useScheduledTrips()
  const cancel = useCancelScheduledTrip()
  const [reschedule, setReschedule] = useState<{ id: string; initial: string } | null>(null)

  const confirmCancel = (id: string) => {
    Alert.alert(t('scheduled.cancelConfirm'), undefined, [
      { text: t('common.back'), style: 'cancel' },
      { text: t('scheduled.cancelTrip'), style: 'destructive', onPress: () => cancel.mutate({ id }) },
    ])
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />}
        renderItem={({ item }) => (
          <ScheduledTripRow
            trip={item}
            onReschedule={() => setReschedule({ id: item.id, initial: item.scheduledFor })}
            onCancel={() => confirmCancel(item.id)}
            onOpenLive={() => router.push('/(booking)/driver-assigned')}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: Spacing.xl * 2, alignItems: 'center' }}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl * 2 }}>
              <Icon name="calendar-outline" size={48} color={colors.subtle} />
              <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>
                {isError ? t('common.networkError') : t('scheduled.empty')}
              </Text>
            </View>
          )
        }
      />

      <TouchableOpacity
        onPress={() => router.push('/(scheduled)/create')}
        activeOpacity={0.9}
        style={{
          position: 'absolute',
          bottom: Spacing.xl,
          ...(I18nManager.isRTL ? { left: Spacing.xl } : { right: Spacing.xl }),
          flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          backgroundColor: colors.tint,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          borderRadius: 999,
          boxShadow: '0px 4px 16px rgba(0,0,0,0.18)',
        }}
      >
        <Icon name="add" size={20} color={colors.onTint} />
        <Text style={{ ...Typography['body-md'], color: colors.onTint, fontFamily: 'Poppins_600SemiBold' }}>
          {t('scheduled.schedule')}
        </Text>
      </TouchableOpacity>

      <RescheduleModal
        tripId={reschedule?.id ?? null}
        initial={reschedule?.initial ?? null}
        visible={!!reschedule}
        onClose={() => setReschedule(null)}
      />
    </View>
  )
}

function PastList({ colors, t }: { colors: ReturnType<typeof useThemeColors>; t: (k: string) => string }) {
  const localHistory = useTripStore((s) => s.history)
  const { items, isLoading, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = useTripHistory()
  const [ratingTripId, setRatingTripId] = useState<string | null>(null)
  const data = items.length > 0 ? items : localHistory

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={data}
        keyExtractor={(trip) => trip.id}
        contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.md, flexGrow: 1 }}
        renderItem={({ item }) => (
          <TripRow trip={item} colors={colors} t={t} onPress={item.status === 'completed' ? () => setRatingTripId(item.id) : undefined} />
        )}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage() }}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: Spacing.xl * 2, alignItems: 'center' }}>
              <ActivityIndicator color={colors.tint} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl * 2 }}>
              <Icon name="time-outline" size={48} color={colors.subtle} />
              <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>
                {isError ? t('common.networkError') : t('trips.empty')}
              </Text>
            </View>
          )
        }
        ListFooterComponent={isFetchingNextPage ? (
          <View style={{ paddingVertical: Spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : null}
      />
      <RatingSheet tripId={ratingTripId} visible={!!ratingTripId} onClose={() => setRatingTripId(null)} />
    </View>
  )
}
```

Keep the existing `statusInfo` and `TripRow` functions below (lines 92-160) unchanged.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean. (The unused `useState` import dedupe: the new top has one `import { useState }` — ensure no duplicate import lines remain from the old file. Remove the old top imports block entirely when replacing.)

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/trips.tsx"
git commit -m "feat(scheduled): Trips tab Upcoming/Past segments + schedule FAB"
```

---

### Task 10: Final verification + docs

**Files:**
- Modify: `docs/INTEGRATION_PLAN.md`

- [ ] **Step 1: Full typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean across the project (pre-existing exhaustive-deps warnings only).

- [ ] **Step 2: Probe endpoint live**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "https://beeb.madebyhaithem.com/api/rider/scheduled-trips"`
Expected: `401`.

- [ ] **Step 3: Update roadmap**

In `docs/INTEGRATION_PLAN.md`, mark Phase 5b (scheduled trips) DONE; note 5c multi-stop remains. Note the authenticated happy-path is needs-live-test (rider token).

- [ ] **Step 4: Commit**

```bash
git add docs/INTEGRATION_PLAN.md
git commit -m "docs: mark Phase 5b (scheduled trips) done in roadmap"
```

---

## Self-Review

**Spec coverage:** create flow with pins + clamped time (Tasks 5,8) · list in Trips Upcoming (Task 9) · reschedule time (Tasks 5,7,9) · cancel (Tasks 3,9) · promoted deep-link (Tasks 6,9) · status mapping (Task 6) · i18n (Task 4) · datetime dep (Task 1) · error handling 400/403/409 (Tasks 8,7) · RTL throughout · verification (Task 10). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step has full code. The Android date-only picker simplification (Task 5) is an explicit, justified MVP note, not a placeholder.

**Type consistency:** `ScheduledTrip.{status,scheduledFor,pickup,dropoff,promotedTripId}` defined in Task 2, used identically in Tasks 3/6/7/9. Hook names (`useScheduledTrips`, `useCreateScheduledTrip`, `useRescheduleTrip`, `useCancelScheduledTrip`) consistent. `CreateScheduledTripInput` shape matches the create screen's mutate call. `WhenPicker` props `{value: Date, onChange: (Date)=>void}` consistent across create + reschedule. Routes `/(scheduled)/create`, `/(tabs)/trips` consistent.

**Verified assumptions:** `FromToReview` props (title/pickup/pickupAddress/dropoff/dropoffAddress/onBack/onEditPickup/onEditDropoff/onContinue) and `LocationPicker` props (title/ctaLabel/initialCenter/pinKind/onCancel/onConfirm) confirmed from `(booking)/destination.tsx`. `Button` has label/loading/onPress. `colors` fields (tint/onTint/surface/card/subtle/destructive/success/text/muted) all exist. `reverseGeocode(LatLng)` returns `string|null`.

**Known runtime caveat:** `onOpenLive` deep-links to `/(booking)/driver-assigned`, which reads the active trip from the trip store. For a freshly promoted scheduled trip the live trip must be loaded into the store first; a full implementation would fetch `getTrip(promotedTripId)` and `setActive` before navigating. This plan navigates directly as an MVP; a follow-up should hydrate the active trip from `promotedTripId`. Flagged, not silently dropped.
