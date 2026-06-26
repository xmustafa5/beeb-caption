# Trip Queue Map + Carousel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the captain's Trip Queue (`app/(tabs)/trips.tsx`) into a full-screen interactive map showing every offer's pickup point, with a bottom horizontal carousel (30s auto-advance) as the only offer selector.

**Architecture:** Reuse the ported `TripMap` (renders `{children}` inside the MapLibre map + exposes `animateToRegion` via ref). `QueueScreen` owns an `activeIndex`; the carousel reports swipes and receives auto-advance; the map highlights the active offer's pickup marker and pans to it. Destination is shown as a reverse-geocoded place name in the card, not on the map.

**Tech Stack:** Expo Router, `@maplibre/maplibre-react-native`, `react-native-reanimated` (countdown), TanStack Query (place-name cache), `react-native` `FlatList` (carousel).

## Global Constraints

- **Source/target repo (DST):** `c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption`. Branch: `feat/maplibre-map-port` (current).
- **No test framework** in this repo (no Jest). Per-task verification is **`npx tsc --noEmit`** (exit 0) + the manual smoke described in the final task. Do **not** add a test harness or write `.test` files.
- **No backend change.** Offers already carry `pickupLat/pickupLng` + `dropoffLat/dropoffLng` (`services/captain-queue.ts`, `CaptainOffer`).
- **Do not modify** `components/trip/trip-map.tsx` — reuse it via `children` + the `TripMapHandle` ref.
- **Reuse existing i18n keys** under `captain.queue.*` (newTrip, newRoom, kmAway, tripDistance, roomMixed, roomWomenOnly, accept, acceptRoom, taken, acceptFailed, emptyTitle/Body, offlineTitle/Body). No new keys.
- **Markers are not tappable** — selection is carousel-only. **No dropoff/route on the map.**
- **30s** countdown, auto-advance **wraps** (last→first), resets on manual swipe, **hidden when ≤1 offer**.
- **Theming/RTL:** colors via `useThemeColors()`; follow project RTL conventions (no `marginStart/End`; physical-edge ternaries / `flexDirection`). Queue tab pager index is **1** (`SCREENS = [Home, Trips(Queue), Notifications, Profile]`).
- Spec: `docs/superpowers/specs/2026-06-26-queue-map-redesign-design.md`.

---

## File Structure

- Create `hooks/use-place-name.ts` — reverse-geocode a coord, cached.
- Create `components/captain/offer-pickup-marker.tsx` — one map pin (active/inactive).
- Modify `components/captain/offer-card.tsx` — add pickup + destination name rows (keep prop API).
- Create `components/captain/offer-carousel.tsx` — horizontal paging list + 30s countdown + auto-advance.
- Modify `app/(tabs)/trips.tsx` — rewrite `QueueScreen` (map + markers + carousel + states).
- Modify `app/(tabs)/_layout.tsx` — disable pager side-swipe while on the Queue tab.

---

### Task 1: `usePlaceName` hook

**Files:**
- Create: `hooks/use-place-name.ts`

**Interfaces:**
- Consumes: `reverseGeocode(coord: LatLng, lang: 'en'|'ar') => Promise<string|null>` from `@/services/places`; `LatLng` from `@/hooks/use-current-location`.
- Produces: `usePlaceName(coord: LatLng | null) => { name: string | null; isLoading: boolean }`.

- [ ] **Step 1: Create the hook**

```ts
// hooks/use-place-name.ts
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { reverseGeocode } from '@/services/places'
import type { LatLng } from '@/hooks/use-current-location'

/**
 * Reverse-geocodes a coordinate to a human place name, cached for the session.
 * Keyed by rounded coord + language so the same spot resolves once. Returns
 * { name: null, isLoading: true } until it resolves; name stays null on failure.
 */
export function usePlaceName(coord: LatLng | null): { name: string | null; isLoading: boolean } {
  const { i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  // ~11 m precision — enough to dedupe pickups/dropoffs without losing distinct places.
  const key = coord ? `${coord.latitude.toFixed(4)},${coord.longitude.toFixed(4)}` : null

  const query = useQuery({
    queryKey: ['place-name', key, lang],
    queryFn: () => reverseGeocode(coord as LatLng, lang),
    enabled: coord != null,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })

  return { name: query.data ?? null, isLoading: query.isLoading && coord != null }
}
```

