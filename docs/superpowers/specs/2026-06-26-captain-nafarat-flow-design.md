# Captain Nafarat (Abriyah) Flow

**Date:** 2026-06-26
**Status:** Design (approved in brainstorming; pending spec review)
**Target repo:** `beeb-caption` (captain app)
**Source of truth for the API:** `docs/abriyah-integration-guide.md` (verified live against prod 2026-06-26)

## Goal

Give the captain a complete **Nafarat (Abriyah) pooled-ride** experience: discover room
offers in the existing Queue, accept one, and then manage the **pool of riders** on a
dedicated screen — see who's in the room (names, fares, phone), where they're picked up and
dropped, and drive each rider's trip through pickup → dropoff.

## Why this is needed (current gap)

Nafarat is only half-wired today:
- Room offers already arrive in the Queue (`/api/captain/trip-queue` returns `offerType:'room'`)
  and `acceptRoom()` already calls `POST /api/abriyah/rooms/{id}/accept`.
- **But** accepting a room navigates to `app/(trip)/[id].tsx` with the **room** id, and that
  screen calls `GET /api/trips/{id}` — a room id is not a trip id, so it can't load. The
  post-accept experience is effectively broken.
- `services/abriyah-members.ts` drops the rider `phone` and `pickup_wkt`/`dropoff_wkt`, so the
  captain can't call riders or see pickups on a map.

## Non-goals (v1)

- No WebSocket realtime — v1 **polls**. (WS room events `room.dispatched` etc. are a fast follow.)
- No forced pickup **sequence/optimization** — the captain drives riders in any order.
- No change to the regular single-trip screen `app/(trip)/[id].tsx` (it still serves a trip id;
  Nafarat just stops routing there).
- No backend changes — the pool is driven via existing endpoints.
- No "skip/decline room" — offers expire server-side.

## Key data facts (from the guide + verified endpoints)

- A **room** is keyed by the **dropoff zone**; riders are pooled by destination, picked up from
  anywhere. Up to `max_riders` (default 4). Each rider billed independently.
- After a captain accepts, the room is **dispatched** and every member trip advances `matched → accepted`.
- A captain holds **only ONE active room** at a time (`locked`/`dispatched` count as active);
  accepting a second → `409`.
- `GET /api/abriyah/rooms/{id}` → room `{ status, max_riders, rider_count, expires_at, dispatched_at, ... }`.
- `GET /api/abriyah/rooms/{id}/members` (assigned captain only) → `dropoff_zone`, `pickup_breakdown[]`,
  and `members[]` each with `rider_id, name, phone, pickup_wkt, dropoff_wkt, fare_iqd, distance_km`.
  `phone` is the rider's **real** number; `*_wkt` are `POINT(lng lat)` (lng-first).
- **No room→trips endpoint and no `room_id` filter on `/api/trips`.** Enumerate the pool by
  `GET /api/trips?captain_id={me}&status={accepted|in_progress|completed}` and keep rows whose
  `room_id` matches. Each `Trip` carries `id, status, riderId, roomId, pickup/dropoff, fareIqd`.
- Per-rider drive uses the existing `POST /api/trips/{tripId}/{start,complete}`
  (`accepted → in_progress → completed`). (`arrive` is an optional cue; v1 omits it for Nafarat.)

## Architecture

### The seat join (the core model)

The roster (`members`) and the lifecycle (`trips`) are two sources joined by **rider id**:

```
RiderSeat = {
  riderId, name, phone,
  pickup: LatLng, dropoff: LatLng,   // parsed from *_wkt
  fareIqd, distanceKm,
  pickupZoneName?: string,           // from pickup_breakdown match (optional, nice-to-have)
  tripId?: string,                   // from the matched Trip (may lag a beat)
  tripStatus?: 'accepted' | 'in_progress' | 'completed',
}
```

A member with no matched trip yet renders with disabled drive actions until the trip appears.

### Files

