# Multi-Stop (Phase 5c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a rider add up to 3 stops to an active regular trip and watch each stop's pending/reached state — wired to the live Beeb backend.

**Architecture:** Phase 1–5b spine — `services/trip-stops.ts` owns backend shapes; a TanStack Query hook owns caching + a 10s poll + the add mutation; a shared `StopsPanel` renders on the two live-trip screens; `TripMap` gains a `stops` marker prop. Reuse `LocationPicker` for the pin.

**Tech Stack:** Expo Router, TanStack Query, axios (`lib/api.ts`), `LocationPicker`/`TripMap`, `reverseGeocode`, i18n. No new dependency, no new route group.

**Verification note:** no unit-test runner (only `expo lint`). Per-task gate is **`npx tsc --noEmit` + `npx expo lint` clean** + **curl probe**. Full add happy-path needs an accepted/in_progress trip (a captain must accept) — flagged needs-captain-side; the endpoint + state guard can still be validated (POST to a non-accepted trip → 400).

---

## File Structure

- Create `services/trip-stops.ts` — GET/POST + mapper.
- Create `hooks/use-trip-stops.ts` — `useQuery(['stops', tripId])` polling + add mutation.
- Create `components/trip/stops-panel.tsx` — list + add button.
- Modify `components/trip/trip-map.tsx` — add a `stops?: LatLng[]` marker prop.
- Modify `i18n/en.json` + `i18n/ar.json` — `stops` section.
- Modify `app/(booking)/driver-assigned.tsx` + `app/(booking)/in-progress.tsx` — render panel, add-stop overlay, feed map.

---

### Task 1: Trip-stops service layer

**Files:**
- Create: `services/trip-stops.ts`

- [ ] **Step 1: Write the service**

```ts
import { api } from '@/lib/api'
import type { LatLng } from '@/hooks/use-current-location'

export type StopStatus = 'pending' | 'reached' | 'skipped'

export interface TripStop {
  id: string
  seq: number
  lat: number
  lng: number
  address?: string
  status: StopStatus
  reachedAt?: string
}

interface BackendTripStop {
  id: string
  trip_id: string
  seq: number
  lat: number
  lng: number
  address?: string | null
  status: StopStatus
  reached_at?: string | null
  created_at: string
}

function toStop(b: BackendTripStop): TripStop {
  return {
    id: b.id,
    seq: b.seq,
    lat: b.lat,
    lng: b.lng,
    address: b.address ?? undefined,
    status: b.status,
    reachedAt: b.reached_at ?? undefined,
  }
}

/** Stops on a rider's trip, ordered by seq. */
export async function listTripStops(tripId: string): Promise<TripStop[]> {
  const { data } = await api.get<BackendTripStop[] | { items?: BackendTripStop[] }>(
    `/api/rider/trips/${tripId}/stops`,
  )
  const items = Array.isArray(data) ? data : (data.items ?? [])
  return items.map(toStop).sort((a, b) => a.seq - b.seq)
}

/** Add a stop (max 3; trip must be regular + accepted/in_progress, else 400/409). */
export async function addTripStop(
  tripId: string,
  coord: LatLng,
  address?: string,
): Promise<TripStop> {
  const { data } = await api.post<BackendTripStop>(`/api/rider/trips/${tripId}/stops`, {
    lat: coord.latitude,
    lng: coord.longitude,
    ...(address ? { address } : {}),
  })
  return toStop(data)
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Probe endpoint live**

Run: `curl -s -o /dev/null -w "%{http_code}\n" "https://beeb.madebyhaithem.com/api/rider/trips/00000000-0000-0000-0000-000000000000/stops"`
Expected: `401` (exists, needs rider token).

- [ ] **Step 4: Commit**

```bash
git add services/trip-stops.ts
git commit -m "feat(stops): add trip-stops service layer"
```

---

### Task 2: Query + mutation hook

**Files:**
- Create: `hooks/use-trip-stops.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listTripStops, addTripStop, type TripStop } from '@/services/trip-stops'
import type { LatLng } from '@/hooks/use-current-location'

