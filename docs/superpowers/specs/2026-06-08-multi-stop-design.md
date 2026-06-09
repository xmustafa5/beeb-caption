# Phase 5c — Multi-Stop (Design)

> Date: 2026-06-08 · Customer (Rider) App · Final slice of roadmap Phase 5.
> Backend live (`docs/frontend-summary.md` §Phase 11, verified in `docs/openapi.json`).
> Wallet (5a) + Scheduled (5b) done & live-verified. This completes Phase 5.

## Goal

Let a rider add up to 3 intermediate stops to an active regular trip and watch each
stop's progress as the captain reaches them.

## Scope

**In:** add a stop (map pin) to an active regular trip; list stops with
pending/reached/skipped state; render stops as numbered map markers; poll for
`reached` updates while the trip is live.

**Out:** adding stops at booking time (backend rejects until the trip is accepted —
stops are a live-trip action), reordering/deleting stops (no backend endpoint),
the captain `reach` action (captain-app concern), multi-stop on Abriyah (regular only).

## Approach

Same spine as Phases 1–5b: a service owning backend shapes, a TanStack Query hook
owning caching + a poll + the add mutation, and a shared panel component rendered on
the existing live-trip screens. No new route group, no new dependency. Reuse
`LocationPicker` for the pin and `TripMap`'s existing `pickups?: LatLng[]` prop for
the numbered stop markers.

## File layout

```
services/trip-stops.ts              # GET/POST /api/rider/trips/{id}/stops + backend<->app mapper
hooks/use-trip-stops.ts             # useQuery ['stops', tripId] (polls while live) + add mutation
components/trip/stops-panel.tsx     # numbered stops list (pending/reached/skipped) + "Add stop" button
i18n/{en,ar}.json                   # new "stops" section
app/(booking)/driver-assigned.tsx   # render stops-panel; feed stop coords to TripMap `pickups`
app/(booking)/in-progress.tsx       # same
```

Reuse: `components/trip/{location-picker,trip-map}`, `services/places.reverseGeocode`,
`lib/api.{parseApiError,apiErrorKey}`, `components/ui/{button,icon}`.

## Backend contract & data mapping

Stops are allowed only on a **`regular`** trip in state **`accepted`/`in_progress`**,
**max 3** (`seq` auto 1..3). Constraints reflected in the UI; backend errors handled
defensively.

| Concern | Endpoint | Notes |
|---|---|---|
| List | `GET /api/rider/trips/{id}/stops` | → `TripStop[]`. Key `['stops', tripId]`. Polled every 10s while live; stopped on terminal status. |
| Add | `POST /api/rider/trips/{id}/stops` | Body `{lat, lng, address?}` → `201 TripStop`. `address` from `reverseGeocode`. 4th stop → 409; wrong type/state → 400; not owner → 403. On success invalidate `['stops', tripId]`. |

(The captain `POST /api/captain/trips/{trip_id}/stops/{stop_id}/reach` endpoint is a
captain-app concern; the rider only reads the resulting `reached` state.)

**App type (`services/trip-stops.ts`):**

```
TripStop {
  id: string
  seq: number          // 1..3
  lat: number
  lng: number
  address?: string
  status: 'pending' | 'reached' | 'skipped'
  reachedAt?: string   // RFC3339
}
```

## Component — `components/trip/stops-panel.tsx`

Props: `{ tripId: string, tripType: 'regular' | 'abriyah', onAddStop: () => void }`.

- Uses `useTripStops(tripId)`; renders each stop as a numbered chip + address + status:
  - `pending` → number badge, normal text
  - `reached` → green check, muted/struck text
  - `skipped` → muted "skipped" label
- **"Add stop" button** shown only when `tripType === 'regular'` AND `stops.length < 3`;
  hidden on Abriyah, disabled (or hidden) at 3 stops.
- Renders nothing (or just the add button) when there are no stops yet.

## Live-trip screen integration (`driver-assigned.tsx`, `in-progress.tsx`)

- Render `<StopsPanel>` inside the existing bottom card area.
- The screen owns an "adding stop" state: tapping "Add stop" shows `LocationPicker`
  (overlay/conditional render, like the abriyah/destination pattern); on confirm it
  calls the add mutation with the picked coord + reverse-geocoded address.
- Feed confirmed stops' `{latitude, longitude}` into `TripMap`'s `pickups` prop so they
  appear as numbered markers between pickup and dropoff.

## Refresh
The captain marks stops `reached` server-side. The hook polls `['stops', tripId]` every
10s while the trip is live (mirrors the trip-socket backstop) so `reached` appears
within ~10s with no rider action. Polling stops on terminal trip status.

## Error handling
Reuse `parseApiError`/`apiErrorKey`: 409 (max 3 / duplicate) → toast "max 3 stops" +
refetch; 400 (wrong type/state — e.g. trip completed) → toast + refetch; 403 → generic;
429/network → existing localized keys.

## RTL
RTL-aware per CLAUDE.md: `flexDirection` reversal, physical-edge ternaries, no
`marginStart/End`. Invoke the `react-native-rtl-positioning` skill when writing layout.
Numbered badges and the stop list flip with RTL.

## Testing / verification
- `npx tsc --noEmit` + `npx expo lint` clean.
- Confirm `GET /api/rider/trips/{id}/stops` is live (401-gated) via curl.
- **Live-test caveat:** POSTing a stop requires an **active accepted/in_progress trip**,
  which needs a captain to accept a real trip. Without driving the captain side, the
  add path can be validated structurally (a `POST` to a non-accepted trip should return
  400, confirming the endpoint + auth + state guard). Full happy-path (add on a live
  accepted trip, captain reaches it) is flagged needs-captain-side if the captain app
  isn't drivable.

## Out-of-scope follow-ups
- FCM "captain reached your stop" push (needs a custom dev build).
- Reorder/delete stops (no backend endpoint today).
