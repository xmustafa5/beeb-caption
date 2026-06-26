# Trip Queue → Map + Carousel Redesign

**Date:** 2026-06-26
**Status:** Design (approved in brainstorming; pending spec review)
**Target repo:** `beeb-caption` (captain app)
**Screen:** `app/(tabs)/trips.tsx` (`QueueScreen`, the "Queue" tab)

## Goal

Redesign the captain's Trip Queue from a vertical list of offer cards into a
**map-centric** screen: entering the tab shows a full-screen interactive map with the
**client pickup point of every pending offer**, and a **horizontal carousel** pinned to the
bottom to browse and accept offers. The map is a visual overview; the carousel is the only
way to select an offer.

## Non-goals

- No backend change — offers already carry pickup + dropoff coordinates.
- No "decline" button (the backend has no decline endpoint; offers expire server-side).
- No dropoff marker or route line on the map.
- No change to the accept flow (still `accept(offer)` → navigate to `/(trip)/{id}`).
- No change to `components/trip/trip-map.tsx` (reused as-is via `children` + ref).

## Behavior (the agreed contract)

1. **Map shows every offer's pickup** as a marker. Markers are **not tappable** — they do not
   select an offer.
2. **Selection is carousel-only.** The carousel's currently-centered card is the "active"
   offer.
3. The **active** offer's pickup marker is **highlighted** (larger, filled `tint`); all other
   pickup markers are dimmed/smaller.
4. When the active offer changes (manual swipe or auto-advance), the map **re-highlights** the
   new pickup and the camera **animates to center** it.
5. **No dropoff/route on the map.** The destination appears only as a **place name** inside the
   card.
6. Each card shows the **pickup name and destination name** (reverse-geocoded), plus type,
   fare, "km away", and "trip km".
7. Above the carousel, a **30-second countdown** runs for the active offer. On expiry, the
   carousel **auto-advances to the next offer**, **wrapping** from the last back to the first.
8. The captain can **swipe** the carousel to switch manually at any time; a manual switch
   **resets** the 30s countdown.
9. The countdown + auto-advance are **disabled when there is only one offer** (nothing to
   rotate to).
10. The map is **interactive** (pan/zoom). To free horizontal gestures for the map/carousel,
    the swipeable-tabs side-swipe is **disabled while the Queue tab is active**; the captain
    switches tabs via the bottom tab bar.

## Architecture

`TripMap` is reused unchanged: it renders `{children}` inside the MapLibre `<Map>` (so we plot
custom pickup markers as children) and exposes `animateToRegion(region, durationMs)` via its
`TripMapHandle` ref (so we pan to the active pickup). `dragPan`/`touchZoom` are on by default.

### Components (focused units)

| Unit | File | Responsibility | Depends on |
| --- | --- | --- | --- |
| `QueueScreen` | `app/(tabs)/trips.tsx` (rewrite) | Orchestrates: data, `activeIndex` state, renders map + markers + carousel, drives camera, handles accept. | `useTripQueue`, `useCaptainPresence`, `useCurrentLocation`, `TripMap`, `OfferCarousel`, `OfferPickupMarker` |
| `OfferPickupMarker` | `components/captain/offer-pickup-marker.tsx` | A single pickup pin (active/inactive styling). Non-interactive. | `@maplibre/maplibre-react-native` `Marker`, `useThemeColors` |
| `OfferCarousel` | `components/captain/offer-carousel.tsx` | Horizontal paging `FlatList` of cards + the 30s countdown + auto-advance. Reports active-index changes; scrolls programmatically on auto-advance. | `OfferCard`, `react-native-reanimated`, `FlatList` |
| `OfferCard` | `components/captain/offer-card.tsx` (adapt existing) | One offer's card sized to the carousel: type/fare/distances + pickup & destination names + Accept. | `usePlaceName`, `formatIqd`, `haversineKm`, `Button`, `Icon` |
| `usePlaceName` | `hooks/use-place-name.ts` | `reverseGeocode(coord, lang)` wrapped in `useQuery`, cached by rounded coord; returns `{ name, isLoading }`. | `@tanstack/react-query`, `services/places.reverseGeocode` |