- [ ] **Step 2: Type-check**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add hooks/use-place-name.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): add usePlaceName reverse-geocode hook"
```

---

### Task 2: `OfferPickupMarker` map pin

**Files:**
- Create: `components/captain/offer-pickup-marker.tsx`

**Interfaces:**
- Consumes: `Marker` from `@maplibre/maplibre-react-native`; `LatLng` from `@/hooks/use-current-location`; `useThemeColors`.
- Produces: `OfferPickupMarker({ coord: LatLng, active: boolean })` — a non-interactive map marker. Render as a child of `<TripMap>`.

- [ ] **Step 1: Create the marker**

```tsx
// components/captain/offer-pickup-marker.tsx
import { View } from 'react-native'
import { Marker } from '@maplibre/maplibre-react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import type { LatLng } from '@/hooks/use-current-location'

interface OfferPickupMarkerProps {
  coord: LatLng
  active: boolean
}

/** A pickup pin on the queue map. Active = larger filled tint; inactive = small muted dot.
 *  Non-interactive — selection happens in the carousel, not by tapping the map. */
export function OfferPickupMarker({ coord, active }: OfferPickupMarkerProps) {
  const colors = useThemeColors()
  const size = active ? 22 : 14
  return (
    <Marker lngLat={[coord.longitude, coord.latitude]} anchor="center">
      <View
        pointerEvents="none"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active ? colors.tint : colors.muted,
          borderWidth: active ? 3 : 2,
          borderColor: '#FFFFFF',
          opacity: active ? 1 : 0.85,
          boxShadow: active ? '0px 2px 8px rgba(0,0,0,0.35)' : '0px 1px 3px rgba(0,0,0,0.25)',
        }}
      />
    </Marker>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/captain/offer-pickup-marker.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): add OfferPickupMarker map pin"
```

---

### Task 3: Add place-name rows to `OfferCard`

**Files:**
- Modify (rewrite): `components/captain/offer-card.tsx`

**Interfaces:**
- Consumes: `usePlaceName` (Task 1); `CaptainOffer`, `LatLng`, `formatIqd`, `haversineKm`, `Button`, `Icon`, `useThemeColors`.
- Produces: `OfferCard({ offer: CaptainOffer, captainLocation: LatLng | null, onAccept: () => void, accepting: boolean })` — **prop API unchanged** so existing consumers still compile.

- [ ] **Step 1: Rewrite the card with pickup + destination name rows**

Replace the entire contents of `components/captain/offer-card.tsx` with:

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
import { usePlaceName } from '@/hooks/use-place-name'
import type { LatLng } from '@/hooks/use-current-location'
import type { CaptainOffer } from '@/services/captain-queue'

const isRTL = I18nManager.isRTL

interface OfferCardProps {
  offer: CaptainOffer
  captainLocation: LatLng | null
  onAccept: () => void
  accepting: boolean
}

function PlaceRow({ icon, color, name, loading }: { icon: React.ComponentProps<typeof Icon>['name']; color: string; name: string | null; loading: boolean }) {
  const colors = useThemeColors()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <Icon name={icon} size={15} color={color} />
      <Text
        numberOfLines={1}
        style={{ ...Typography['caption-sm'], color: colors.text, flex: 1, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}
      >
        {name ?? (loading ? '…' : '—')}
      </Text>
    </View>
  )
}

export function OfferCard({ offer, captainLocation, onAccept, accepting }: OfferCardProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()

  const isRoom = offer.offerType === 'room'
  const pickup: LatLng = { latitude: offer.pickupLat, longitude: offer.pickupLng }
  const dropoff: LatLng = { latitude: offer.dropoffLat, longitude: offer.dropoffLng }

  const awayKm = captainLocation ? haversineKm(captainLocation, pickup) : null
  const tripKm = haversineKm(pickup, dropoff)

  const pickupName = usePlaceName(pickup)
  const dropName = usePlaceName(dropoff)

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        gap: Spacing.md,
        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.10)',
      }}
    >
      {/* header: type + fare */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
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
        <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>
          {formatIqd(offer.fareIqd, isAr ? 'ar' : 'en')}
        </Text>
      </View>

      {/* pickup + destination place names */}
      <View style={{ gap: Spacing.xs }}>
        <PlaceRow icon="ellipse" color={colors.tint} name={pickupName.name} loading={pickupName.isLoading} />
        <PlaceRow icon="location" color={colors.destructive} name={dropName.name} loading={dropName.isLoading} />
      </View>

      {/* distances */}
      <View style={{ gap: 2, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
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
        {isRoom && offer.roomType !== 'women_only' && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.roomMixed')}
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

- [ ] **Step 2: Type-check (the existing QueueScreen still imports this card — prop API is unchanged)**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/captain/offer-card.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): show pickup + destination place names on the offer card"
```

