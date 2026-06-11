# Captain Trip Queue + Accept — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While online, the captain sees a live list of incoming offers (regular trips + open Abriyah rooms, women-only hidden for male captains by the server) on a dedicated Queue tab, and taps Accept to take one and land on the live-trip screen.

**Architecture:** `services/captain-queue.ts` wraps the queue + accept endpoints. `hooks/use-trip-queue.ts` polls (gated on online + Queue-tab-active via the tab store) and refetches on Area 3's `lastOffer` push. The `trips` tab is reworked into the Queue (offline/empty/list states) rendering `components/captain/offer-card.tsx`. A minimal `app/(trip)/[id].tsx` placeholder is Accept's navigation target (Area 5 fills it).

**Tech Stack:** Expo Router, TanStack Query, Zustand (`useTabStore`, auth), Area 3 `useCaptainPresence`, `expo-location` (captain position for distance), `lib/format-currency`, `hooks/use-distance` (`haversineKm`).

> **No unit-test runner** (per `CLAUDE.md`). Verification gate per task: `npx tsc --noEmit` + `npx expo lint` clean, plus live `curl` against `https://beeb.madebyhaithem.com` where exercisable (pace requests — the edge rate-limits at ~50 rps and has been returning 429 under heavy probing). Overrides the writing-plans TDD default.

> **Test rigs:** captain `9647000000098`/`16001600` (male, approved+activated), rider `9647000000099`/`16001600`. A rider `POST /api/trips` (pickup/dropoff in a zone) creates a `requested` trip that appears in the captain queue. `CaptainOffer` shape verified: `{ offer_type, id, zone_id?, room_type?, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_iqd, created_at }`.

> **RTL:** Tasks 4 & 5 touch layout — follow CLAUDE.md RTL rules (flexDirection ternary, module-scope isRTL, no marginStart/marginEnd). Invoke `react-native-rtl-positioning` if available; else fall back to CLAUDE.md + `components/captain/document-row.tsx`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `services/captain-queue.ts` | getTripQueue + acceptTrip + acceptRoom + CaptainOffer type/mapper | Create |
| `hooks/use-trip-queue.ts` | polled query (online+focused) + lastOffer refetch + accept mutation | Create |
| `components/captain/offer-card.tsx` | one offer card (regular vs room) | Create |
| `app/(trip)/_layout.tsx` | Stack group for the live-trip route | Create |
| `app/(trip)/[id].tsx` | minimal placeholder live-trip screen (Area 5 fills it) | Create |
| `app/(tabs)/trips.tsx` | rework stub → Queue tab (offline/empty/list) | Modify |
| `components/tab-bar/custom-tab-bar.tsx` | re-label tab 1 to Queue | Modify |
| `i18n/en.json`, `i18n/ar.json` | `captain.queue.*` strings | Modify |

Reused: `lib/api.ts` (`api`, `parseApiError`), `providers/captain-presence.tsx` (`useCaptainPresence`), `store/tab-store.ts` (`useTabStore`), `hooks/use-current-location.ts` + `hooks/use-distance.ts` (`haversineKm`), `lib/format-currency.ts`, `components/ui/*`.

---

## Task 1: Queue service (`services/captain-queue.ts`)