/**
 * Stops for a live trip. Polls every 10s while `live` so captain-marked `reached`
 * state surfaces without rider action. `live` should be false on terminal status.
 */
export function useTripStops(tripId: string | undefined, live: boolean) {
  const qc = useQueryClient()

  const query = useQuery<TripStop[]>({
    queryKey: ['stops', tripId],
    queryFn: () => listTripStops(tripId as string),
    enabled: !!tripId,
    refetchInterval: live ? 10000 : false,
    staleTime: 5000,
  })

  const add = useMutation({
    mutationFn: ({ coord, address }: { coord: LatLng; address?: string }) =>
      addTripStop(tripId as string, coord, address),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stops', tripId] }),
  })

  return { ...query, stops: query.data ?? [], add }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add hooks/use-trip-stops.ts
git commit -m "feat(stops): add use-trip-stops hook (poll + add mutation)"
```

---

### Task 3: i18n strings

**Files:**
- Modify: `i18n/en.json`, `i18n/ar.json`

- [ ] **Step 1: Add a `stops` section to both files**

`i18n/en.json` new top-level key:

```json
"stops": {
  "title": "Stops",
  "addStop": "Add stop",
  "maxReached": "You can add up to 3 stops",
  "addFailed": "Couldn’t add the stop",
  "pickStop": "Set stop location",
  "status": {
    "pending": "Pending",
    "reached": "Reached",
    "skipped": "Skipped"
  }
}
```

`i18n/ar.json` same key:

```json
"stops": {
  "title": "المحطات",
  "addStop": "إضافة محطة",
  "maxReached": "يمكنك إضافة حتى 3 محطات",
  "addFailed": "تعذّر إضافة المحطة",
  "pickStop": "تحديد موقع المحطة",
  "status": {
    "pending": "قيد الانتظار",
    "reached": "تم الوصول",
    "skipped": "تم التخطي"
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json')); JSON.parse(require('fs').readFileSync('i18n/ar.json')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(stops): add stops i18n strings (en/ar)"
```

---

### Task 4: TripMap stops marker prop

**Files:**
- Modify: `components/trip/trip-map.tsx`

- [ ] **Step 1: Add a `stops` prop and render numbered markers**

In `interface TripMapProps`, after `pickups?: LatLng[]`, add:

```ts
  stops?: LatLng[]
```

In the destructured params (after `pickups,`), add `stops,`.

In the JSX, after the `pickups?.map(...)` block, add:

```tsx
        {stops?.map((s, i) => (
          <Marker key={`stop-${i}`} coordinate={s} pinColor={colors.info} title={`Stop ${i + 1}`} />
        ))}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/trip/trip-map.tsx
git commit -m "feat(stops): render stop markers on TripMap"
```

---

### Task 5: Stops panel component

**Files:**
- Create: `components/trip/stops-panel.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { TripStop } from '@/services/trip-stops'

const MAX_STOPS = 3

export function StopsPanel({
  stops,
  tripType,
  onAddStop,
}: {
  stops: TripStop[]
  tripType: 'regular' | 'abriyah'
  onAddStop: () => void
}) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  // Abriyah trips don't support stops; only regular do.
  if (tripType !== 'regular') return null

  const canAdd = stops.length < MAX_STOPS

  return (
    <View style={{ gap: Spacing.sm }}>
      {stops.length > 0 && (
        <View style={{ gap: Spacing.xs }}>
          {stops.map((s) => {
            const reached = s.status === 'reached'
            const skipped = s.status === 'skipped'
            const muted = reached || skipped
            return (
              <View
                key={s.id}
                style={{
                  flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  gap: Spacing.md,
                }}
              >
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  backgroundColor: reached ? colors.success : colors.tint,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {reached ? (
                    <Icon name="checkmark" size={14} color={colors.onTint} />
                  ) : (
                    <Text style={{ ...Typography['caption-sm'], color: colors.onTint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
                      {s.seq}
                    </Text>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    ...Typography['caption-sm'],
                    flex: 1,
                    color: muted ? colors.subtle : colors.text,
                    fontStyle: 'normal',
                    textDecorationLine: muted ? 'line-through' : 'none',
                  }}
                >
                  {s.address ?? `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`}
                </Text>
                {(reached || skipped) && (
                  <Text style={{ ...Typography['micro'], color: colors.subtle, fontStyle: 'normal' }}>
                    {t(`stops.status.${s.status}`)}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      )}

      {canAdd && (
        <TouchableOpacity
          onPress={onAddStop}
          activeOpacity={0.85}
          style={{
            flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 10,
            borderRadius: 12,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
          }}
        >
          <Icon name="add" size={18} color={colors.text} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
            {t('stops.addStop')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean. (`Typography['micro']` exists per the design system; if not, fall back to `'caption-sm'`.)

- [ ] **Step 3: Commit**

```bash
git add components/trip/stops-panel.tsx
git commit -m "feat(stops): add stops panel component"
```

---

### Task 6: Wire into driver-assigned.tsx

**Files:**
- Modify: `app/(booking)/driver-assigned.tsx`

- [ ] **Step 1: Add imports**

After the existing imports, add:

```tsx
import { useState } from 'react'
import { LocationPicker } from '@/components/trip/location-picker'
import { StopsPanel } from '@/components/trip/stops-panel'
import { useTripStops } from '@/hooks/use-trip-stops'
import { reverseGeocode } from '@/services/places'
import { parseApiError } from '@/lib/api'
```

(If `useState` is already imported from 'react', merge — don't duplicate.)

- [ ] **Step 2: Add stops state + hook inside the component**

After `const trip = useTripStore((s) => s.active)`:

```tsx
  const isLive = !!trip?.live && trip.status !== 'completed' && trip.status !== 'cancelled'
  const { stops, add } = useTripStops(trip?.id, isLive)
  const [addingStop, setAddingStop] = useState(false)
```

- [ ] **Step 3: Feed stop markers to the map**

On the `<TripMap ... />`, add the prop:

```tsx
        stops={stops.map((s) => ({ latitude: s.lat, longitude: s.lng }))}
```

- [ ] **Step 4: Render the panel above/below the DriverCard**

Inside the bottom overlay `<View>` that holds `<DriverCard .../>`, add the panel just before the DriverCard (wrap both in the existing container; add `gap` if absent):

```tsx
        {trip.type === 'regular' && (
          <View style={{ backgroundColor: colors.card, borderRadius: 16, borderCurve: 'continuous', padding: Spacing.md, marginBottom: Spacing.sm }}>
            <StopsPanel
              stops={stops}
              tripType={trip.type}
              onAddStop={() => setAddingStop(true)}
            />
          </View>
        )}
```

- [ ] **Step 5: Render the LocationPicker overlay when adding**

At the top of the returned JSX (before the main `<View>`), early-return the picker when adding:

```tsx
  if (addingStop) {
    return (
      <LocationPicker
        title={t('stops.pickStop')}
        ctaLabel={t('common.confirm')}
        initialCenter={trip.driverPosition ?? trip.dropoff}
        pinKind="dropoff"
        onCancel={() => setAddingStop(false)}
        onConfirm={async ({ coord, address }) => {
          setAddingStop(false)
          const addr = address ?? (await reverseGeocode(coord))
          add.mutate(
            { coord, address: addr ?? undefined },
            {
              onError: (err) => {
                const info = parseApiError(err)
                Alert.alert(
                  info.status === 409 ? t('stops.maxReached') : t('stops.addFailed'),
                  info.backendMessage,
                )
              },
            },
          )
        }}
      />
    )
  }
```

(`Alert` is already imported in this screen.)

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "app/(booking)/driver-assigned.tsx"
git commit -m "feat(stops): add-stop + stops panel on driver-assigned screen"
```

---

### Task 7: Wire into in-progress.tsx

**Files:**
- Modify: `app/(booking)/in-progress.tsx`

- [ ] **Step 1: Apply the same wiring as Task 6**

Add the same imports (Step 1), the stops state + hook (Step 2), the `stops={...}` map prop (Step 3), the `<StopsPanel>` block in the bottom overlay (Step 4), and the `addingStop` LocationPicker early-return (Step 5). The in-progress screen also imports `Alert`? Confirm — if `Alert` is NOT imported there, add it to the `react-native` import.

Verify the `react-native` import line includes `Alert`; current in-progress imports are `{ View, Text, Linking }`. Change to:

```tsx
import { View, Text, Linking, Alert } from 'react-native'
```

Then add the same blocks as Task 6 (the bottom overlay in this screen holds the in-progress pill + `<DriverCard>`; insert the `<StopsPanel>` block within that overlay container).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(booking)/in-progress.tsx"
git commit -m "feat(stops): add-stop + stops panel on in-progress screen"
```

---

### Task 8: Final verification + docs + live-test

**Files:**
- Modify: `docs/INTEGRATION_PLAN.md`

- [ ] **Step 1: Full typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: clean (pre-existing exhaustive-deps warnings only).

- [ ] **Step 2: Probe + structural live-test**

With a rider token, probe and attempt a POST to a NON-accepted trip (expect 400/404, proving the endpoint + state guard):

```bash
T=<rider-token>
curl -s -o /dev/null -w "GET stops: %{http_code}\n" -H "Authorization: Bearer $T" \
  "https://beeb.madebyhaithem.com/api/rider/trips/00000000-0000-0000-0000-000000000000/stops"
```
Full add happy-path needs a captain-accepted trip → flag needs-captain-side if not drivable.

- [ ] **Step 3: Update roadmap**

In `docs/INTEGRATION_PLAN.md`, mark Phase 5c (multi-stop) DONE → **Phase 5 fully complete**. Note the add happy-path live-test status.

- [ ] **Step 4: Commit**

```bash
git add docs/INTEGRATION_PLAN.md
git commit -m "docs: mark Phase 5c (multi-stop) done — Phase 5 complete"
```

---

## Self-Review

**Spec coverage:** add a stop via map picker on live trip (Tasks 5,6,7) · list with pending/reached/skipped (Task 5) · numbered map markers (Task 4) · 10s poll while live (Task 2) · max-3 + Abriyah gating (Task 5 `canAdd`/`tripType` guard) · i18n (Task 3) · error 409/400 (Tasks 6,7) · RTL (Task 5) · verification + live-test (Task 8). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step has full code. The `Typography['micro']` fallback note and the `Alert`-import check are explicit conditionals, not placeholders.

**Type consistency:** `TripStop.{seq,lat,lng,address,status,reachedAt}` defined in Task 1, used identically in Tasks 2/5/6/7. `useTripStops(tripId, live)` returns `{stops, add, ...}` — consumed the same way in both screens. `StopsPanel` props `{stops, tripType, onAddStop}` consistent. `TripMap` new `stops?: LatLng[]` prop matches the screens' `stops={...}` usage.

**Verified assumptions:** `TripMap` already maps markers and accepts `pickup/pickups/dropoff/driver` (read from source) — adding `stops` mirrors `pickups`. `LocationPicker` props (title/ctaLabel/initialCenter/pinKind/onCancel/onConfirm) confirmed from `(booking)/destination.tsx`. `driver-assigned.tsx` already imports `Alert`; `in-progress.tsx` does NOT (Task 7 adds it). `reverseGeocode(LatLng) → string|null` and `parseApiError` confirmed.