---

### Task 4: `OfferCarousel` (paging list + 30s countdown + auto-advance)

**Files:**
- Create: `components/captain/offer-carousel.tsx`

**Interfaces:**
- Consumes: `OfferCard` (Task 3); `CaptainOffer`; `LatLng`; `react-native-reanimated`; `useThemeColors`.
- Produces: `OfferCarousel({ offers, activeIndex, onIndexChange, captainLocation, onAccept, accepting })`:
  - `offers: CaptainOffer[]`, `activeIndex: number`, `onIndexChange: (index: number) => void`, `captainLocation: LatLng | null`, `onAccept: (offer: CaptainOffer) => void`, `accepting: boolean`.

- [ ] **Step 1: Create the carousel**

```tsx
// components/captain/offer-carousel.tsx
import { useEffect, useRef } from 'react'
import { View, FlatList, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, cancelAnimation, runOnJS, Easing } from 'react-native-reanimated'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Spacing } from '@/constants/Spacing'
import { OfferCard } from '@/components/captain/offer-card'
import type { CaptainOffer } from '@/services/captain-queue'
import type { LatLng } from '@/hooks/use-current-location'

const ADVANCE_MS = 30000

interface OfferCarouselProps {
  offers: CaptainOffer[]
  activeIndex: number
  onIndexChange: (index: number) => void
  captainLocation: LatLng | null
  onAccept: (offer: CaptainOffer) => void
  accepting: boolean
}

export function OfferCarousel({ offers, activeIndex, onIndexChange, captainLocation, onAccept, accepting }: OfferCarouselProps) {
  const colors = useThemeColors()
  const { width } = useWindowDimensions()
  const listRef = useRef<FlatList<CaptainOffer>>(null)
  const progress = useSharedValue(0)
  const count = offers.length

  // Countdown + auto-advance. Resets whenever the active offer or the count changes
  // (a manual swipe updates activeIndex → this effect re-runs → timer restarts).
  useEffect(() => {
    if (count <= 1) return
    progress.value = 0
    progress.value = withTiming(1, { duration: ADVANCE_MS, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(onIndexChange)((activeIndex + 1) % count)
    })
    return () => cancelAnimation(progress)
  }, [activeIndex, count, progress, onIndexChange])

  // Keep the list scrolled to the active card (covers auto-advance + external changes).
  useEffect(() => {
    if (activeIndex >= 0 && activeIndex < count) {
      listRef.current?.scrollToIndex({ index: activeIndex, animated: true })
    }
  }, [activeIndex, count])

  const barStyle = useAnimatedStyle(() => ({ width: `${(1 - progress.value) * 100}%` }))

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width)
    if (idx !== activeIndex && idx >= 0 && idx < count) onIndexChange(idx)
  }

  return (
    <View style={{ gap: Spacing.sm }}>
      {/* 30s countdown bar — only when there is more than one offer to rotate through */}
      {count > 1 && (
        <View style={{ height: 3, marginHorizontal: Spacing.xl, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }}>
          <Animated.View style={[{ height: 3, borderRadius: 2, backgroundColor: colors.tint }, barStyle]} />
        </View>
      )}

      <FlatList
        ref={listRef}
        data={offers}
        keyExtractor={(o) => `${o.offerType}-${o.id}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: Spacing.xl }}>
            <OfferCard
              offer={item}
              captainLocation={captainLocation}
              onAccept={() => onAccept(item)}
              accepting={accepting}
            />
          </View>
        )}
      />
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/captain/offer-carousel.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): add OfferCarousel with 30s auto-advance"
```

---

### Task 5: Rewrite `QueueScreen` (map + markers + carousel)

**Files:**
- Modify (rewrite): `app/(tabs)/trips.tsx`

**Interfaces:**
- Consumes: `TripMap`, `TripMapHandle` from `@/components/trip/trip-map`; `OfferPickupMarker` (Task 2); `OfferCarousel` (Task 4); `useTripQueue`, `useCaptainPresence`, `useCurrentLocation`, `parseApiError`, `CaptainOffer`.

- [ ] **Step 1: Rewrite the screen**

Replace the entire contents of `app/(tabs)/trips.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { TripMap, type TripMapHandle } from '@/components/trip/trip-map'
import { OfferPickupMarker } from '@/components/captain/offer-pickup-marker'
import { OfferCarousel } from '@/components/captain/offer-carousel'
import { useTripQueue } from '@/hooks/use-trip-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { parseApiError } from '@/lib/api'
import type { CaptainOffer } from '@/services/captain-queue'

