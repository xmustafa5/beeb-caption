# Captain Nafarat (Abriyah) Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the captain's Nafarat (Abriyah) pooled-ride flow — accept a room from the Queue, then manage the pool of riders on a dedicated screen (roster + call + pickup/dropoff drive) backed by a polling hook.

**Architecture:** Room offers already arrive in the Queue. Accepting a room routes to a new `app/(trip)/room/[id].tsx`. A `useNafaratRoom(roomId)` hook polls the room, the members roster, and the captain's pooled trips, joins members↔trips by `rider_id` into `RiderSeat[]`, and drives each rider via the existing `/api/trips/{tripId}/{start,complete}`.

**Tech Stack:** Expo Router, `@maplibre/maplibre-react-native` (TripMap), TanStack Query (polling + mutations), `react-i18next`.

## Global Constraints

- **Repo (DST):** `c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption`. Branch: `feat/captain-nafarat` (already created; spec committed there).
- **No test framework** (no Jest). Per-task verification is **`npx tsc --noEmit`** (exit 0) + the manual smoke in the final task. Do NOT add tests/Jest.
- **No backend changes.** Endpoints are the verified contract in `docs/abriyah-integration-guide.md`.
- **No change to `app/(trip)/[id].tsx`** (the single-trip screen) or `components/trip/trip-map.tsx`.
- **Pool enumeration:** `GET /api/trips?captain_id={me}&status={accepted|in_progress|completed}`, keep rows where `trip.roomId === roomId` (there is no `room_id` filter and no room→trips endpoint).
- **Drive:** per rider — Pick up = `POST /api/trips/{tripId}/start`; Drop off = `POST /api/trips/{tripId}/complete`.
- **Member geometry** is `POINT(lng lat)` (lng-first); `phone` is the rider's real number.
- **Theming/RTL:** colors via `useThemeColors()`; module-scope `const isRTL = I18nManager.isRTL`; no `marginStart/End`. Reuse existing `captain.live.*` i18n keys where they fit; add a `captain.nafarat.*` block.
- Spec: `docs/superpowers/specs/2026-06-26-captain-nafarat-flow-design.md`.

---

## File Structure

- Modify `lib/wkt.ts` — add `parsePointWkt`.
- Modify `services/abriyah-members.ts` — `RoomMember` gains `phone` + `pickup`/`dropoff` LatLng.
- Create `services/abriyah-rooms.ts` — `getRoom(roomId)`.
- Modify `services/captain-trips.ts` — add `getRoomTrips`.
- Create `hooks/use-nafarat-room.ts` — the polling/join/drive hook + `RiderSeat` type.
- Create `components/captain/rider-seat-card.tsx` — one rider row with Call + drive action.
- Create `components/captain/nafarat-markers.tsx` — numbered pickup pins + dropoff dots (TripMap children).
- Create `app/(trip)/room/[id].tsx` — the Nafarat room screen.
- Modify `i18n/en.json`, `i18n/ar.json` — `captain.nafarat.*` keys.
- Modify `app/(tabs)/trips.tsx`, `hooks/use-resume-active-trip.ts`, `app/(tabs)/index.tsx` — route abriyah → the room page.

---

### Task 1: `parsePointWkt`

**Files:** Modify `lib/wkt.ts`

**Interfaces:**
- Produces: `parsePointWkt(wkt: string): LatLng | null`.

- [ ] **Step 1: Add the parser** — append to `lib/wkt.ts` (after `polygonCenter`):

```ts

/** Parse a WKT point `POINT(lng lat)` (lng-first, SRID 4326) into LatLng. Null on anything unparseable. */
export function parsePointWkt(wkt: string): LatLng | null {
  if (!wkt) return null
  const open = wkt.indexOf('(')
  const close = wkt.indexOf(')')
  if (open === -1 || close === -1 || close <= open) return null
  const parts = wkt.slice(open + 1, close).trim().split(/\s+/)
  if (parts.length < 2) return null
  const lng = Number(parts[0])
  const lat = Number(parts[1])
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return { latitude: lat, longitude: lng }
}
```

