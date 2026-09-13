# Backend Issues / Gaps

Tracked here instead of being worked around in the client (per `CLAUDE.md`).
Backend: `https://beeb.madebyhaithem.com` · spec snapshot: `docs/openapi.json`.

> **Closed issues are deleted from this file, not archived.** #1–#10 are all closed and were
> removed in the 2026-09-13 cleanup.
>
> Two of them had never been marked closed and were verified against the live OpenAPI spec during
> that cleanup: **#8** (`/api/places/nearby` undocumented) — the path *and* `/api/places/search`
> are both in the live spec now; and **#9** (trips/offers carry no address text) — `CaptainOffer`
> and `Trip` both carry `pickup_address` / `dropoff_address`.

---

## 11. Vehicle catalog: brand ordering is inverted, and there is no vehicle-edit endpoint — ⏳ **OPEN (raised 2026-09-13)**

**Found:** 2026-09-13 (wiring the Car Star v2 catalog picker into captain registration).

Two separate gaps in the same new surface. **(a)** is shipped-around in the client today;
**(b)** has no client workaround at all.

### (a) `GET /api/vehicle-catalog/brands` returns the popularity order BACKWARDS

The endpoint docs say brands are *"ordered for display, makes common in Iraq first, then A-Z"*
and instruct clients to *"render in order, don't re-sort"*. That is currently **false in
production**.

The query is `ORDER BY sort_order DESC`, but the seeded `sort_order` is a **rank** where
**1 = most common in Iraq**. Descending a rank puts the rarest makes first.

**Verified live (2026-09-13, 141 brands returned):**

| Brand | seeded rank | index in the response |
|---|---|---|
| LYNK & CO | 141 | **0** (first) |
| Mercedes-Benz | 138 | 2 |
| Kia | 137 | 3 |
| Nissan | 134 | 6 |
| Hyundai | 129 | 11 |
| **Toyota** | **1** | **140** (last of 141) |

So the single most common make in Iraq is the **last** row a captain scrolls to, and the
first thing they see is a marque almost nobody here drives. All 141 `sort_order` values are
distinct, so the documented secondary `name_en ASC` never applies either — there is no A-Z
fallback anywhere in the list.

**Fix (backend):** `ORDER BY sort_order ASC, name_en ASC` — one word. (Re-seeding the ranks
in reverse would also work but breaks any other consumer that reads `sort_order` as a rank.)

**Client workaround shipped (captain app, `app/(auth)/register/car-picker.tsx`):** the picker
does **not** trust the server order, and deliberately does **not** reverse it either — a
reversal would silently break on the day this is fixed. Instead a module-level constant lists
the backend's own seeded ranks 1–12 by name (Toyota, Soueast, Mercedes-Benz, Kia, BYD, GAC,
Nissan, Jetour, Mitsubishi, Volkswagen, Geely, Hyundai); those are pinned on top under a
"Common makes" heading, matched case-insensitively on `name_en`, and **every** brand is then
listed below in server order under "All makes". A name that doesn't match is simply not
pinned and still appears in the full list, so the picker is correct whether or not this issue
is ever fixed. Search (`/api/vehicle-catalog/search`) is unaffected and is the primary path.

### (b) No vehicle-edit endpoint — a mis-entered car can only be fixed by an admin

Registration is the **only** moment a captain can state their car. There is no
`PUT`/`PATCH` anywhere in the spec that lets a captain (or an admin) change
`car_make` / `car_model` / `car_brand_id` / `car_model_id` / `car_year` afterwards.

This matters far more than it used to, because the car now sets **money**: the star grade is
computed from the catalog entry + model year, and star 1/2/3 price at 500/700/1000 IQD per km.
A captain who fat-fingers `2109` for `2019`, or picks the wrong trim, is stuck on the wrong
grade — and the only lever anyone has is `PUT /api/captains/{id}/star`, which is super_admin
only and **pins** the grade (it stamps `star_overridden_at` and permanently exempts that
captain from automatic re-grading). Fixing a typo therefore costs the captain all future
automatic re-grades, which is a bad trade for a typo.

**Ask:**

```
PUT /api/captain/me/vehicle
{ "car_brand_id": uuid?, "car_model_id": uuid?, "car_year": int?, "car_make": string, "car_model": string }
→ 200 Captain
```

- Captain-scoped (own record only); an admin-side equivalent on `/api/captains/{id}/vehicle`
  would cover support fixes.
- Re-runs the classifier on write **unless `star_overridden_at` is set**, in which case the
  pinned grade stands and only the descriptive fields change — so an admin's deliberate
  override is never silently undone by a captain editing their own row.
- Worth gating (a cooldown, or approval while `status = approved`) so the field can't be
  farmed for a better price between trips.

**Client follow-up when it lands:** the profile vehicle card becomes editable (it currently
shows make/model/year/plate read-only with a "contact support to correct your car details"
caption, `app/(tabs)/profile.tsx`), reusing the same full-screen catalog picker the
registration step already ships.

### Related, not a bug — noted so it isn't rediscovered

- `car_brand_id` / `car_model_id` are accepted on register and stored, but are **not** returned
  on the `Captain` payload. The client therefore cannot pre-select the captain's current catalog
  entry when an edit endpoint eventually exists, and has no way to tell "unresolved car" from
  "resolved car" after the fact. Returning them alongside `car_year` would close that.
- `car_make` / `car_model` remain **required strings** even when the catalog ids are sent. The
  captain app populates them from the chosen entry's `name_en` so admin screens stay readable.
