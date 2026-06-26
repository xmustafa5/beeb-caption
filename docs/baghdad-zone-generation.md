# Baghdad Zone Generation — Design + Proven Prototype

_Researched and prototyped 2026-06-26 against live prod data. The feasibility below is **verified**, not theoretical: 100 real Baghdad neighbourhood polygons were fetched, stitched, validated in PostGIS, and POI-counted against the live 285k-POI dataset._

## Problem
Tiling Baghdad with squares is wrong: a zone must feel like "a place" to a driver, must not straddle uncrossable barriers (the Tigris), and must be size-bounded (split huge districts, keep small ones whole). We need an algorithm, not a grid.

## Key insight (verified)
Baghdad is **already divided into named places** in OpenStreetMap, as real polygons:

| OSM admin_level | Unit | Count (central Baghdad bbox) | Role |
|---|---|---|---|
| 6 | District (قضاء) | 10 | too big — context |
| 7 | Subdistrict (ناحية) | 22 | size upper bound / merge parent |
| **8** | **Neighbourhood (حي)** | **100** | **base zone unit** |
| 9 | Mahalla (محلة, numbered) | 502 | split unit for oversized L8 |

So the job is **size-normalization on top of real boundaries**, not invention.

## Proven prototype results
Fetched all 100 L8 neighbourhood relations (Overpass, `out geom`), stitched fragmented outer ways into closed rings, loaded as WKT into PostGIS:
- **100/100 zones produced valid geometry** (`ST_IsValid` = true for all).
- POI counts (live `places`): **median 622, p25–p75 = 326–1078, min 29, max 2391**, avg area 6.23 km².
- At thresholds T_max=800 / T_min=150 POIs: **52 just-right, 39 too-big (split), 9 too-small (merge)**.
- Real, recognizable, right-sized zones fall out directly: Karrada (4.1 km², 1819 POIs), Mansour (3.5 km², 1574), Adhamiyah, Hurriyah, Ghazaliya…

## The algorithm (4 stages)
1. **Ingest** L8 neighbourhood polygons (+ L9 mahalla as split units, + L7 as merge parents) from Overpass for the Baghdad bbox. One-time fetch (~0.5 MB).
   - **Gotcha:** Overpass returns `406` to UA-less curl — send a `User-Agent`. Outer rings come fragmented into many open ways and must be stitched end-to-end into closed rings (done in `stitch.py`).
2. **Size-normalize by POI load** (demand proxy, not area):
   - `poi_count > T_max` → **split** along nested L9 mahalla boundaries, grouping mahallas into `ceil(poi/T_target)` contiguous, POI-balanced clusters (region-growing on the mahalla adjacency graph). Children inherit parent name + suffix (North/Dakhil/Kharij or a landmark).
   - `poi_count < T_min` → **merge** into the lowest-POI adjacent neighbour sharing an L7 parent, until it clears T_min.
   - else keep as-is.
3. **Barrier-align:** clip every zone to the **Tigris** so no zone spans both banks (Karkh vs Rusafa). L7 parents already encode the bank; subtract the river line. (Major-arterial snapping optional, lower ROI.)
4. **Emit + load:** convert to WKT → existing `POST /api/admin/zones/import` (partial-commit, validates each polygon via `beep_is_valid_polygon`, resolves city by name). No new ingest endpoint needed.

### Coverage fallback
OSM L8 coverage is good but not total. For serviced areas with no L8 polygon, fall back to a **POI-density concave-hull** zone so there are no holes.

### Caveats
- L9 names are numbers (محلة 917) — usable as split *units*, not as zone names; children inherit the parent name.
- This is an **offline/batch pipeline** (a `src/bin/generate_baghdad_zones.rs` or script), re-runnable when boundaries change — not a live API.
- ~39% of L8 will split and ~9% will merge; tune T_min/T_max on the GeoJSON preview before loading.

