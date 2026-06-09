# Beep — Zones Module PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · Add New Form Standard V1.2.3+ · Details Page Standard V1.0.6+ · App Layout Block

---

## §0 Module Document History

### 0.1 Version Table

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release to engineering. |

### 0.2 Status

**Approved** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+.

### 0.3 Compatible Charter Version

V1.0.0+

### 0.4 Milestone

**M1 (Foundation)** — full module specification ships at M1. Zones with polygon CRUD + per-zone Abriyah pricing + women-only flag + import are all active at M1.

---

## §1 Module Overview

### 1.1 Purpose

The Zones module is Beep's spatial-master-data surface. It owns the CRUD lifecycle for `Zone` polygons — admin-drawn geographic boundaries that define both the *where* and *how much* of Abriyah trips. Every Abriyah pickup and drop-off is validated against an Abriyah-enabled zone polygon via PostGIS `ST_Contains` at the database level (Charter §4.8 + §8.1); zone pricing (per-km rate + optional base fare) is the per-zone override that drives Customer App fare calculation. The module is the only place an admin can create, edit polygon shape, modify pricing, toggle women-only, or archive a zone — every other module (Operations live map, Reports revenue by zone, Customer App zone detection) is a read-only consumer of Zone state.

### 1.2 Sub-modules

Per Charter §3.1 navigation tree:

- **Zones** ⟨single-page cluster: list + map view; clicking row → Zone Detail with polygon editor⟩ — 1 list page: Zones

Cardinality rule: Zones (1 with annotation ✓). Net Zones list pages: 1.

### 1.3 Package

**Core**. Included in the Free-Core package per Charter §2.1. No add-on gates on zones at v1.

### 1.4 Primary Personas

Per Charter §1.5:
- **Omar** (Org Admin / Operator) — primary user; creates and edits all zones, sets per-zone Abriyah pricing, configures women-only flag, archives obsolete zones
- **Yousef** (Finance read-only) — reads zone pricing to validate revenue reports; cannot edit

### 1.5 Acceptance Criteria (module-level)

1. Given an Operator persona, when they open Zones → Zones list, then they see all active zones in a Table view with a Map view toggle showing every zone polygon overlaid on a Baghdad city base map.
2. Given an Operator persona, when they tap `[+ New Zone]`, then the Zone Creation Wizard opens as a Wide Drawer (60-80%) with 3 steps: Polygon Draw · Attributes · Review.
3. Given an Operator persona drawing a polygon, when the polygon self-intersects or has fewer than 4 points, then the Save button is disabled with inline error: "Polygon must be a closed shape with at least 4 points and no self-intersections."
4. Given an Operator saves an `abriyah_enabled` zone with `abriyah_per_km_iqd = 1000`, when a rider in the Customer App taps Abriyah and is GPS-located inside this zone, then the zone appears as available and fare calculation uses the configured per-km rate within one cache-invalidation cycle (≤30 seconds).
5. Given an Operator opens Zone Detail → Pricing tab and changes `abriyah_per_km_iqd`, when they save, then in-flight trips already accepted are NOT affected (fare locked at request time per Charter §8.4); next Abriyah booking in this zone uses the new rate; an audit row is written.
6. Given an Operator toggles `allow_women_only = false` on a zone, when a female rider opens Customer App Abriyah for this zone, then the women-only toggle is suppressed.
7. Given an Operator archives a zone (`active = false`), when a rider attempts a new Abriyah booking in this zone, then the request fails with message "عبريه غير متوفرة في هذه المنطقة"; in-flight trips complete normally.
8. Given an Operator imports zones via `[Import]` toolbar action using the `beep.zone` Import Spec, when 5 zone rows are valid and 1 row has self-intersecting polygon, then 5 zones commit (status Active, events emitted per row) and 1 row fails validation with row-level error per Charter §5.6.3.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role in this Module | Charter Reference |
|---|---|---|
| `Zone` | **Primary entity (CRUD)** on Zones list page; Zone Detail page hosts 4 tabs (Overview · Polygon Editor · Pricing · History) | Charter §6.3 |
| `Trip` | Read-only — count aggregation (active trips per zone) on Zone Detail Overview; trip drill-through from Zone Detail | Charter §6.1 |
| `Room` | Read-only — count aggregation (open rooms per zone) on Zone Detail Overview | Charter §6.2 |
| `City` | **Read-only via picker — owned by Org Setup** | Charter §6 Cross-App Entity References |