**Files:**
- Create: `services/captain-queue.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-queue.ts
import { api } from '@/lib/api'

export type OfferType = 'trip' | 'room'
export type RoomType = 'mixed' | 'women_only'

export interface CaptainOffer {
  offerType: OfferType
  id: string
  zoneId?: string | null
  roomType?: RoomType | null
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  fareIqd: number
  createdAt: string
}

interface BackendOffer {
  offer_type: string
  id: string
  zone_id?: string | null
  room_type?: string | null
  pickup_lat: number
  pickup_lng: number
  dropoff_lat: number
  dropoff_lng: number
  fare_iqd: number
  created_at: string
}

function toOffer(b: BackendOffer): CaptainOffer {
  return {
    offerType: b.offer_type === 'room' ? 'room' : 'trip',
    id: b.id,
    zoneId: b.zone_id ?? null,
    roomType: (b.room_type as RoomType | null) ?? null,
    pickupLat: b.pickup_lat,
    pickupLng: b.pickup_lng,
    dropoffLat: b.dropoff_lat,
    dropoffLng: b.dropoff_lng,
    fareIqd: b.fare_iqd,
    createdAt: b.created_at,
  }
}

/** Pending regular trips + open rooms (women-only pre-filtered server-side for non-female). */
export async function getTripQueue(): Promise<CaptainOffer[]> {
  const { data } = await api.get<{ offers: BackendOffer[] }>('/api/captain/trip-queue')
  return (data.offers ?? []).map(toOffer)
}

/** Accept a regular trip. 409 if already taken or the captain has an active trip. */
export async function acceptTrip(tripId: string): Promise<void> {
  await api.post(`/api/trips/${tripId}/accept`)
}

/** Accept (dispatch) an Abriyah room. 400 not-open / 403 women-only mismatch / 409 already in a room. */
export async function acceptRoom(roomId: string): Promise<void> {
  await api.post(`/api/abriyah/rooms/${roomId}/accept`)
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/captain-queue"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "captain-queue"` → clean.

- [ ] **Step 3: Live probe (paced — one request set)**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -w "\n[%{http_code}]\n" $BASE/api/captain/trip-queue -H "Authorization: Bearer $TOKEN"
```
Expected: `200` with `{"offers":[...]}` (array may be empty if no pending trips right now — the shape is what matters). If `429`, wait ~60s and retry once; the endpoint shape is already confirmed.

- [ ] **Step 4: Commit**

```bash
git add services/captain-queue.ts
git commit -m "feat(captain): trip-queue + accept service"
```

---

## Task 2: i18n strings (`captain.queue.*`)

**Files:**
- Modify: `i18n/en.json` (add `queue` inside `captain`)
- Modify: `i18n/ar.json` (matching block)

- [ ] **Step 1: Add to `i18n/en.json`'s `captain` object** (after the `online` block; valid JSON):

```json
    "queue": {
      "tabLabel": "Queue",
      "title": "Trip queue",
      "offlineTitle": "You're offline",
      "offlineBody": "Go online from Home to start receiving trips.",
      "emptyTitle": "Waiting for trips…",
      "emptyBody": "New trips in your area will appear here.",
      "newTrip": "New trip",
      "newRoom": "Abriyah room",
      "kmAway": "{{km}} km away",
      "tripDistance": "{{km}} km trip",
      "roomMixed": "Mixed",
      "roomWomenOnly": "Women only",
      "accept": "Accept",
      "acceptRoom": "Accept room",
      "taken": "That trip was just taken.",
      "acceptFailed": "Couldn't accept. Please try again."
    },
```

- [ ] **Step 2: Add to `i18n/ar.json`'s `captain` object:**

```json
    "queue": {
      "tabLabel": "الطابور",
      "title": "طابور الرحلات",
      "offlineTitle": "أنت غير متصل",
      "offlineBody": "اتصل بالإنترنت من الرئيسية لبدء استقبال الرحلات.",
      "emptyTitle": "في انتظار الرحلات…",
      "emptyBody": "ستظهر الرحلات الجديدة في منطقتك هنا.",
      "newTrip": "رحلة جديدة",
      "newRoom": "غرفة عبريّة",
      "kmAway": "على بُعد {{km}} كم",
      "tripDistance": "رحلة {{km}} كم",
      "roomMixed": "مختلط",
      "roomWomenOnly": "نساء فقط",
      "accept": "قبول",
      "acceptRoom": "قبول الغرفة",
      "taken": "تم أخذ هذه الرحلة للتو.",
      "acceptFailed": "تعذّر القبول. حاول مرة أخرى."
    },