## Prototype artifacts (scratchpad, this session)
`stitch.py` (OSM ways → closed-ring WKT), `report.sql` (validate + POI-count). Re-runnable; not committed.

---

# Dashboard: view + override zones

The zone **API already exists** and the dashboard can use it now. Confirmed surface:
- CRUD: `GET/POST /api/admin/zones`, `PUT /api/admin/zones/{id}`, archive/restore (admin-gated).
- Polygon I/O: `polygon_wkt` (WKT, lng-first, SRID 4326), validated server-side (closure, ≥4 pts, self-intersection).
- Live draw validation: `POST /api/admin/zones/validate-polygon`.
- Bulk load: `POST /api/admin/zones/import` (partial-commit) — how generated zones land.
- Pricing-only edit: `PUT /api/admin/zones/{id}/pricing` (returns in-flight trips locked; non-retroactive).
- All Abriyah fields editable: `zone_type`, `abriyah_per_km_iqd`, `abriyah_base_fare_iqd`, `allow_women_only`, `room_max_riders`, `room_max_wait_seconds`, `active`.

### Override workflow
Map view (`GET /api/admin/zones`, parse `polygon_wkt`) → admin drags vertices → live `validate-polygon` → `PUT` with new `polygon_wkt`. Generated zones are a starting point; humans fix them.

### Gaps to close for a good dashboard (real findings)
1. **No compact map endpoint.** `GET /api/admin/zones` is heavy (every field per zone). **Add `GET /api/admin/zones/geojson`** → GeoJSON `FeatureCollection` (polygon + `{id,name,type,active}`), the native map format.
2. **No overlap detection.** Nothing stops zones overlapping (the 2 current prod zones overlap). Abriyah matching is first-match-FIFO on `ST_Contains`, so overlaps make matching ambiguous. **Add an overlap check** (`ST_Overlaps`/`ST_Intersects` minus shared edges) on create/update — warn, or hard-409 for abriyah zones.
3. **Optimistic lock not enforced.** `version` is tracked but PUT doesn't check it → two admins clobber silently. **Enforce a version/If-Match precondition → 409 on stale.**

## Recommended build order
1. **Prototype → GeoJSON preview file** (no DB write) — eyeball boundaries, tune T_min/T_max. _(prototype proven; next: add split/merge + Tigris clip and emit the file.)_
2. **Dashboard endpoints** (`/zones/geojson`, overlap check, version enforcement) — needed regardless.
3. **Load tuned zones** via `/zones/import`, then human override in the dashboard.

---

## STATUS: built + loaded (2026-06-26)

All three pieces are done, deployed, and verified live on prod.

**Pipeline** — committed at `scripts/zone-generation/` (`fetch_osm.sh`, `stitch.py`, `build_zones.py`, `run.sh`, `import.sh`, README + the generated `baghdad_zones_preview.geojson` / `baghdad_zones_import.tsv`). Reproducible end-to-end. Split/merge implemented; Tigris clip still a TODO.

**152 zones loaded to prod** into city **"Baghdad Staging"** as `abriyah_enabled` (per-km 1000 IQD): 59 kept whole + 93 split children. POI distribution min 179 / median 455 / max 854. The 2 placeholder test zones (Central Abriyah, East Regular) were archived, leaving exactly 152 active. (21 split-children came out as MultiPolygons — the validator only accepts single POLYGON — and were reduced to their largest component on load; the pipeline now does this reduction automatically.)

**Three new backend endpoints** (deployed, live-tested):
- `GET /api/admin/zones/geojson` — `application/geo+json` FeatureCollection; verified returning all 152.
- **Overlap rejection** on create/update — verified: a draw inside Karrada → `409 "Polygon overlaps active zone حي الجنيد"`. Shared-edge adjacency is allowed. NOTE: the bulk `import` path intentionally does NOT run this check (partial-commit), so importing adjacent zones is fine.
- **Version enforcement** — optional `expected_version` on `PUT /api/admin/zones/{id}`; verified: stale → 409, correct → 200 + version bump.