- [ ] **Step 2: Type-check** — `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add lib/wkt.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add parsePointWkt for POINT geometry"
```

---

### Task 2: Extend the members roster (phone + geometry)

**Files:** Modify `services/abriyah-members.ts`

**Interfaces:**
- Consumes: `parsePointWkt` (Task 1), `LatLng`.
- Produces: `RoomMember` now has `phone: string`, `pickup: LatLng`, `dropoff: LatLng` (existing `riderId,name,fareIqd,distanceKm` kept). `RoomMembersData`/`getRoomMembers` signatures unchanged otherwise.

- [ ] **Step 1: Extend the types + mapping.** In `services/abriyah-members.ts`:

Add the import at the top (after the `api` import):
```ts
import { parsePointWkt } from '@/lib/wkt'
import type { LatLng } from '@/hooks/use-current-location'
```

Replace the `RoomMember` interface with:
```ts
export interface RoomMember {
  riderId: string
  name: string
  phone: string
  pickup: LatLng
  dropoff: LatLng
  fareIqd: number
  distanceKm: number
}
```

Replace the `BackendMember` interface with:
```ts
interface BackendMember {
  rider_id: string
  name: string
  phone: string
  pickup_wkt: string
  dropoff_wkt: string
  fare_iqd: number
  distance_km: number
}
```

In `getRoomMembers`, replace the `members:` mapping inside the returned object with:
```ts
    members: (data.members ?? []).map((m) => ({
      riderId: m.rider_id,
      name: m.name,
      phone: m.phone,
      pickup: parsePointWkt(m.pickup_wkt) ?? { latitude: 0, longitude: 0 },
      dropoff: parsePointWkt(m.dropoff_wkt) ?? { latitude: 0, longitude: 0 },
      fareIqd: m.fare_iqd,
      distanceKm: m.distance_km,
    })),
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0. (The single-trip screen's `MemberRoster` reads only `name/fareIqd/distanceKm` — adding fields is additive, so it still compiles.)
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add services/abriyah-members.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add rider phone + pickup/dropoff geometry to the roster"
```

---

### Task 3: Room service

**Files:** Create `services/abriyah-rooms.ts`

**Interfaces:**
- Produces: `RoomStatus` (`'open'|'locked'|'dispatched'|'expired'`); `Room` (`{ id, status, maxRiders, riderCount, expiresAt, dispatchedAt }`); `getRoom(roomId: string): Promise<Room>`.

- [ ] **Step 1: Create the service**

```ts
// services/abriyah-rooms.ts
import { api } from '@/lib/api'

export type RoomStatus = 'open' | 'locked' | 'dispatched' | 'expired'

export interface Room {
  id: string
  status: RoomStatus
  maxRiders: number
  riderCount: number
  expiresAt: string
  dispatchedAt: string | null
}

interface BackendRoom {
  id: string
  status: string
  max_riders: number
  rider_count: number
  expires_at: string
  dispatched_at?: string | null
}

/** The room a captain is driving (status/counts/expiry). Any authed user may read a room id. */
export async function getRoom(roomId: string): Promise<Room> {
  const { data } = await api.get<BackendRoom>(`/api/abriyah/rooms/${roomId}`)
  return {
    id: data.id,
    status: (data.status as RoomStatus) ?? 'open',
    maxRiders: data.max_riders,
    riderCount: data.rider_count,
    expiresAt: data.expires_at,
    dispatchedAt: data.dispatched_at ?? null,
  }
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add services/abriyah-rooms.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add getRoom service"
```

---

### Task 4: `getRoomTrips` (enumerate the pool)

**Files:** Modify `services/captain-trips.ts`