export default function QueueScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { online } = useCaptainPresence()
  const { offers, isLoading, accept, accepting, refetch } = useTripQueue()
  const { location, fallback } = useCurrentLocation()
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const mapRef = useRef<TripMapHandle>(null)

  // Keep activeIndex in range as offers arrive/expire.
  useEffect(() => {
    if (activeIndex > offers.length - 1) setActiveIndex(Math.max(0, offers.length - 1))
  }, [offers.length, activeIndex])

  // Pan the camera to the active offer's pickup whenever it changes.
  const active = offers[activeIndex]
  useEffect(() => {
    if (!active) return
    mapRef.current?.animateToRegion({
      latitude: active.pickupLat,
      longitude: active.pickupLng,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    })
  }, [active?.id, active?.pickupLat, active?.pickupLng])

  async function onAccept(offer: CaptainOffer) {
    setError(null)
    try {
      await accept(offer)
      router.push(`/(trip)/${offer.id}`)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 409) setError(t('captain.queue.taken'))
      else if (info.status !== 403 && info.status !== 400) {
        setError(t(info.isNetwork ? 'common.networkError' : 'captain.queue.acceptFailed'))
      }
      refetch()
    }
  }

  // Offline → keep the simple offline message (no map).
  if (!online) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md }}>
        <Icon name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.queue.offlineTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.offlineBody')}</Text>
      </View>
    )
  }

  const center = location ?? fallback
  const hasOffers = offers.length > 0

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <TripMap
        ref={mapRef}
        initialRegion={{
          latitude: active?.pickupLat ?? center.latitude,
          longitude: active?.pickupLng ?? center.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation
      >
        {offers.map((o, i) => (
          <OfferPickupMarker
            key={`${o.offerType}-${o.id}`}
            coord={{ latitude: o.pickupLat, longitude: o.pickupLng }}
            active={i === activeIndex}
          />
        ))}
      </TripMap>

      {/* Loading overlay (first fetch) */}
      {isLoading && !hasOffers && (
        <View style={{ position: 'absolute', top: insets.top + Spacing.xl, alignSelf: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      )}

      {/* Online but no offers → waiting pill over the map */}
      {!isLoading && !hasOffers && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + Spacing.lg,
            alignSelf: 'center',
            backgroundColor: colors.card,
            borderRadius: 999,
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.sm,
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            boxShadow: '0px 2px 10px rgba(0,0,0,0.18)',
          }}
        >
          <Icon name="hourglass-outline" size={16} color={colors.subtle} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{t('captain.queue.emptyTitle')}</Text>
        </View>
      )}

      {/* Offers → bottom carousel */}
      {hasOffers && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + Spacing.md, gap: Spacing.sm }}>
          {error && (
            <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'center', marginHorizontal: Spacing.xl }}>
              {error}
            </Text>
          )}
          <OfferCarousel
            offers={offers}
            activeIndex={activeIndex}
            onIndexChange={setActiveIndex}
            captainLocation={location}
            onAccept={onAccept}
            accepting={accepting}
          />
        </View>
      )}
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add "app/(tabs)/trips.tsx" && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): rewrite QueueScreen as map + offer carousel"
```

---

### Task 6: Disable pager side-swipe on the Queue tab

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: the existing `activeIndex` state in `TabLayout`.

- [ ] **Step 1: Add a Queue-index constant**

In `app/(tabs)/_layout.tsx`, just below `const TAB_PATHS = [...]` (line 16), add:

```tsx
const QUEUE_INDEX = 1 // 'trips' screen = the Queue tab
```

- [ ] **Step 2: Gate `scrollEnabled` on the PagerView**

In the `<PagerView>` props (after `initialPage={0}`), add the `scrollEnabled` line:

```tsx
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        scrollEnabled={activeIndex !== QUEUE_INDEX}
        layoutDirection={isRTL ? 'rtl' : 'ltr'}
