# Phase 5b — Scheduled Trips (Design)

> Date: 2026-06-07 · Customer (Rider) App · Second slice of roadmap Phase 5.
> Backend live (`docs/frontend-summary.md` §Phase 11, verified in `docs/openapi.json`).
> Wallet (5a) done; multi-stop (5c) deferred — out of scope here.

## Goal

Let a rider schedule a regular trip for later (30 min – 7 days out), see their upcoming
scheduled trips, reschedule the time, or cancel. A backend scheduler tick promotes a
due scheduled trip into a live REQUESTED trip; the app surfaces that hand-off.

## Scope

**In:** create a scheduled regular trip (pickup/dropoff pins + date/time); list upcoming
scheduled trips in the Trips tab; reschedule the time of a pending trip; cancel a pending
trip; deep-link a promoted trip into the live booking flow.

**Out:** abriyah scheduling (backend rejects — regular only), editing pickup/dropoff of an
existing scheduled trip (rider cancels + recreates), multi-stop, FCM reminders.

## Approach

Same spine as Phases 1–5a: a service module owning backend shapes, TanStack Query hooks
owning caching + mutations with hierarchical keys, a route group for the multi-step create
flow, and a small modal for the quick time-reschedule. Reuse `LocationPicker` /
`FromToReview` (as `(booking)/destination.tsx` does) for pin selection. One new dependency:
`@react-native-community/datetimepicker` (Expo-supported, works in Expo Go).

## File layout

```
services/scheduled-trips.ts                     # axios calls + backend<->app mappers (sole owner of backend shapes)
hooks/use-scheduled-trips.ts                     # useQuery ['scheduled-trips'] + create/updateTime/cancel mutations
components/scheduled/scheduled-trip-row.tsx      # one row: route, when, status pill, action callbacks
components/scheduled/when-picker.tsx             # datetimepicker wrapper, clamped now+30min .. now+7d, RFC3339 out
app/(scheduled)/_layout.tsx                      # Stack
app/(scheduled)/create.tsx                       # pickup -> dropoff -> when -> submit
i18n/{en,ar}.json                                # new "scheduled" section
app/(tabs)/trips.tsx                             # Upcoming/Past segmented control; Upcoming = scheduled list + FAB
```

Dependency: `npx expo install @react-native-community/datetimepicker`.

Reuse: `components/trip/{location-picker,from-to-review}`, `services/places.reverseGeocode`,
`lib/api.{parseApiError,apiErrorKey}`, `components/ui/button`, existing Trips-tab list patterns.

## Backend contract & data mapping

`scheduled_for` is **RFC3339** and must be **now+30min … now+7days** (else 400). Trip type
is **regular only** (abriyah → 400). The `when-picker` clamps `minimumDate`/`maximumDate` so
a valid value is structurally guaranteed; the 400 is still handled defensively.

| Concern | Endpoint | Notes |
|---|---|---|
| List | `GET /api/rider/scheduled-trips` | The rider's own list. Key `['scheduled-trips']`. |
| Create | `POST /api/rider/scheduled-trips` | Body `{trip_type:"regular", pickup_lat/lng, pickup_address?, dropoff_lat/lng, dropoff_address?, scheduled_for}` → `ScheduledTrip` (status `pending`). |
| Detail | `GET /api/rider/scheduled-trips/{id}` | Owner only. |
| Reschedule | `PUT /api/rider/scheduled-trips/{id}` | Body `{scheduled_for}` (other fields optional/null). Pending only; same window guard. |
| Cancel | `POST /api/rider/scheduled-trips/{id}/cancel` | Body `{reason?}`. Owner + pending only (else 403/409). |

**App type (`services/scheduled-trips.ts`):**

```
ScheduledTrip {
  id, status, scheduledFor (RFC3339 string),
  pickup: LatLng, dropoff: LatLng,
  pickupAddress?: string, dropoffAddress?: string,
  promotedTripId?: string,
  createdAt: string,
}
status ∈ pending | promoted | cancelled | expired
```

**Status mapping (display):**
- `pending` → "Scheduled" — actionable (reschedule / cancel)
- `promoted` → "On the way" — scheduler turned it live; `promotedTripId` set → row deep-links to `/(booking)/...`
- `cancelled` → muted "Cancelled"
- `expired` → muted "Missed" (overdue-by-5-min, never promoted)

## Screens

### Trips tab — `app/(tabs)/trips.tsx`
- Segmented control at top: **Upcoming** | **Past**.
- **Past** = existing trip history (unchanged).
- **Upcoming** = `useScheduledTrips` list. `pending`/`promoted` shown prominently;
  `cancelled`/`expired` muted (or hidden — show muted for transparency). Empty state
  "No upcoming trips". Pull-to-refresh invalidates `['scheduled-trips']`.
- A **+ Schedule** FAB on the Upcoming segment → `/(scheduled)/create`.
- A `promoted` row taps through to the live trip (`promotedTripId` → existing booking screen).

### Create — `app/(scheduled)/create.tsx`
- Step 1: pickup (defaults to current location) + dropoff via `LocationPicker` +
  `FromToReview` (same pattern as `(booking)/destination.tsx`), addresses via `reverseGeocode`.
- Step 2: **When** — `when-picker` (date + time), clamped now+30min .. now+7days.
- Submit → `create` mutation; on success invalidate `['scheduled-trips']` and return to
  Trips/Upcoming. 400 → inline message.

### Reschedule modal (from a pending row)
- Small modal hosting `when-picker` prefilled with the current `scheduledFor`.
- Save → `updateTime` mutation (`PUT {scheduled_for}`). On success invalidate list.

### when-picker — `components/scheduled/when-picker.tsx`
- Wraps `@react-native-community/datetimepicker`. Encapsulates: min = now+30min,
  max = now+7days, date→RFC3339 conversion, and platform display (iOS inline spinner /
  Android dialog). Screens never do date math.

## Error handling
Reuse `parseApiError`/`apiErrorKey`: 400 (bad window / abriyah) → inline; 403/409 (not
owner / not pending — e.g. it promoted between render and action) → toast + refetch list;
429/network → existing localized keys.

## RTL
All screens RTL-aware per CLAUDE.md (`flexDirection` reversal, physical-edge ternaries, no
`marginStart/End`). Invoke the `react-native-rtl-positioning` skill when writing layout.
Times/dates rendered via locale formatting; the segmented control flips with RTL.

## Testing / verification
- `npx tsc --noEmit` + `npx expo lint` clean.
- Confirm scheduled-trips endpoints are live (401-gated) via curl, as for prior phases.
- The authenticated happy-path (create/list/reschedule/cancel) needs a rider token —
  flagged needs-live-test, not claimed verified.

## Out-of-scope follow-ups
- Phase 5c: multi-stop (`/api/rider/trips/{id}/stops`).
- FCM reminders before a scheduled trip promotes (needs a custom dev build).
- Editing pickup/dropoff of an existing scheduled trip (PUT supports it; deferred — cancel+recreate covers it).