| File | Responsibility |
| --- | --- |
| `lib/wkt.ts` (modify) | Add `parsePointWkt(wkt: string): LatLng \| null` — parse `POINT(lng lat)`. |
| `services/abriyah-members.ts` (modify) | `RoomMember` gains `phone: string`, `pickup: LatLng`, `dropoff: LatLng` (via `parsePointWkt`). Keep `dropoffZone` + `pickupBreakdown`. |
| `services/abriyah-rooms.ts` (create) | `getRoom(roomId)` → `GET /api/abriyah/rooms/{id}` → `{ id, status, maxRiders, riderCount, expiresAt, dispatchedAt }`. |
| `services/captain-trips.ts` (modify) | `getRoomTrips(captainId, roomId): Promise<Trip[]>` — query `accepted`+`in_progress`+`completed` for the captain, filter `roomId`. |
| `hooks/use-nafarat-room.ts` (create) | Loads + **polls** room + members + trips; joins into `RiderSeat[]`; exposes `room`, `seats`, `dropoffZone`, `pickupBreakdown`, `pickup(tripId)`, `dropoff(tripId)`, `busy`. Optimistic per-seat status on pickup/dropoff. |
| `components/captain/rider-seat-card.tsx` (create) | One rider: name, fare, pickup zone, **Call**, and the per-status action (Picked up / Dropped off / done check). |
| `components/captain/nafarat-pickup-marker.tsx` (create) | Numbered pickup pin + a dropoff marker, for the map (or reuse a small inline marker). |
| `app/(trip)/room/[id].tsx` (create) | The Nafarat room screen (param = roomId). Map + breakdown summary + roster + drive + states. |
| `app/(tabs)/trips.tsx` (modify) | Queue `onAccept`: **room** offer → `router.push('/(trip)/room/${offer.id}')`; trip offer unchanged. |
| `hooks/use-resume-active-trip.ts` (modify) | If the active trip is `abriyah` (has `roomId`), resume to `/(trip)/room/${roomId}`; else `/(trip)/${trip.id}`. |
| `app/(tabs)/index.tsx` (modify) | `ActiveTripBanner` tap: same abriyah branch as resume. |
| `i18n/en.json`, `i18n/ar.json` (modify) | Add a `captain.nafarat.*` block (see below). |

### The screen (`app/(trip)/room/[id].tsx`)

- **Map** (`TripMap`): a numbered pickup pin per seat + a dropoff marker per rider (each rider's
  own dropoff point — they cluster in the shared destination zone); `fitToCoords` frames all
  pickups + dropoffs. Markers non-interactive.
- **Header summary**: dropoff zone name + "`picked up`/`dropped` of `N`" progress + pickup-zone
  breakdown ("2 from Mansour · 1 from Karrada").
- **Roster**: a `RiderSeatCard` per seat. Per-status control:
  - `accepted` → **Picked up** button → `start(tripId)`.
  - `in_progress` → **Dropped off** button → `complete(tripId)`.
  - `completed` → a done check, action disabled.
  - **Call** button always (real `phone` → `Linking.openURL('tel:…')`).
- **States**:
  - Loading → spinner.
  - Active → the UI above.
  - **All seats completed** → done summary (total fare collected) + "Done" → `router.replace('/(tabs)')`.
  - Room not loadable / expired / not yet dispatched → a centered message + back to tabs.

### Drive model

Per rider, independent: **Picked up** = `POST /api/trips/{tripId}/start`; **Dropped off** =
`POST /api/trips/{tripId}/complete`. No global "complete all" in v1 — the captain taps each.
The hook applies an optimistic status bump and reconciles on the next poll.

### Single-active-room handling

A captain may hold one room. v1: the queue's `acceptRoom` 409 ("captain already has an active
room assignment") is surfaced as a clear message (reuse/extend `captain.queue.*`), and the
captain is routed to their existing room via the home banner / resume. (Suppressing room offers
while a room is active is a fast follow, not v1.)

## i18n (new `captain.nafarat.*` keys, EN + AR)

`title` ("Nafarat ride"), `dropoffTo` ("To {{zone}}"), `progress` ("{{done}}/{{total}} dropped off"),
`pickupFrom` ("Pickup: {{zone}}"), `pickedUp` ("Picked up"), `dropOff` ("Dropped off"),
`call` ("Call"), `seatFare` (reuse currency fmt), `allDoneTitle` ("All riders dropped off"),
`allDoneBody`, `done` (reuse `captain.live.done`), `loadError`, `notDispatched` ("This room isn't active"),
`actionFailed` ("Couldn't update — try again"). Reuse `captain.queue.*` / `captain.live.*` where they fit.

## Error handling

- `getRoomMembers`/`getRoom` 403 → not the assigned captain (or room gone) → load-error state.
- `start`/`complete` failure → inline per-card error; refetch; optimistic bump reverts on poll.
- A member with no matched trip → drive actions disabled (Call still works) until the trip appears.

## Verification

- `npx tsc --noEmit` clean.
- Manual (EAS dev build, an approved+online captain): accept a Nafarat room from the Queue → lands
  on the room page (not the broken trip screen); map shows a pin per rider + the dropoff; the
  roster shows names/fares/pickup zones; **Call** dials; **Picked up** then **Dropped off** advance
  each rider; when all are dropped, the done summary shows; resume after relaunch returns to the
  room page. With a regular trip, the existing single-trip flow is unchanged.

## Out of scope / follow-ups

- WS realtime (room/trip events) to replace polling.
- Suppressing room offers in the Queue while the captain holds an active room.
- Pickup sequence optimization / turn-by-turn for the pool.