### 2.2 Events Published

| Event | Trigger in this Module | Charter Reference |
|---|---|---|
| `beep.zone.created` | New Zone record committed via `[+ New Zone]` action or Import Engine | Charter §5.5.1 |
| `beep.zone.updated` | Zone fields modified via Zone Detail edit (any tab) | Charter §5.5.1 |
| `beep.zone.archived` | Zone archived via Zone Detail action or bulk archive | Charter §5.5.1 |

### 2.3 Events Consumed

| Event | Handler Action in this Module | Charter Reference |
|---|---|---|
| `beep.trip.requested` | Increment "Active Trips" badge on Zone Detail Overview tab if zone_id matches | Charter §5.5.1 |
| `beep.trip.completed` | Decrement "Active Trips" badge | Charter §5.5.1 |
| `beep.room.opened` | Increment "Open Rooms" badge on Zone Detail | Charter §5.5.1 |
| `beep.room.dispatched` | Decrement "Open Rooms" badge | Charter §5.5.1 |
| `beep.room.expired` | Decrement "Open Rooms" badge | Charter §5.5.1 |

### 2.4 Cross-Module Flows This Module Participates In

| Cross-Module Flow | This Module's Role | Charter Reference |
|---|---|---|
| **Abriyah Room Matching Engine** | **Configuration origin** — the Zone polygon + per-km rate + room_max_riders + room_max_wait_seconds are read by the matching engine on every Abriyah request. Edits here propagate via `beep.zone.updated` cache invalidation. | Charter §8.1 |
| **Zone Pricing Update Propagation** | **Trigger origin** — admin edits on Zone Detail → Pricing tab fire `beep.zone.updated`. Cache invalidation flows to Customer App; in-flight trips unaffected (fare locked at request time). | Charter §8.4 |

### 2.5 Roles Referenced

| Role | Usage in this Module | Source |
|---|---|---|
| Super-admin | Full CRUD on Zones (create, edit, archive, restore, edit pricing) | Charter §1.5 |
| Operator | Full CRUD on Zones (same as super-admin) | Charter §1.5 |
| Finance (read-only) | Reads zone list + pricing tab for revenue validation; cannot edit | Charter §1.5 |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Zone Polygon System | Polygon validation via `ST_Contains` + `ST_IsValid` at DB level; closed-shape + ≥4 points + no self-intersection rules | Charter §4.8 |
| Multi-View Pattern | List page declares Table + Map view qualifications per `torch-design-principles.md §6.2` | Charter §4.7 |
| Add New Form Standard conformance | Zone Creation Wizard is a Wide Drawer Wizard variant (3 steps) | Charter §4.8 (forward reference) + Add New Form Standard |
| Cross-Surface Boundary Rules | Zone state changes broadcast to Customer App via Event Bus; direct DB access across surfaces forbidden | Charter §4.9 |

### 2.7 Import Specs Used

| Spec ID | Entity | Module Usage | Charter Reference |
|---|---|---|---|
| `beep.zone` | Zone | `[Import]` toolbar action on Zones list page. Required columns: name, city, polygon (WKT), type. Optional: abriyah_per_km_iqd, abriyah_base_fare_iqd, allow_women_only, room_max_riders, room_max_wait_seconds, active. Validators run polygon validity + per_km_required-when-abriyah-enabled. Used for first-run zone seeding and bulk pricing updates. | Charter §5.6.1 + §5.6.2 |

### 2.8 Sub-Agent Intents Used

At v1, the Sub-Agent is a Stub (registration contracts only) — no intents are active. The Zones module references no Sub-Agent intents at v1. Forward-compatible (Horizon 2):

| Intent ID | Module Usage | Sub-Agent PRD Reference | Activates At |
|---|---|---|---|
| `beep.query.zone_surge_suggestions` | Zone Detail → Pricing tab ✨ icon — surfaces AI-suggested per-km rate adjustment based on demand patterns | Sub-Agent PRD §5 (Horizon 2 candidate) | Horizon 2 |