```

- [ ] **Step 3: Type-check**

Run: `cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual smoke test (dev build / EAS build on device)**

Go online, open the **Queue** tab with the captain having ≥2 pending offers, and verify:
- The map fills the screen with a pickup pin for **every** offer; the **active** one is the large filled pin.
- The bottom carousel shows the active offer's card with **pickup + destination place names** (after a moment), fare, and distances.
- A thin bar above the carousel depletes over **30s**, then the carousel **auto-advances** to the next offer (and **wraps** after the last); the highlighted pin and the map center follow.
- **Swiping** the carousel switches offers, re-centers the map on that pickup, and **resets** the 30s bar.
- With **one** offer, the countdown bar is hidden.
- With **no** offers, the map shows with a "waiting for trips" pill; offline shows the offline message.
- **Side-swipe does not change tabs** while on Queue; the bottom tab bar does. Tabs still swipe normally elsewhere.
- Tapping **Accept** navigates to `/(trip)/{id}`.
- In Arabic (RTL), the carousel order and swipe direction read correctly. If the order is reversed, set the FlatList to account for RTL (e.g. an explicit reversed data order or `I18nManager`-aware offset math) — note it and fix in `offer-carousel.tsx`.

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add "app/(tabs)/_layout.tsx" && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(queue): disable tab side-swipe while on the Queue tab"
```

---

## Self-Review

**Spec coverage:**
- Interactive map + all pickups + active highlight + non-tappable markers → Tasks 2, 5. ✓
- Selection carousel-only; map follows carousel → Task 5 (`activeIndex` drives markers + camera). ✓
- No dropoff/route on map; destination as place name in card → Tasks 3, 5. ✓
- Pickup + destination names (reverse-geocoded, cached) → Tasks 1, 3. ✓
- 30s countdown + auto-advance + wrap + reset-on-swipe + hidden-when-1 → Task 4. ✓
- Pager side-swipe disabled on Queue tab → Task 6. ✓
- States offline / loading / no-offers (waiting pill) / offers → Task 5. ✓
- No backend change, no `TripMap` change → enforced in Global Constraints. ✓
- No new i18n keys → reuses `captain.queue.*` + `common.networkError`. ✓

**Placeholder scan:** none — every step has full code or an exact command. ✓

**Type consistency:** `usePlaceName(coord) → { name, isLoading }` (Task 1) is consumed exactly in Task 3; `OfferPickupMarker({ coord, active })` (Task 2) used in Task 5; `OfferCarousel({ offers, activeIndex, onIndexChange, captainLocation, onAccept, accepting })` (Task 4) used in Task 5; `OfferCard` prop API unchanged (Task 3) so it composes in both the carousel and any prior consumer; `TripMapHandle.animateToRegion(region, durationMs?)` and the `children` slot match `components/trip/trip-map.tsx`. ✓

**Ordering invariant:** each task type-checks clean — new modules (1, 2, 4) depend only on present/earlier files; the `OfferCard` rewrite (3) keeps its prop API so the still-original `QueueScreen` compiles; the screen rewrite (5) and pager gating (6) come last.