### Data flow

```
useTripQueue() ──> offers[] ──┬──> map: one <OfferPickupMarker> per offer (active highlighted)
                              └──> carousel: one <OfferCard> per offer
activeIndex (QueueScreen state) <──> carousel scroll position (onMomentumScrollEnd)
activeIndex change ──> mapRef.animateToRegion(offers[activeIndex].pickup) + marker re-highlight
30s timer (OfferCarousel) ──> onAutoAdvance ──> setActiveIndex((i+1) % len) + scrollToIndex
usePlaceName(pickup/dropoff) ──> card names (react-query cache)
Accept ──> useTripQueue.accept(offer) ──> router.push(`/(trip)/${offer.id}`)
```

### Pager-swipe gating

In `app/(tabs)/_layout.tsx`, the PagerView gets `scrollEnabled={activeTabIndex !== QUEUE_INDEX}`
(`QUEUE_INDEX` is the Queue tab's index — already referenced as `1` in `use-trip-queue.ts`).
While the Queue tab is active, side-swipe-to-change-tabs is off; the tab bar still works.

## States

- **Offline** (`!online`) → keep the current offline message (cloud icon + copy). No map.
- **Online, loading** → the map with the captain's location + a centered spinner overlay until
  the first fetch resolves.
- **Online, no offers** → the map centered on the captain's location + a small "waiting for
  trips" pill. No carousel, no timer.
- **Online, offers** → map with all pickup markers + the carousel + countdown.

## Edge cases

- **Offers list changes while viewing** (new offer arrives via WS/poll, or one expires): clamp
  `activeIndex` to `min(activeIndex, offers.length - 1)`. If the active offer's `id` is gone,
  snap to the nearest valid index without a jarring jump. The carousel keys by
  `offerType-id` so React reconciles stably.
- **Single offer**: render the card; hide the countdown bar; no auto-advance.
- **`reverseGeocode` pending/fails**: the card shows a subtle "…" placeholder for the
  unresolved name (never blocks the card or Accept). Results cached by rounded coord, so a name
  resolves once per location for the session.
- **Accept errors** (409 taken / network): keep the existing handling — show the inline error,
  refetch the queue; on 409 the card disappears on the next list update.

## Reverse-geocoding load

Names come from the existing `reverseGeocode` (Photon/Nominatim — external OSM). One lookup per
unique pickup and per unique dropoff, deduped/cached by `usePlaceName`'s react-query key
(rounded coord, `staleTime: Infinity`). For a typical handful of offers this is a few cached
calls; not a concern. (If queues ever grow large, resolving only the active ± neighbor cards is
a future optimization — not implemented now.)

## Theming / RTL

All new UI uses `useThemeColors()` (violet palette) and the project RTL conventions
(`flexDirection` reversal / physical-edge ternaries, no `marginStart/End`). The carousel is a
horizontal list; under native `forceRTL` the paging direction follows the platform — the
carousel sets an explicit `inverted`/`layoutDirection`-equivalent only if testing shows the
order is wrong in Arabic (verify during implementation, mirroring the PagerView `layoutDirection`
note in CLAUDE.md).

## Verification

- `npx tsc --noEmit` clean.
- Manual (dev build): on the Queue tab while online with ≥2 offers — map shows all pickups, the
  active pickup is highlighted, the card shows pickup+destination names, the 30s bar counts down
  and auto-advances (wrapping), a manual swipe re-centers the map + resets the timer, and Accept
  navigates to the live-trip screen. With 1 offer the timer is hidden. With 0 offers the
  "waiting" state shows. Side-swipe does not change tabs while on Queue; the tab bar does.

## Out of scope / follow-ups

- Decline endpoint + X button (needs backend).
- Resolving names only for visible/adjacent cards (perf optimization).