---

## §3 Page Specifications

### 3.1 Sub-Module: Zones

The spatial-master-data surface — provides the list + map of all zones plus the Detail page where admins manage polygon, pricing, and configuration.

---

#### 3.1.1 Zones — List Page

**Views:** Table + Map (toggleable header switcher per Multi-View Pattern)

**Purpose:** Inventory of all zones across all cities the admin has access to. Default to admin's home city; multi-city expansion at M3 adds city filter chip.

**Page-level conventions:**
- **List Page Layout:** App Layout Block shell · page header row (title + city filter chip + view switcher Table/Map + `[Config ⚙]`) · table OR map body · pagination footer (Table view only)
- **Toolbar actions:** `[+ New Zone]` · `[Import]` (uses `beep.zone` Spec per Charter §5.6.1) · `[Export ▼]` (CSV · Excel · PDF unavailable — no template) · `[Refresh]`
- **Audit logging:** `view`, `export` actions logged per Charter §10.4
- **Saved Views:** Per-user via App Preferences Pattern scope key `data_views.zones.zones`
- **Filter retention:** scope key `filters.zones.zones`
- **Performance target:** < 1s P95 with 50 zones; < 3s P95 with 500 zones

**Columns (Table view default):**

| Column | Source | Sortable | Filterable | Default Visible |
|---|---|---|---|---|
| Name (EN) | `Zone.name` | yes | text search | yes |
| Name (AR) | `Zone.name_ar` | yes | text search | yes |
| City | `Zone.city` | yes | multi-select | yes |
| Type | `Zone.type` (regular_only / abriyah_enabled) | yes | multi-select | yes |
| Per-km Rate (IQD) | `Zone.abriyah_per_km_iqd` | yes | range | yes (— dash shown when type=regular_only) |
| Base Fare (IQD) | `Zone.abriyah_base_fare_iqd` | yes | range | no |
| Women-Only Allowed | `Zone.allow_women_only` | yes | yes/no | yes |
| Active Trips | computed (count of `Trip` where `zone_id=this` AND status ∈ {REQUESTED, MATCHED, ACCEPTED, IN_PROGRESS}) | yes | range | yes |
| Open Rooms | computed (count of `Room` where `zone_id=this` AND status=OPEN) | yes | range | yes |
| Active | `Zone.active` | yes | yes/no | yes |
| Created At | `Zone.created_at` | yes | date range | no |

**Hidden by default (chooser-visible):** Room Max Riders · Room Max Wait Seconds · Created By · Updated At · Updated By

**`columnExcluded` (never selectable in chooser):** `id` (`reason: internal UUID`), `organization_id` (`reason: org-scoped — always implicit`), `polygon` (`reason: WKT geometry — surfaces visually in Map view + Polygon Editor tab`), `version` (`reason: audit-only`)

