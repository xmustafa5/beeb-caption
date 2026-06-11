# Captain App — Area 4: Trip Queue + Accept — Design

> Spec for the fourth build area of the Beeb Captain App (see `docs/CAPTAIN_ROADMAP.md`).
> Date: 2026-06-11. Grounded in the Captain App PRD (§3.5 Trip Queue), the backend handoff
> (`docs/frontend-summary.md` → Captain App / Real-Time Delivery), the live OpenAPI spec, and live
> probes against `https://beeb.madebyhaithem.com`. Builds on Area 3 (the presence provider exposes
> `online` + live `lastOffer`).

## 1. Goal

While **online**, the captain sees a live list of incoming offers — pending regular trips and open
Abriyah rooms (women-only rooms hidden for male captains, server-side) — on a dedicated **Queue
tab**. Tapping **Accept** takes the offer and navigates to the live-trip screen.

## 2. Scope

**In scope**
- `services/captain-queue.ts`: read the queue; accept a trip / accept a room.
- `hooks/use-trip-queue.ts`: polled query (gated on online + tab focus) + live-push refetch + accept mutations.
- Rework `app/(tabs)/trips.tsx` from the stub into the **Queue tab** (offline / empty / list states).
- `components/captain/offer-card.tsx`: one card per offer (regular vs. room).
- A **minimal placeholder** live-trip route `app/(trip)/[id].tsx` (Accept's navigation target;
  Area 5 fully builds it).
- Re-label the 2nd tab to "Queue" (tab-def + i18n).
- EN + AR i18n under `captain.queue.*`; RTL-aware.

**Out of scope (later areas)**
- The real live-trip screen (map, arrive/start/complete, member roster) — Area 5; this area only
  drops a placeholder route so Accept has a destination.
- Earnings (Area 6).
- A Decline action — declining is a no-op server-side (the offer stays for other captains); ignoring
  an offer is equivalent. Not built.
- A per-offer accept countdown — the backend has **no per-offer timeout** at v1 (first-to-accept
  wins, no auto-cancel), so a timer would be cosmetic/misleading. Not built.

## 3. Backend contract (verified)

Captain Bearer token; captain must be **approved + activated + online** for a meaningful queue.

| Endpoint | Behavior |
|---|---|
| `GET /api/captain/trip-queue` | → `200 { offers: CaptainOffer[] }`. Pending regular trips (`requested`) + open Abriyah rooms, oldest-first. **Women-only rooms pre-filtered out for non-female captains** (server-side — a male captain never receives one). 403 if not approved. (Verified: 200 `{offers:[]}` when empty; a rider-created `requested` trip appears.) |
| `POST /api/trips/{id}/accept` | → `200 Trip` (status `accepted`, captain assigned). A captain with an active trip → **409**; a stale accept (already taken) → **409**. Works from `requested` (regular). |
| `POST /api/abriyah/rooms/{id}/accept` | → `200 Room` (status `dispatched`; every member trip → `accepted`). Room not open → 400; women-only by a non-female captain → 403; captain already in a room → 409. **No locked/confirm step — accept dispatches immediately.** |

**CaptainOffer** (verified shape): `{ offer_type ("trip"|"room"), id, zone_id?, room_type? ("mixed"|"women_only"|null), pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, fare_iqd (integer IQD), created_at }`.

> Note: the offer `id` is the **trip id** for `offer_type:"trip"` and the **room id** for
> `offer_type:"room"`. Accept routes on `offer_type`. On success, navigate to `/(trip)/{id}` where
> `{id}` is the trip id (for a room, the backend transitions the member trips; the captain's live
> trip id is resolved on the live-trip screen in Area 5 — for the placeholder, pass the offer id
> and let Area 5 reconcile).

## 4. Architecture — units

### 4.1 `services/captain-queue.ts` (new)

```ts
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

getTripQueue(): Promise<CaptainOffer[]>     // GET /api/captain/trip-queue → maps {offers}
acceptTrip(tripId: string): Promise<void>   // POST /api/trips/{id}/accept
acceptRoom(roomId: string): Promise<void>   // POST /api/abriyah/rooms/{id}/accept
```

- `toOffer(backend)` snake→camel mapper. Accept fns don't need the response body here (the
  live-trip screen re-fetches the trip in Area 5); they just resolve on 200 / throw on error.

### 4.2 `hooks/use-trip-queue.ts` (new)

```ts
useTripQueue(): {
  offers: CaptainOffer[]
  isLoading: boolean
  isRefetching: boolean
  refetch: () => void
  accept: (offer: CaptainOffer) => Promise<void>   // routes acceptTrip/acceptRoom by offerType
  accepting: boolean
}
```

- `useQuery(['captain','trip-queue'])`, `queryFn: getTripQueue`, **`enabled: online && focused`**,
  `refetchInterval: online && focused ? 8000 : false`. `online` from `useCaptainPresence()`.
  `focused` = **`useTabStore((s) => s.activeTabIndex) === 1`** (the Queue is tab index 1). The tabs
  are a PagerView, so `useIsFocused` from React Navigation would NOT reflect the active page — the
  tab-store index is the source of truth. (The hook takes the focus flag as the gate; it does not
  import navigation focus.)
- An effect: when `useCaptainPresence().lastOffer` changes, call `refetch()` (live push → instant).
- `accept(offer)`: a mutation that calls `acceptTrip`/`acceptRoom` by `offer.offerType`; on success
  the caller navigates; on error the caller maps it. `onSettled` → invalidate the queue.