```

- [ ] **Step 3: Validate + parity + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run: `node -e "const en=require('./i18n/en.json').captain,ar=require('./i18n/ar.json').captain;const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?Object.keys(v).map(kk=>k+'.'+kk):[k]).sort();const ek=keys(en),ak=keys(ar);console.log('en-only:',ek.filter(k=>!ak.includes(k)));console.log('ar-only:',ak.filter(k=>!ek.includes(k)))"` → both EMPTY.
Run: `npx tsc --noEmit 2>&1 | grep -i "i18n"` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for trip queue"
```

---

## Task 3: Queue hook (`hooks/use-trip-queue.ts`)

**Files:**
- Create: `hooks/use-trip-queue.ts`

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-trip-queue.ts
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getTripQueue, acceptTrip, acceptRoom, type CaptainOffer } from '@/services/captain-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useTabStore } from '@/store/tab-store'

const KEY = ['captain', 'trip-queue'] as const
const QUEUE_TAB_INDEX = 1

/**
 * Live trip queue. Polls every 8s only while the captain is online AND the Queue
 * tab is active; also refetches immediately when a new offer arrives over the WS
 * (presence.lastOffer). Exposes an accept() that routes by offer type.
 */
export function useTripQueue() {
  const online = useCaptainPresence((s) => s.online) // NOTE: useCaptainPresence returns a value object, see below
  const lastOffer = useCaptainPresence((s) => s.lastOffer)
  const activeTab = useTabStore((s) => s.activeTabIndex)
  const queryClient = useQueryClient()

  const focused = activeTab === QUEUE_TAB_INDEX
  const active = online && focused

  const query = useQuery({
    queryKey: KEY,
    queryFn: getTripQueue,
    enabled: active,
    refetchInterval: active ? 8000 : false,
    staleTime: 0,
  })

  // Live push → instant refetch.
  useEffect(() => {
    if (active && lastOffer) queryClient.invalidateQueries({ queryKey: KEY })
  }, [lastOffer, active, queryClient])

  const acceptMutation = useMutation({
    mutationFn: (offer: CaptainOffer) =>
      offer.offerType === 'room' ? acceptRoom(offer.id) : acceptTrip(offer.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  })

  return {
    offers: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: () => query.refetch(),
    accept: (offer: CaptainOffer) => acceptMutation.mutateAsync(offer),
    accepting: acceptMutation.isPending,
  }
}
```

> **IMPORTANT — `useCaptainPresence` is NOT a selector hook.** It returns the context value object directly (`useCaptainPresence()` → `{ online, lastOffer, ... }`). So the two lines above are WRONG as written. Replace them with:
> ```ts
> const { online, lastOffer } = useCaptainPresence()
> ```
> (Delete the `useCaptainPresence((s) => ...)` lines.) The implementer MUST use the destructured form. The rest of the hook is correct.

- [ ] **Step 2: Apply the destructure fix and typecheck**

Ensure the hook reads:
```ts
  const { online, lastOffer } = useCaptainPresence()
  const activeTab = useTabStore((s) => s.activeTabIndex)
```
Run: `npx tsc --noEmit 2>&1 | grep "hooks/use-trip-queue"` → EMPTY. (Confirm `useTabStore` exposes `activeTabIndex` — check `store/tab-store.ts`; if the field is named differently, use the actual name.)
Run: `npx expo lint 2>&1 | grep "use-trip-queue"` → clean (an exhaustive-deps note on the effect is acceptable if it matches the template tolerance; the deps listed are correct).

- [ ] **Step 3: Commit**

```bash
git add hooks/use-trip-queue.ts
git commit -m "feat(captain): trip-queue hook (poll + live-push + accept)"
```

---

## Task 4: Offer card (`components/captain/offer-card.tsx`)

**Files:**
- Create: `components/captain/offer-card.tsx`

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back to CLAUDE.md).

- [ ] **Step 1: Create the component**

```tsx
// components/captain/offer-card.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatIqd } from '@/lib/format-currency'
import { haversineKm } from '@/hooks/use-distance'
import type { LatLng } from '@/hooks/use-current-location'
import type { CaptainOffer } from '@/services/captain-queue'

const isRTL = I18nManager.isRTL

interface OfferCardProps {
  offer: CaptainOffer
  captainLocation: LatLng | null
  onAccept: () => void
  accepting: boolean
}

export function OfferCard({ offer, captainLocation, onAccept, accepting }: OfferCardProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const isRoom = offer.offerType === 'room'
  const pickup: LatLng = { latitude: offer.pickupLat, longitude: offer.pickupLng }
  const dropoff: LatLng = { latitude: offer.dropoffLat, longitude: offer.dropoffLng }

  const awayKm = captainLocation ? haversineKm(captainLocation, pickup) : null
  const tripKm = haversineKm(pickup, dropoff)

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        gap: Spacing.md,
        boxShadow: '0px 6px 18px rgba(13, 24, 42, 0.06)',
      }}
    >
      {/* header: type + fare */}
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Icon name={isRoom ? 'people' : 'car'} size={18} color={colors.tint} />
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
            {isRoom ? t('captain.queue.newRoom') : t('captain.queue.newTrip')}
          </Text>
          {isRoom && offer.roomType === 'women_only' && (
            <View style={{ backgroundColor: colors.tint + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal' }}>
                {t('captain.queue.roomWomenOnly')}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'] }}>
          {formatIqd(offer.fareIqd)}
        </Text>
      </View>

      {/* details */}
      <View style={{ gap: Spacing.xs, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        {!isRoom && awayKm != null && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.kmAway', { km: awayKm.toFixed(1) })}
          </Text>
        )}
        {!isRoom && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.tripDistance', { km: tripKm.toFixed(1) })}
          </Text>
        )}
        {isRoom && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {offer.roomType === 'women_only' ? t('captain.queue.roomWomenOnly') : t('captain.queue.roomMixed')}
          </Text>
        )}
      </View>

      <Button
        label={isRoom ? t('captain.queue.acceptRoom') : t('captain.queue.accept')}
        loading={accepting}
        onPress={onAccept}
      />
    </View>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "offer-card"` → EMPTY. (Confirm Ionicons `people`/`car` are valid — the `Icon` name type will flag otherwise; substitute a valid name if needed.)
Run: `npx expo lint 2>&1 | grep "offer-card"` → clean.

- [ ] **Step 3: Commit**

```bash
git add components/captain/offer-card.tsx
git commit -m "feat(captain): offer card (regular trip + Abriyah room)"
```

---

## Task 5: Placeholder live-trip route (`app/(trip)/`)

**Files:**
- Create: `app/(trip)/_layout.tsx`
- Create: `app/(trip)/[id].tsx`

- [ ] **Step 1: Create `app/(trip)/_layout.tsx`**

```tsx
// app/(trip)/_layout.tsx
import { Stack } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'

export default function TripLayout() {
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

- [ ] **Step 2: Create `app/(trip)/[id].tsx` (minimal placeholder — Area 5 fills it)**

```tsx
// app/(trip)/[id].tsx
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

// Placeholder live-trip screen. Area 5 replaces this body with the map + leg actions.
export default function LiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="checkmark-circle" size={40} color={colors.success} />
      </View>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
        {t('captain.trip.acceptedTitle')}
      </Text>
      <Text selectable style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
        {id}
      </Text>
      <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
        {t('captain.trip.comingSoon')}
      </Text>
      <Button label={t('common.back')} variant="secondary" onPress={() => router.back()} />
    </View>
  )
}
```

- [ ] **Step 3: Add the `captain.trip.*` i18n keys used by the placeholder**

Add to `i18n/en.json`'s `captain` object (after `queue`):
```json
    "trip": {
      "acceptedTitle": "Trip accepted",
      "comingSoon": "Your live trip screen is coming next."
    },
```
Add to `i18n/ar.json`'s `captain` object:
```json
    "trip": {
      "acceptedTitle": "تم قبول الرحلة",
      "comingSoon": "شاشة الرحلة المباشرة قادمة قريبًا."
    },
```
(`common.back` already exists in both.)

- [ ] **Step 4: Register the `(trip)` group in the root stack**

In `app/_layout.tsx`, the root `<Stack>` declares `(auth)` and `(tabs)`. Add a screen for the new group so Expo Router knows it (right after the `(tabs)` screen):
```tsx
                <Stack.Screen name="(trip)" />
```
(Leave everything else in `app/_layout.tsx` unchanged — only add this one `<Stack.Screen>` line.)

- [ ] **Step 5: Typecheck + lint + JSON validity**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run: `npx tsc --noEmit 2>&1 | grep -E "\(trip\)|_layout"` → EMPTY for the new files.
Run: `npx expo lint 2>&1 | grep "(trip)"` → clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(trip)" "app/_layout.tsx" i18n/en.json i18n/ar.json
git commit -m "feat(captain): placeholder live-trip route"
```

---

## Task 6: Queue tab + tab re-label

**Files:**
- Modify: `app/(tabs)/trips.tsx` (rework stub → Queue)
- Modify: `components/tab-bar/custom-tab-bar.tsx` (re-label tab 1)

This task has RTL layout. **First invoke `react-native-rtl-positioning`** (or fall back to CLAUDE.md).

- [ ] **Step 1: Re-label the Queue tab in `components/tab-bar/custom-tab-bar.tsx`**

In the `TAB_DEFS` array, change the second entry from:
```tsx
  { name: 'trips',         icon: 'time',          labelKey: 'tabs.trips'         },
```
to:
```tsx
  { name: 'trips',         icon: 'list',          labelKey: 'captain.queue.tabLabel' },
```
(Keep `name: 'trips'` — the route file stays `trips.tsx`. Only the icon + label change. If `list`/`list-outline` aren't valid Ionicons, use `car`/`car-outline`.)

- [ ] **Step 2: Rework `app/(tabs)/trips.tsx` into the Queue**

Replace the ENTIRE file with:
```tsx
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { OfferCard } from '@/components/captain/offer-card'
import { useTripQueue } from '@/hooks/use-trip-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { parseApiError } from '@/lib/api'
import type { CaptainOffer } from '@/services/captain-queue'
import { useState } from 'react'

const isRTL = I18nManager.isRTL

export default function QueueScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { online } = useCaptainPresence()
  const { offers, isLoading, isRefetching, refetch, accept, accepting } = useTripQueue()
  const { location } = useCurrentLocation()
  const [error, setError] = useState<string | null>(null)

  async function onAccept(offer: CaptainOffer) {
    setError(null)
    try {
      await accept(offer)
      router.push(`/(trip)/${offer.id}`)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 409) setError(t('captain.queue.taken'))
      else if (info.status === 403 || info.status === 400) refetch()
      else setError(t(info.isNetwork ? 'common.networkError' : 'captain.queue.acceptFailed'))
      refetch()
    }
  }

  const header = (
    <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
      {t('captain.queue.title')}
    </Text>
  )

  // Offline
  if (!online) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md }}>
        <Icon name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.queue.offlineTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.offlineBody')}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {header}

      {error && (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal' }}>{error}</Text>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : offers.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
          <Icon name="hourglass-outline" size={40} color={colors.muted} />
          <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.emptyTitle')}</Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.emptyBody')}</Text>
        </View>
      ) : (
        offers.map((offer) => (
          <OfferCard
            key={`${offer.offerType}-${offer.id}`}
            offer={offer}
            captainLocation={location}
            onAccept={() => onAccept(offer)}
            accepting={accepting}
          />
        ))
      )}
    </ScrollView>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "\(tabs\)/trips|custom-tab-bar"` → EMPTY. (Confirm `useCurrentLocation()` returns `{ location }` — it does, per `hooks/use-current-location.ts`. Confirm Ionicons `cloud-offline-outline`/`hourglass-outline`/`list` valid; substitute if flagged.)
Run: `npx expo lint 2>&1 | grep -E "trips|custom-tab-bar"` → clean (no NEW warnings).

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/trips.tsx" components/tab-bar/custom-tab-bar.tsx
git commit -m "feat(captain): Queue tab with offer list + accept"
```

