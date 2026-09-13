# Backend Issues / Gaps

Tracked here instead of being worked around in the client (per `CLAUDE.md`).
Backend: `https://beeb.madebyhaithem.com` · spec snapshot: `docs/openapi.json`.

## ✅ No open issues.

Closed issues are deleted from this file rather than archived. #1–#11 are all closed and were
removed in the 2026-09-13 cleanup.

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
