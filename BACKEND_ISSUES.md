# Backend Issues / Gaps

Tracked here instead of being worked around in the client (per `CLAUDE.md`).
Backend: `https://beeb.madebyhaithem.com` · spec snapshot: `docs/openapi.json`.

## Open issues

Found 2026-09-28 while reworking the Nafarat room screen, checked against `beeb-backend` source
(local, not yet reported to production).

### #14 `POST /api/captain/activation/today` returns 500 when the daily fee is 0

> **Deferred** (2026-09-28): payments go live about a month after this release, so this waits
> for that work. Until then only a fee of exactly 0 triggers it (the local backend's setting);
> production must not set `activation.daily_fee_iqd` to 0 in the meantime, or no captain can
> activate that day.

`charge_daily_activation` (`src/domains/payment/domain/services/fee_collection_service.rs`) always
inserts a `daily_fee` transaction, and `transactions.amount_iqd` has `CHECK (amount_iqd > 0)`. The
settings validator allows `activation.daily_fee_iqd = 0` ("charges nothing and flips the activation
straight to paid"), but with 0 the insert fails, the captain's Activate tap gets a 500 and the
activation stays `pending`. Seen on the local backend, where the fee is 0. Fix: when the fee is
`<= 0`, mark the activation paid and return without a transaction or a debit; add a test.

### #15 Every backend push is English-only (the "Nafarat ride nearby" one included)

> **Fix written, not yet committed or deployed** (2026-09-28). Close this once the backend
> release with it is live. Until then production writes every push in English.

The backend writes every push title and body in English: "New trip nearby", "New delivery
nearby", "Captain on the way", "No captain found", the Nafarat room offer
(`abriyah_matching_engine.rs`, `notification_type: new_trip_in_queue`) and the rest. It did not
know the captain's language.

- **App side: done** (commit `98a7b22`). The app sends its language (`ar` / `ckb` / `en`) with
  `POST /api/me/fcm-token` at every launch and language switch, and retries a report that did
  not land. The production backend ignores the extra field, so this is safe to ship first. While
  the app is in the foreground it re-presents the room offer in the captain's language from the
  push's `rider_count` / `total_fare_iqd` data ("3 riders · 7,500 IQD").
- **Backend side: not live.** The language column (migration 068) is committed (`e2e08fc`).
  Rendering every push from one catalog in the stored language (unknown → Arabic) and the
  `language` field on `POST /api/me/fcm-token` are written and pass locally but are not
  committed yet, and nothing of it is deployed.

## Closed

Closed issues are deleted from this file rather than archived. #1–#11 are all closed and were
removed in the 2026-09-13 cleanup.

**#13** (the captain earnings endpoints were readable by anyone signed in) was fixed in the
backend repo on 2026-09-28 (commit `d878459`), **not yet deployed**: production still runs the
2026-09-25 release, where anyone signed in can read any captain's earnings. With the fix,
`captain_earnings` and `captain_earnings_history` admit only the captain themself or an admin; any
other rider or captain gets `403`. The captain app only ever asks for its own id, so nothing here
changed.

**#12** (`POST /api/trips/{id}/cancel` did not check who was calling) was fixed in the backend repo
on 2026-09-28, **not yet deployed**: `cancel_trip` now loads the trip first and admits only its own
rider, its assigned captain, or an admin (any other rider or captain gets `404`, as if the trip did
not exist); an admin token is re-checked against the revocation watermark. Covered by
`trip_cancel_actor` unit tests and `tests/rooms.rs`
`only_the_seat_owner_or_the_assigned_captain_cancels_a_room_trip` (a co-rider who reads your
`trip_id` off the room gets `404` and you keep your seat). The captain app only cancels its own
assigned trips, so nothing here changed.

Two of them had never been marked closed and were verified against the live OpenAPI spec during
that cleanup: **#8** (`/api/places/nearby` undocumented) — that path and `/api/places/search` are
both in the live spec; and **#9** (trips/offers carry no address text) — `CaptainOffer` and `Trip`
both carry `pickup_address` / `dropoff_address`.

**#11** (vehicle catalog: inverted brand ordering + no vehicle-edit endpoint) was fixed in the
backend on 2026-09-13:

- `GET /api/vehicle-catalog/brands` now orders by `NULLIF(sort_order, 0) ASC NULLS LAST, name_en ASC`,
  so Toyota leads the list instead of sitting at index 140 of 141, and a future brand added without
  a curated rank sorts last rather than first.
- **`PUT /api/captain/me/vehicle`** and **`PUT /api/captains/{id}/vehicle`** now exist. Both re-run
  the classifier unless the grade is pinned. On the captain's own route an *upward* re-grade is
  **held for admin review** rather than applied — a self-declared car must not walk a captain from
  500 to 1000 IQD/km unreviewed; downward corrections apply immediately.
- `PUT /api/captains/{id}/star` with `{"star": null}` now **clears** a pin and re-grades from the
  stored car. The pin used to be a one-way door.

> **⚠️ Fixed in the backend repo, NOT YET DEPLOYED.** The fixes below landed in `beeb-backend`
> on 2026-09-13 and are verified locally (319 tests pass), but production at
> `https://beeb.madebyhaithem.com` is still running the old build — confirmed by probing the live
> brand list, which still returns the inverted order. Do not rely on the new behaviour from a
> client until the backend is deployed.

**Client follow-up available now:** the registration picker's pinned "Common makes" workaround in
`app/(auth)/register/car-picker.tsx` can be dropped once the backend is deployed — though it stays
correct either way, so there is no rush. The profile vehicle card can become editable against the
new endpoint, replacing its "contact support" caption.