---

## Task 7: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint**

Run: `npx tsc --noEmit && npx expo lint`
Expected: tsc exit 0; lint 0 errors (the pre-existing template warnings are acceptable; confirm no NEW warnings from Area 4).

- [ ] **Step 2: Live E2E — rider creates a trip, captain sees + accepts it (paced)**

Run (single block; if any call returns 429, wait ~60s and re-run the block):
```bash
BASE=https://beeb.madebyhaithem.com
RIDER=$(curl -s -X POST $BASE/api/auth/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000099","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
CAP=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
# rider requests a trip in a zone
TRIP=$(curl -s -X POST $BASE/api/trips -H "Authorization: Bearer $RIDER" -H 'Content-Type: application/json' -d '{"pickup_lat":33.30,"pickup_lng":44.55,"dropoff_lat":33.33,"dropoff_lng":44.60}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
echo "trip: $TRIP"
# captain online + ping so dispatch ranks them
curl -s -o /dev/null -w "online [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"online":true}'
curl -s -o /dev/null -w "ping [%{http_code}]\n" -X POST $BASE/api/captain/location -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"longitude":44.55,"latitude":33.30}'
# queue shows it?
echo "queue:"; curl -s $BASE/api/captain/trip-queue -H "Authorization: Bearer $CAP" | python3 -c "import sys,json;d=json.load(sys.stdin);print('  offers:',len(d.get('offers',[])),[o['id'] for o in d.get('offers',[])][:3])"
# accept it
curl -s -o /dev/null -w "accept [%{http_code}]\n" -X POST $BASE/api/trips/$TRIP/accept -H "Authorization: Bearer $CAP"
# offline again (clean state)
curl -s -o /dev/null -w "offline [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $CAP" -H 'Content-Type: application/json' -d '{"online":false}'
```
Expected: a trip id; online/ping 200; queue shows ≥1 offer (the new trip id among them); accept `[200]`; offline 200. (This proves the exact queue→accept loop the UI drives. If the captain already had an active trip from a prior run, accept may 409 — in that case note it; the contract is unchanged.)