**Filters:** City (multi-select; default = admin's home city) · Type (multi-select) · Women-Only Allowed (yes/no/all) · Active (yes/no/all; default = yes) · Active Trips (range — surface busy zones)

**Default sort:** City ↑ then Name ↑

**Org-shared Saved View presets:** "All Abriyah Zones" (`Type = abriyah_enabled`); "Inactive Zones" (`Active = no`); "Busy Now" (`Active Trips >= 5`)

**Bulk actions:** Bulk archive (only if Active Trips = 0 AND Open Rooms = 0 for all selected) · bulk export

**Row actions:** Edit (opens Zone Detail) · Archive *(if Active Trips = 0 AND Open Rooms = 0)* · View on Map (switches to Map view, pans to this zone)

**Empty state:** "No zones yet. Create your first zone to start accepting Abriyah trips." with `[+ New Zone]` CTA.

**Drill-through:** Row double-click → Zone Detail Overview tab.

---

**Map View** (alternative to Table per Multi-View Pattern):

- **Renderer:** Google Maps SDK with polygon overlay layer
- **Per-polygon styling:** `abriyah_enabled` zones in blue stroke + 20% fill; `regular_only` zones in gray stroke + 10% fill; archived (`active=false`) zones in dashed red stroke with no fill
- **Polygon click:** opens a hover card with Zone name + Type + Per-km rate + Active Trips count + `[Open Detail]` button
- **Map controls:** filter chips bar at top (mirrors Table filters); zoom/pan native to Google Maps
- **Empty state:** Same copy as Table, centered on Baghdad city center
- **Performance target:** < 2s P95 with 50 polygons; uses Google Maps polygon clustering for > 200 polygons

---

##### Zone Creation Wizard (Wide Drawer Wizard variant per Add New Form Standard)

Opens at 60-80% width as a 3-step wizard.

**Step 1 — Polygon Draw:**

| Element | Behavior |
|---|---|
| Map canvas (Google Maps) centered on selected city | Click to place point; Esc to undo last point; double-click to close polygon |
| Polygon stroke colored by Type selection (live preview) | Blue if Type=abriyah_enabled selected; gray if Type=regular_only |
| Live validation indicators | "Points: N" counter (must be ≥ 4); "Valid: ✓ / ✗" via `ST_IsValid` precheck on backend; self-intersection warning |
| `[Next]` button | Disabled until polygon valid (≥4 points, closed, no self-intersection) |

**Step 2 — Attributes:**

| Section (palette) | Field | Type | Required | Default | Validation | Notes |
|---|---|---|---|---|---|---|
| Identity (Blue) | Name (EN) | text | yes (primary lang only) | — | ≤100 chars | Bilingual via language tab |
| Identity (Blue) | Name (AR) | text | yes | — | ≤100 chars | Bilingual; Arabic primary |
| Identity (Blue) | City | dropdown (FK → Org Setup City) | yes | admin's home city | must exist in Org Setup | Not bilingual |
| Custom (Green) | Type | radio | yes | abriyah_enabled | enum: regular_only / abriyah_enabled | Drives conditional visibility of Abriyah fields below |
| Custom (Green) | Abriyah Per-km Rate (IQD) | number | conditional (yes if Type=abriyah_enabled) | 1000 | > 0; range 100–10000 | Visible only when Type=abriyah_enabled |
| Custom (Green) | Abriyah Base Fare (IQD) | number | no | 0 | ≥ 0; range 0–5000 | Visible only when Type=abriyah_enabled |
| Custom (Green) | Allow Women-Only Rooms | toggle | yes | true | — | Visible only when Type=abriyah_enabled |
| Custom (Green) | Room Max Riders | number | yes | 4 | range 2–6 | Visible only when Type=abriyah_enabled |
| Custom (Green) | Room Max Wait Seconds | number | yes | 300 | range 60–900 | Visible only when Type=abriyah_enabled |
| Custom (Green) | Active | toggle | yes | true | — | Inactive zones suppress new requests |

**Conditional logic:** All Abriyah-specific fields surface only when `Type = abriyah_enabled` per Add New Form Standard conditional logic pattern.

**Step 3 — Review:**

Read-only summary of Steps 1 and 2 with `[Back]` to either step and `[Save & Activate]` primary CTA.

**On-commit behavior:** `Save & Activate` → emits `beep.zone.created` per Charter §5.5.1; Zone is immediately active for new requests; Customer App cache invalidated within 30 seconds.

---

##### Zone Detail Page (4 tabs)

| Tab | Content |
|---|---|
| **Overview** | Read-only summary zone (Name EN/AR · City · Type · Per-km rate · Base fare · Women-only allowed · Active Trips count · Open Rooms count · Last Updated). Edit mode entry for Name + City fields. Real-time count badges driven by `beep.trip.*` and `beep.room.*` events per §2.3 |
| **Polygon Editor** | Google Maps canvas with the zone's polygon overlay editable in-place. Drag a vertex to move it; right-click vertex → delete (if ≥4 vertices remain); double-click edge → insert new vertex. Save & Close → backend `ST_IsValid` recheck → on success emit `beep.zone.updated`; on failure surface validation error. **Polygon changes do NOT retroactively affect in-flight trips** per Charter §8.4 |
| **Pricing** | Editable fields: Abriyah Per-km Rate · Abriyah Base Fare · Room Max Riders · Room Max Wait Seconds · Allow Women-Only Rooms. Save & Close → emit `beep.zone.updated`. **In-flight trips locked at old rate** — admin banner: "Pricing for Zone X updated. N in-flight trips locked at old rate." per Charter §8.4 |
| **History** | Lifecycle Timeline — version timeline of every change + audit log entries (created by, edited by, archived by, restored by; before/after diff for pricing changes) per Charter §5.5.4 |

**Action Bar (state-driven per Details Page Standard):**
- Active zone: `[Edit]` · `[Archive]`
- Archived zone: `[Restore]`
- All states: `[View Trips in Zone]` (→ Operations → Live Trips Map filtered by zone)

---

## §4 Module-Scoped Business Rules

### 4.1 Polygon Validity Rule

- **Applies to:** Zone Creation Wizard Step 1 + Zone Detail → Polygon Editor tab
- **Rule:** A polygon is valid if and only if (a) it has at least 4 distinct vertices, (b) the first and last vertices coincide (closed shape), AND (c) it does not self-intersect (verified via PostGIS `ST_IsValid` at the database level).
- **Error message:** "Polygon must be a closed shape with at least 4 points and no self-intersections. Adjust vertices and try again."
- **Rationale:** Invalid polygons break `ST_Contains` containment queries used by the Abriyah Room Matching Engine (Charter §8.1). Without DB-level validation, malformed zones silently accept-and-reject requests inconsistently.

### 4.2 Abriyah Configuration Completeness Rule

- **Applies to:** Zone Creation Wizard Step 2 + Zone Detail → Pricing tab
- **Rule:** When `Zone.type = abriyah_enabled`, the field `abriyah_per_km_iqd` is required and must be > 0. When `Zone.type = regular_only`, all Abriyah-specific fields (per-km, base fare, women-only, room settings) must be null or default values.
- **Error message:** "Abriyah-enabled zones require a per-km rate greater than 0."
- **Rationale:** A type-mismatched zone produces undefined fare calculation at runtime.

### 4.3 Pricing Change Locks In-Flight Trips

- **Applies to:** Zone Detail → Pricing tab save action
- **Rule:** When `abriyah_per_km_iqd`, `abriyah_base_fare_iqd`, or any room-related setting changes on an `active` zone, the change applies only to NEW Abriyah requests received after the save commits. Trips in status REQUESTED, MATCHED, ACCEPTED, or IN_PROGRESS at the moment of save are NOT updated.
- **Error message:** Informational banner on save: "Pricing for Zone {name} updated. {N} in-flight trips locked at old rate."
- **Rationale:** Per Charter §8.4 — retroactive fare changes break rider trust and create captain payout disputes. Locking at request time is the contract.

### 4.4 Archive Eligibility Rule

- **Applies to:** Zones list page Archive bulk action + Zone Detail → Archive action
- **Rule:** A zone can be archived (status `active = false`) only if `Active Trips = 0` AND `Open Rooms = 0` for that zone at the moment of action. If either count is > 0, the Archive action is disabled with tooltip explaining the blocker.
- **Error message:** "Cannot archive — {N} active trips and {M} open rooms remain. Wait for trips to complete or expire rooms first."
- **Rationale:** Archiving with in-flight trips would orphan trips from their parent zone, breaking the Abriyah pickup/destination containment contract.

### 4.5 City Scope Rule

- **Applies to:** Zones list page filter + Zone Creation Wizard
- **Rule:** Operators with city-scoped roles see only zones in their assigned city (single-city Baghdad at v1; multi-city at M3 enforces this). Super-admin role sees all cities. New zones inherit the operator's city by default in the Wizard.
- **Error message:** Not applicable (passive filter).
- **Rationale:** Multi-city scaling at M3 requires city-level scoping foundation in place at M1.

---

## §5 Module Scope Boundaries

### 5.1 In Scope (this Module)

- Zone CRUD (create / edit / archive / restore) via Zones list page + Zone Detail
- Polygon draw + edit on Google Maps canvas via Zone Creation Wizard Step 1 + Polygon Editor tab
- Per-zone Abriyah configuration (per-km rate, base fare, women-only flag, room max riders, room max wait seconds)
- Zone import via `beep.zone` Import Spec
- Read-only Active Trips + Open Rooms counts on Zone Detail Overview
- Drill-through from Zone Detail to filtered Trips list and filtered Rooms list

### 5.2 Out of Scope (this Module)

| Item | Owner | Rationale |
|---|---|---|
| Trip CRUD | Operations module + backend Trip Service | Zone is a configuration entity; trips are runtime — different ownership |
| Room CRUD | Operations module + backend Room Service | Room is transient runtime state — created/destroyed by the Matching Engine, not by admins |
| City master CRUD | Org Setup (Business OS Core) | Cities are platform-level entities; Beep references them |
| Captain CRUD | Captains module | Captains are people, not places |
| Revenue per zone | Reports module → Financial Reports → Revenue by Zone | Reporting is read-only aggregation; Zones module is master-data CRUD |
| Default pricing (city-level fallback) | Setup module → Operations Foundations → Pricing Defaults | Zone pricing overrides city-level defaults — defaults live in Setup |

### 5.3 Out of Scope (Future — flagged for Horizon backlog)

- **Multi-city zone aggregation** (Horizon 1, M3) — when multi-city activates at M3, the city filter on Zones list page becomes prominent; zone naming may need de-duplication across cities
- **Surge Pricing AI suggestions on Pricing tab** (Horizon 2) — Sub-Agent capability `beep.query.zone_surge_suggestions` will surface inline on the Pricing tab when promoted to Full
- **Zone-level captain whitelist** — restrict which captains can accept trips in a zone (rejected for v1 / v2; possible Horizon 3)
- **Zone heatmap overlay** showing demand density — currently surfaced only on Operations Live Trips Map; could merge here at Horizon 2

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Polygon Editor** | The Google Maps canvas on Zone Detail → Polygon Editor tab where admins drag vertices to reshape an existing zone's boundary. Distinct from the Zone Creation Wizard Step 1 (which is for new polygons). | Pending merge into Charter §12 |
| **City Scope Filter** | The city-level filter on the Zones list page that defaults to the admin's home city. Operators with single-city roles cannot change this filter; super-admins can multi-select cities. | Pending merge into Charter §12 |
| **Active Trips Badge** | The real-time count on Zone Detail Overview showing the number of trips currently in REQUESTED / MATCHED / ACCEPTED / IN_PROGRESS state for this zone. Updated via Event Bus subscription per §2.3. | Pending merge into Charter §12 |
| **Open Rooms Badge** | The real-time count on Zone Detail Overview showing the number of Rooms currently in OPEN state for this zone. | Pending merge into Charter §12 |

---

## Appendix A — Cross-Reference Integrity Check (CRI)

| Module PRD reference | Charter section claimed | Charter section verified |
|---|---|---|
| §2.1 Entity `Zone` | Charter §6.3 | ✓ exists |
| §2.1 Entity `Trip` | Charter §6.1 | ✓ exists |
| §2.1 Entity `Room` | Charter §6.2 | ✓ exists |
| §2.1 Cross-app `City` | Charter §6 Cross-App Entity References | ✓ exists |
| §2.2 Event `beep.zone.created` | Charter §5.5.1 | ✓ exists |
| §2.2 Event `beep.zone.updated` | Charter §5.5.1 | ✓ exists |
| §2.2 Event `beep.zone.archived` | Charter §5.5.1 | ✓ exists |
| §2.4 Cross-module flow Abriyah Room Matching | Charter §8.1 | ✓ exists |
| §2.4 Cross-module flow Zone Pricing Update Propagation | Charter §8.4 | ✓ exists |
| §2.6 Pattern Zone Polygon System | Charter §4.8 | ✓ exists |
| §2.6 Pattern Multi-View Pattern | Charter §4.7 | ✓ exists |
| §2.6 Pattern Cross-Surface Boundary Rules | Charter §4.9 | ✓ exists |
| §2.7 Import Spec `beep.zone` | Charter §5.6.1 | ✓ exists |

**Verdict:** PASS

---

**End of Beep Zones Module PRD V1.0.0**