**Interfaces:**
- Consumes: existing `Trip`, `TripStatus`, `toTrip`, `BackendTrip`, `api` (same file).
- Produces: `getRoomTrips(captainId: string, roomId: string): Promise<Trip[]>`.

- [ ] **Step 1: Add the function** — append to `services/captain-trips.ts` (after `getActiveCaptainTrip`):

```ts

/** Pool statuses to scan for a room's rider trips (accepted/in_progress/completed). */
const POOL_TRIP_STATUSES: TripStatus[] = ['accepted', 'in_progress', 'completed']

/**
 * All of the captain's trips that belong to one Abriyah room. There is no
 * room→trips endpoint and no room_id filter on /api/trips, so we scan the
 * captain's trips across the pool statuses and keep the ones whose room_id matches.
 */
export async function getRoomTrips(captainId: string, roomId: string): Promise<Trip[]> {
  const out: Trip[] = []
  for (const status of POOL_TRIP_STATUSES) {
    const { data } = await api.get<{ items: BackendTrip[] }>('/api/trips', {
      params: { captain_id: captainId, status, per_page: 50 },
    })
    for (const b of data.items ?? []) {
      const trip = toTrip(b)
      if (trip.roomId === roomId) out.push(trip)
    }
  }
  return out
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add services/captain-trips.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add getRoomTrips to enumerate a room's pool"
```

---

### Task 5: `useNafaratRoom` hook

**Files:** Create `hooks/use-nafarat-room.ts`

**Interfaces:**
- Consumes: `getRoomMembers` (Task 2), `getRoom`/`Room` (Task 3), `getRoomTrips`/`startTrip`/`completeTrip`/`Trip`/`TripStatus` (Task 4 + existing), `useAuthStore`, `LatLng`.
- Produces: `RiderSeat` type and `useNafaratRoom(roomId: string)` returning `{ room, dropoffZone, pickupBreakdown, seats, isLoading, isError, pickup, dropoff, busy }`.

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-nafarat-room.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth-store'
import { getRoomMembers, type DropoffZone, type PickupZoneCount } from '@/services/abriyah-members'
import { getRoom, type Room } from '@/services/abriyah-rooms'
import { getRoomTrips, startTrip, completeTrip, type TripStatus } from '@/services/captain-trips'
import type { LatLng } from '@/hooks/use-current-location'

export interface RiderSeat {
  riderId: string
  name: string
  phone: string
  pickup: LatLng
  dropoff: LatLng
  fareIqd: number
  distanceKm: number
  tripId: string | null
  tripStatus: TripStatus | null
}

export interface NafaratRoom {
  room: Room | null
  dropoffZone: DropoffZone | null
  pickupBreakdown: PickupZoneCount[]
  seats: RiderSeat[]
  isLoading: boolean
  isError: boolean
  pickup: (tripId: string) => Promise<void>
  dropoff: (tripId: string) => Promise<void>
  busy: boolean
}

/**
 * Drives one dispatched Abriyah room. Polls the room, the members roster, and the
 * captain's pooled trips; joins members↔trips by rider id into RiderSeat[]; and
 * exposes per-rider pickup/dropoff that advance each trip and refetch.
 */