- [ ] **Step 3: Manual smoke (Expo Go), best-effort**

Start `npx expo start`; log in as the captain; go online on Home; switch to the Queue tab; confirm an offer card renders (create one via the rider if needed), tap Accept → lands on the placeholder live-trip screen showing the id. Record results.

- [ ] **Step 4: Final commit (only if smoke fixes were needed)**

```bash
git add -A && git commit -m "chore(captain): trip queue verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **`useCaptainPresence()` returns the value object** — destructure `{ online, lastOffer }`; do NOT call it with a selector (Task 3's first code block has the wrong form on purpose-flagged lines; use the destructured fix).
- **Focus gate = `useTabStore` active index === 1** (PagerView tabs; `useIsFocused` won't work). Confirm the store field name (`activeTabIndex`).
- **Accept navigates to `/(trip)/{offer.id}`** — for a room this is the room id; the placeholder just displays it, and Area 5 reconciles the real trip. Acceptable for the seam.
- **Ionicons names** (`list`, `people`, `car`, `cloud-offline-outline`, `hourglass-outline`, `checkmark-circle`) are best-guesses; tsc (the `Icon` name union) will flag any invalid one — substitute the nearest valid.
- **No Decline / no countdown** — intentional (backend has neither). Don't add them.
- **Rate limit:** the edge limiter (429) has been active under heavy probing; pace the live checks, retry once after ~60s. The endpoint shapes are already confirmed, so a deferred live check is acceptable, not a failure.