### 4.3 `app/(tabs)/trips.tsx` → the Queue tab (rework)

States (reads `useCaptainPresence().online` + `useTripQueue()`):
- **offline** → centered prompt: "Go online to receive trips" (icon + text). No polling.
- **online, loading** → spinner.
- **online, empty** → "Waiting for trips…" empty state (a subtle pulsing/however simple).
- **online, offers** → a `FlatList`/`ScrollView` of `<OfferCard>` (oldest-first as returned).
- Pull-to-refresh (`RefreshControl`) calls `refetch()`.
- A header ("Trip queue" / count).

### 4.4 `components/captain/offer-card.tsx` (new)

Props: `{ offer: CaptainOffer; onAccept: () => void; accepting: boolean }`.
- **Regular trip** (`offerType:'trip'`): a "NEW · Trip" label; pickup distance ("X km away" =
  `haversineKm(captainLoc, pickup)` via the captain's current location from `useCurrentLocation`);
  trip distance (pickup→dropoff haversine); fare (IQD). **Accept** button.
- **Abriyah room** (`offerType:'room'`): a "NEW · Abriyah" label; zone (id for now — no zone-name
  lookup), a room-type badge (mixed / women-only); fare. **Accept room** button.
- Accept button shows a loading state while `accepting`. RTL-aware.

### 4.5 Placeholder live-trip route `app/(trip)/[id].tsx` (new, minimal)

A `(trip)` route group + a minimal `[id].tsx` screen: reads the `id` param, shows "Trip accepted ·
{id}" + a short "live trip screen coming next" line + a back affordance. This is the navigation
target for Accept; **Area 5 replaces its body** with the real map + leg actions. Also a
`app/(trip)/_layout.tsx` (Stack, headerShown false) for the group.

### 4.6 Tab re-label + i18n

- The 2nd tab is currently "trips". **Decision: change only the displayed label, keep the route file
  `trips.tsx`** (renaming a route is riskier and unnecessary). The plan's tab-label task will inspect
  how `components/tab-bar/custom-tab-bar.tsx` resolves its label (i18n `tabs.trips` or a TAB_DEFS
  entry) and point the Queue tab's label at the queue string — `tabs.trips` value updated to "Queue"
  / "الطابور", OR a new `captain.queue.tabLabel` referenced from the tab def, whichever matches how
  the tab bar currently reads labels. The implementer confirms the mechanism before editing.
- `captain.queue.*` keys: `tabLabel`, `title`, `offlineTitle`, `offlineBody`, `emptyTitle`,
  `emptyBody`, `newTrip`, `newRoom`, `kmAway`, `tripDistance`, `roomMixed`, `roomWomenOnly`,
  `accept`, `acceptRoom`, `taken`, `acceptFailed`.

## 5. Data flow

```
Queue tab active (index 1) + online → useTripQueue → GET /trip-queue every 8s
  + presence.lastOffer changes → refetch() (live push)
offline → "go online" prompt, no polling
OfferCard Accept → accept(offer):
  offerType 'trip' → acceptTrip(id) → 200 → router.push(`/(trip)/${id}`)
  offerType 'room' → acceptRoom(id) → 200 → router.push(`/(trip)/${id}`)
  409 → toast 'taken' + refetch ; 403 → refetch ; else → 'acceptFailed'
```

## 6. Error handling

Via `parseApiError`.

| Status | Context | UX |
|---|---|---|
| 409 | accept | "This trip was already taken" (or "you already have an active trip") + refetch the queue. |
| 403 | accept room | Women-only mismatch (server pre-filters, so defensive) → refetch. |
| 400 | accept room | Room no longer open → refetch. |
| 401 | any | Interceptor clears session → AuthGate → login. |
| 429 / network | any | `common.rateLimited` / `common.networkError`. |

## 7. i18n / RTL

Arabic-primary. Invoke the `react-native-rtl-positioning` skill for the offer card + queue states
(`flexDirection` ternary, no physical margins; the room-type badge + distance row flip). IQD via
`lib/format-currency`; distances rounded to 1 decimal.

## 8. Verification (no unit-test runner)

Test captain `9647000000098` / `16001600` (male) + test rider `9647000000099` / `16001600`.

- `npx tsc --noEmit` + `npx expo lint` clean.
- Live (pace to avoid the edge 429): rider `POST /api/trips` (pickup/dropoff in a zone) → `requested`
  trip; captain online + ping; `GET /api/captain/trip-queue` shows the offer; `POST /api/trips/{id}/accept`
  → 200; re-query queue → offer gone. (A `requested` trip `b96dc406-…` was created during design.)
- Women-only filter: the male test captain's queue never includes a `women_only` room (server-side;
  trust + spot-check if a women-only room can be seeded).
- Manual (Expo Go): online on Queue tab → offer card appears → Accept → lands on the placeholder
  live-trip screen.

## 9. Open dependencies / notes

1. **Live-trip placeholder** (`app/(trip)/[id].tsx`) is intentionally minimal — Area 5 owns the real
   screen. Accept navigates there with the offer id; Area 5 reconciles the actual trip.
2. **Focus gate** uses the `useTabStore` active index (Queue = index 1) since the tabs are a
   PagerView, not stack screens — `useIsFocused` won't reflect the pager's active page.
3. **Zone name** — offers carry only `zone_id`; no public zone-name lookup is wired for the captain,
   so the room card shows a generic "Abriyah" label, not the zone name. Acceptable for v1.
4. **lastOffer seam** from Area 3 drives the instant refetch; polling is the baseline.