export function useNafaratRoom(roomId: string): NafaratRoom {
  const captainId = useAuthStore((s) => s.captain?.id)
  const qc = useQueryClient()

  const roomQ = useQuery({
    queryKey: ['nafarat', 'room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: !!roomId,
    refetchInterval: 5000,
  })
  const membersQ = useQuery({
    queryKey: ['nafarat', 'members', roomId],
    queryFn: () => getRoomMembers(roomId),
    enabled: !!roomId,
    refetchInterval: 10000,
  })
  const tripsKey = ['nafarat', 'trips', roomId] as const
  const tripsQ = useQuery({
    queryKey: tripsKey,
    queryFn: () => getRoomTrips(captainId as string, roomId),
    enabled: !!roomId && !!captainId,
    refetchInterval: 5000,
  })

  const seats: RiderSeat[] = (membersQ.data?.members ?? []).map((m) => {
    const trip = (tripsQ.data ?? []).find((tp) => tp.riderId === m.riderId)
    return {
      riderId: m.riderId,
      name: m.name,
      phone: m.phone,
      pickup: m.pickup,
      dropoff: m.dropoff,
      fareIqd: m.fareIqd,
      distanceKm: m.distanceKm,
      tripId: trip?.id ?? null,
      tripStatus: trip?.status ?? null,
    }
  })

  const advance = useMutation({
    mutationFn: ({ tripId, action }: { tripId: string; action: 'pickup' | 'dropoff' }) =>
      action === 'pickup' ? startTrip(tripId) : completeTrip(tripId),
    onSettled: () => qc.invalidateQueries({ queryKey: tripsKey }),
  })

  return {
    room: roomQ.data ?? null,
    dropoffZone: membersQ.data?.dropoffZone ?? null,
    pickupBreakdown: membersQ.data?.pickupBreakdown ?? [],
    seats,
    isLoading: roomQ.isLoading || membersQ.isLoading,
    isError: roomQ.isError || membersQ.isError,
    pickup: (tripId) => advance.mutateAsync({ tripId, action: 'pickup' }).then(() => undefined),
    dropoff: (tripId) => advance.mutateAsync({ tripId, action: 'dropoff' }).then(() => undefined),
    busy: advance.isPending,
  }
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0. (Requires `DropoffZone`/`PickupZoneCount` to be exported from `services/abriyah-members.ts` — they already are.)
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add hooks/use-nafarat-room.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add useNafaratRoom polling/join/drive hook"
```

---

### Task 6: `RiderSeatCard`

**Files:** Create `components/captain/rider-seat-card.tsx`

**Interfaces:**
- Consumes: `RiderSeat` (Task 5), `Button`, `Icon`, `formatIqd`, `Linking`.
- Produces: `RiderSeatCard({ seat: RiderSeat, busy: boolean, onPickup: () => void, onDropoff: () => void })`.

- [ ] **Step 1: Create the card**

```tsx
// components/captain/rider-seat-card.tsx
import { View, Text, TouchableOpacity, Linking, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { formatIqd } from '@/lib/format-currency'
import type { RiderSeat } from '@/hooks/use-nafarat-room'

const isRTL = I18nManager.isRTL

interface RiderSeatCardProps {
  seat: RiderSeat
  busy: boolean
  onPickup: () => void
  onDropoff: () => void
}

export function RiderSeatCard({ seat, busy, onPickup, onDropoff }: RiderSeatCardProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const status = seat.tripStatus

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: Spacing.md }}>
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{seat.name}</Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>
          {formatIqd(seat.fareIqd, isAr ? 'ar' : 'en')}
        </Text>
      </View>

      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${seat.phone}`)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Icon name="call" size={15} color={colors.tint} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{t('captain.nafarat.call')}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          {status === 'completed' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: isRTL ? 'flex-start' : 'flex-end', gap: 6 }}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ ...Typography['caption-sm'], color: colors.success, fontStyle: 'normal' }}>{t('captain.nafarat.dropped')}</Text>
            </View>
          ) : status === 'in_progress' ? (
            <Button label={t('captain.nafarat.dropOff')} size="md" loading={busy} onPress={onDropoff} />
          ) : (
            <Button label={t('captain.nafarat.pickUp')} size="md" loading={busy} disabled={seat.tripId == null} onPress={onPickup} />
          )}
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/captain/rider-seat-card.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add RiderSeatCard (call + pickup/dropoff)"
```

---

### Task 7: `NafaratMarkers` (map pins)

**Files:** Create `components/captain/nafarat-markers.tsx`

**Interfaces:**
- Consumes: `Marker` from `@maplibre/maplibre-react-native`, `LatLng`, theme.
- Produces: `NafaratMarkers({ pickups: LatLng[], dropoffs: LatLng[] })` — render as a child of `<TripMap>`.

- [ ] **Step 1: Create the markers**

```tsx
// components/captain/nafarat-markers.tsx
import { View, Text } from 'react-native'
import { Marker } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import type { LatLng } from '@/hooks/use-current-location'

/** Numbered tint pickup pins + small destructive dropoff dots. Non-interactive. */
export function NafaratMarkers({ pickups, dropoffs }: { pickups: LatLng[]; dropoffs: LatLng[] }) {
  const colors = useThemeColors()
  return (
    <>
      {pickups.map((p, i) => (
        <Marker key={`pk-${i}`} lngLat={[p.longitude, p.latitude]} anchor="center">
          <View
            pointerEvents="none"
            style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.tint, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 4px rgba(0,0,0,0.35)' }}
          >
            <Text style={{ color: colors.onTint, fontSize: 11, fontFamily: 'Poppins_600SemiBold' }}>{i + 1}</Text>
          </View>
        </Marker>
      ))}
      {dropoffs.map((d, i) => (
        <Marker key={`dp-${i}`} lngLat={[d.longitude, d.latitude]} anchor="center">
          <View
            pointerEvents="none"
            style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.destructive, borderWidth: 2, borderColor: '#FFFFFF', boxShadow: '0px 1px 3px rgba(0,0,0,0.25)' }}
          />
        </Marker>
      ))}
    </>
  )
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit` → exit 0.
- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/captain/nafarat-markers.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add NafaratMarkers (numbered pickups + dropoffs)"
```

---

### Task 8: The Nafarat room screen + i18n

**Files:** Create `app/(trip)/room/[id].tsx`; Modify `i18n/en.json`, `i18n/ar.json`

**Interfaces:**
- Consumes: `useNafaratRoom` (Task 5), `RiderSeatCard` (Task 6), `NafaratMarkers` (Task 7), `TripMap`, the new `captain.nafarat.*` keys + reused `captain.live.*` keys.

- [ ] **Step 1: Add the EN i18n block.** In `i18n/en.json`, inside the `captain` object, add a `"nafarat"` block (place it after the `"live"` block; mind the trailing comma on the preceding block):

```json
    "nafarat": {
      "title": "Nafarat ride",
      "progress": "{{done}}/{{total}} dropped off",
      "call": "Call",
      "pickUp": "Pick up",
      "dropOff": "Drop off",
      "dropped": "Dropped off",
      "allDoneTitle": "All riders dropped off",
      "loadError": "Couldn't load this ride."
    },
```

- [ ] **Step 2: Add the AR i18n block.** In `i18n/ar.json`, inside the `captain` object (after `"live"`):

```json
    "nafarat": {
      "title": "رحلة نفرات",
      "progress": "تم إنزال {{done}} من {{total}}",
      "call": "اتصال",
      "pickUp": "صعود",
      "dropOff": "إنزال",
      "dropped": "تم الإنزال",
      "allDoneTitle": "تم إنزال جميع الركاب",
      "loadError": "تعذّر تحميل الرحلة."
    },
```

- [ ] **Step 3: Create the screen**

```tsx
// app/(trip)/room/[id].tsx
import { View, Text, ScrollView, ActivityIndicator, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { TripMap } from '@/components/trip/trip-map'
import { NafaratMarkers } from '@/components/captain/nafarat-markers'
import { RiderSeatCard } from '@/components/captain/rider-seat-card'
import { useNafaratRoom } from '@/hooks/use-nafarat-room'
import { formatIqd } from '@/lib/format-currency'

const isRTL = I18nManager.isRTL

export default function NafaratRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { room, dropoffZone, pickupBreakdown, seats, isLoading, isError, pickup, dropoff, busy } = useNafaratRoom(id)

  // Loading (first load)
  if (isLoading && seats.length === 0 && !room) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  // Couldn't load (403 / gone)
  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.lg }}>
        <Icon name="alert-circle" size={44} color={colors.destructive} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.nafarat.loadError')}</Text>
        <Button label={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  const total = seats.length
  const done = seats.filter((s) => s.tripStatus === 'completed').length
  const allDone = total > 0 && done === total
  const collected = seats.reduce((sum, s) => (s.tripStatus === 'completed' ? sum + s.fareIqd : sum), 0)

  // All riders dropped → summary
  if (allDone) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, paddingTop: insets.top + Spacing.xl * 2, gap: Spacing.lg, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="checkmark-done-circle" size={40} color={colors.success} />
        </View>
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.nafarat.allDoneTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
          {t('captain.live.fareCollected', { fare: formatIqd(collected, isAr ? 'ar' : 'en') })}
        </Text>
        <Button label={t('captain.live.done')} onPress={() => router.replace('/(tabs)')} />
      </View>
    )
  }

  const pickups = seats.map((s) => s.pickup)
  const dropoffs = seats.map((s) => s.dropoff)
  const zoneName = (isAr ? dropoffZone?.nameAr : dropoffZone?.name) ?? t('captain.live.unknownZone')

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ height: '42%' }}>
        <TripMap
          showsUserLocation
          fitToCoords={[...pickups, ...dropoffs]}
          initialRegion={pickups[0] ? { latitude: pickups[0].latitude, longitude: pickups[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 } : undefined}
        >
          <NafaratMarkers pickups={pickups} dropoffs={dropoffs} />
        </TripMap>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.xl, paddingBottom: insets.bottom + Spacing.xl, gap: Spacing.lg }}>
        {/* header: title + destination + progress */}
        <View style={{ gap: Spacing.xs }}>
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>{t('captain.nafarat.title')}</Text>
          {/* native forceRTL mirrors this row in AR — no manual flip */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <Icon name="flag" size={15} color={colors.tint} />
            <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{zoneName}</Text>
          </View>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'], textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.nafarat.progress', { done, total })}
          </Text>
        </View>

        {/* pickup-zone breakdown */}
        {pickupBreakdown.length > 0 && (
          <View style={{ gap: Spacing.xs }}>
            {pickupBreakdown.map((p, i) => (
              <View key={p.zoneId ?? `u-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Icon name="location-outline" size={14} color={colors.subtle} />
                <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
                  {t('captain.live.pickupFromZone', { count: p.riderCount, zone: (isAr ? p.nameAr : p.name) ?? t('captain.live.unknownZone') })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* rider seats with drive */}
        <View style={{ gap: Spacing.md }}>
          {seats.map((s) => (
            <RiderSeatCard
              key={s.riderId}
              seat={s}
              busy={busy}
              onPickup={() => { if (s.tripId) pickup(s.tripId).catch(() => {}) }}
              onDropoff={() => { if (s.tripId) dropoff(s.tripId).catch(() => {}) }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
```

- [ ] **Step 4: Verify JSON + type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')" && npx tsc --noEmit
```
Expected: `json ok` then exit 0.

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add "app/(trip)/room/[id].tsx" i18n/en.json i18n/ar.json && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): add the Nafarat room screen + i18n"
```

---

### Task 9: Route abriyah → the room page (queue accept, resume, banner) + manual smoke

**Files:** Modify `app/(tabs)/trips.tsx`, `hooks/use-resume-active-trip.ts`, `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: the route `app/(trip)/room/[id].tsx` (Task 8); `CaptainOffer.offerType`; `Trip.tripType`/`Trip.roomId`.

- [ ] **Step 1: Queue accept → room page for room offers.** In `app/(tabs)/trips.tsx`, in `onAccept`, replace:

```tsx
      await accept(offer)
      router.push(`/(trip)/${offer.id}`)
```
with:
```tsx
      await accept(offer)
      router.push(offer.offerType === 'room' ? `/(trip)/room/${offer.id}` : `/(trip)/${offer.id}`)
```

- [ ] **Step 2: Resume → room page for abriyah.** In `hooks/use-resume-active-trip.ts`, replace:

```tsx
    router.push(`/(trip)/${trip.id}`)
```
with:
```tsx
    router.push(trip.tripType === 'abriyah' && trip.roomId ? `/(trip)/room/${trip.roomId}` : `/(trip)/${trip.id}`)
```

- [ ] **Step 3: Home banner → room page for abriyah.** In `app/(tabs)/index.tsx`, in `ActiveTripBanner`, replace the `onPress`:

```tsx
      onPress={() => router.push(`/(trip)/${trip.id}`)}
```
with:
```tsx
      onPress={() => router.push(trip.tripType === 'abriyah' && trip.roomId ? `/(trip)/room/${trip.roomId}` : `/(trip)/${trip.id}`)}
```

- [ ] **Step 4: Type-check** — `npx tsc --noEmit` → exit 0.

- [ ] **Step 5: Manual smoke test (EAS dev build, approved + online + activated captain).** Reload Metro (this feature is pure JS — no rebuild). With a dispatched Nafarat room (accept a `Nafarat room` offer from the Queue):
  - Accepting routes to the **Nafarat room page** (not the single-trip screen, which used to 404).
  - The map shows a **numbered pin per rider pickup** + a **dropoff dot per rider**, framed to fit.
  - Header shows the **destination zone**, **"0/N dropped off"**, and the **pickup-zone breakdown**.
  - Each rider card: **Call** dials the real number; **Pick up** advances that rider to in_progress; then **Drop off** completes them; the progress counter climbs.
  - When **all** riders are dropped → the **done summary** (total collected) → **Done** returns to tabs.
  - Relaunch mid-ride (or tap the home banner) → returns to the **room page**.
  - A regular trip still uses the existing single-trip screen unchanged.

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add "app/(tabs)/trips.tsx" hooks/use-resume-active-trip.ts "app/(tabs)/index.tsx" && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(nafarat): route abriyah accept/resume/banner to the room page"
```

---

## Self-Review

**Spec coverage:**
- Placement: offers in Queue → dedicated room page → Tasks 8, 9. ✓
- Map (pickup pin per rider + per-rider dropoff, fit) → Task 7 + Task 8. ✓
- Roster (name/fare/pickup zone/Call) + pickup-zone breakdown → Tasks 6, 8. ✓
- Per-rider Picked-up → Dropped-off drive + done summary → Tasks 5, 6, 8. ✓
- Data: `parsePointWkt`, extended members (phone+geometry), `getRoom`, `getRoomTrips`, join hook → Tasks 1–5. ✓
- Wiring (queue accept, resume, banner) → Task 9. ✓
- v1 bounds: polling (no WS), per-rider toggles, no offer suppression → enforced (no WS code; toggles in Task 6). ✓
- Reuse `captain.live.*`; add `captain.nafarat.*` → Task 8. ✓

**Placeholder scan:** none — every step is full code or an exact command. ✓

**Type consistency:** `RiderSeat` (Task 5) is consumed by Tasks 6 + 8 with the same fields; `getRoom`→`Room` (Task 3) used by Task 5; `getRoomTrips(captainId, roomId)` (Task 4) used by Task 5; `getRoomMembers` extended `RoomMember` (Task 2) consumed in Task 5's seat map; `NafaratMarkers({pickups, dropoffs})` (Task 7) used in Task 8; the route `/(trip)/room/${id}` created in Task 8 is what Task 9 pushes to. ✓

**Ordering invariant:** each task type-checks clean — leaf/service tasks (1–4) first, the hook (5) depends only on them, the card (6) + markers (7) depend on the hook/maplibre, the screen (8) wires them + adds i18n, and the navigation (9) comes last so the `/(trip)/room/[id]` route exists before anything pushes to it.
