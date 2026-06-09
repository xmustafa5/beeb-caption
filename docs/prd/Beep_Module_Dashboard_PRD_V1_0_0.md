# Beep — Dashboard Module PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · Details Page Standard V1.0.6+ · App Layout Block

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

**M1 (Foundation)** — both sub-modules (Overview, Needs Action) active at M1.

---

## §1 Module Overview

### 1.1 Purpose

The Dashboard is the Admin Dashboard's app landing surface — what an operator sees the moment they open Beep. It serves two distinct intents on two pages: **Overview** is the at-a-glance "is everything healthy?" surface (KPI cards + city map + Activity Highlights), and **Needs Action** is the prioritized admin triage queue (pending approvals + flagged trips + expired rooms + stuck items). The module owns no entities — it is a read-only aggregation surface that reads every other module's data via the Event Bus and Trip / Room / Captain queries.

### 1.2 Sub-modules

Per Charter §3.1:

- **Overview** ⟨single-page cluster: app landing surface; KPI cards + city map + Activity Highlights⟩ — 1 list page: Overview
- **Needs Action** ⟨single-page cluster: tabbed admin triage with 4 tabs⟩ — 1 list page: Needs Action

Cardinality rule: Overview (1 with annotation ✓) · Needs Action (1 with annotation ✓). Net Dashboard list pages: 2.

### 1.3 Package

**Core**. Free-Core package per Charter §2.1.

### 1.4 Primary Personas

- **Omar** (Operator) — primary user; opens Dashboard first thing every morning to triage Pending Approvals and check overnight Activity Highlights
- **Yousef** (Finance, read-only) — opens Overview to see Activation Fees Accrued KPI; cannot interact with Needs Action triage actions

### 1.5 Acceptance Criteria (module-level)

1. Given an Operator opens Beep, when the Admin Dashboard loads, then the default landing page is Dashboard → Overview with all KPI cards populated within < 1s P50.
2. Given any KPI card on Overview, when the underlying data updates (e.g. new trip completed), then the card refreshes within ≤30 seconds via WebSocket-driven re-fetch.
3. Given an Operator on Needs Action, when there are 5 pending captain approvals, then the Pending Captains tab shows badge "5" and the list is sorted by oldest-first (FIFO triage).
4. Given an Operator clicks `[Approve]` on a pending captain in Needs Action, then the captain status transitions to APPROVED, the row is removed from Needs Action, the badge count decrements, and `beep.captain.approved` fires.
5. Given a captain registration sits unactioned for > 24h, when the Operator opens Needs Action, then that row shows a red urgency indicator (SLA breach).
6. Given an Operator opens Activity Highlights, when 3 Abriyah rooms expired in the last hour, then the highlight chip "3 Abriyah rooms expired — high cancel risk" appears with click-through to Operations → Live Rooms filtered by EXPIRED status.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `Trip` | Read-only — KPI aggregation (today's trip count, average fare, cancellation rate) | Charter §6.1 |
| `Room` | Read-only — KPI aggregation (open rooms now, expired rooms today, fill rate) | Charter §6.2 |
| `Captain` | Read-only — Pending Approval count, Daily Activation rate | Charter §6.4 |
| `User` | Read-only — Active rider count, new signups today | Charter §6.5 |
| `CaptainDailyActivation` | Read-only — accrued fees today | Charter §6.6 |

### 2.2 Events Published

None. The Dashboard module is a read-only aggregator.

### 2.3 Events Consumed

| Event | Handler Action |
|---|---|
| `beep.trip.requested` | Increment "Trips Today" KPI |
| `beep.trip.completed` | Increment "Completed Today" KPI; update average fare; recompute fill rate |
| `beep.trip.cancelled` | Increment "Cancelled Today" KPI; update cancel rate |
| `beep.room.opened` | Increment "Open Rooms" KPI; update Activity Highlights |
| `beep.room.dispatched` | Decrement "Open Rooms"; update fill rate |
| `beep.room.expired` | Decrement "Open Rooms"; push Activity Highlight chip "Room expired in {Zone}" |
| `beep.captain.registered` | Increment Pending Captains tab badge on Needs Action |
| `beep.captain.approved` | Decrement Pending Captains tab badge |
| `beep.captain.activated_today` | Increment "Activations Today" KPI |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Captain Daily Activation Gate** | Consumer — surfaces "Activations Today" on Overview; flags low-activation captains in Needs Action | Charter §8.2 |
| **Trip Cancellation Cascade** | Consumer — surfaces "Cancelled Today" KPI + Activity Highlights for high-cancel zones | Charter §8.3 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Full access to all KPIs and triage actions |
| Operator | Full access |
| Finance (read-only) | Sees all KPIs but Needs Action triage actions render as disabled with tooltip |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Real-Time Trip + Room Broadcast | KPI cards subscribe to WebSocket stream for live updates | Charter §4.6 |
| Multi-View Pattern | Needs Action declares Table view (no Kanban/Inbox/Map qualification) | Charter §4.7 |

### 2.7 Import Specs Used

None. No imports surface here.

### 2.8 Sub-Agent Intents Used

None active at v1 (Stub). Horizon 2 candidate: `beep.query.fraud_signals` would surface a "Flagged Items" tab on Needs Action when AI Layer activates.

---

## §3 Page Specifications

### 3.1 Sub-Module: Overview

#### 3.1.1 Overview — List Page

**Views:** Table (default — single landing view; no Kanban/Inbox/Map qualification per Multi-View Pattern)

**Purpose:** At-a-glance morning status — operator opens, sees if anything is on fire.

**Page-level conventions:**
- **Layout:** App Layout Block · page header (title + Refresh) · 3-zone body (KPI Cards strip · City Map · Activity Highlights feed)
- **Toolbar actions:** `[Refresh]` only
- **Audit logging:** `view` action
- **Saved Views:** N/A (single canonical layout)
- **Performance target:** < 1s P50 initial load; < 30s WebSocket refresh cadence

**KPI Cards strip (8 cards in 2 rows of 4):**

| Card | Source | Format |
|---|---|---|
| Trips Today | count(`Trip` where date(requested_at) = today) | Big number + ▲ delta vs yesterday |
| Completed Today | count(`Trip` where status=COMPLETED AND date(completed_at) = today) | Big number + ▲ delta + % of requested |
| Cancelled Today | count(`Trip` where status=CANCELLED AND date(cancelled_at) = today) | Big number + ▲ delta + % cancel rate |
| Active Trips Now | count(`Trip` where status ∈ {ACCEPTED, IN_PROGRESS}) | Big number, live |
| Open Rooms Now | count(`Room` where status=OPEN) | Big number, live |
| Active Captains Now | count(`Captain` where status=APPROVED AND online=true) | Big number, live |
| Activations Today | count(`CaptainDailyActivation` where date = today) | Big number + % of approved captains |
| Activation Fees Accrued | sum(`CaptainDailyActivation.fee_amount_iqd` where date = today AND status ∈ {pending, paid}) | IQD with thousand-separator |

**City Map** (center zone):

- Google Maps SDK centered on Baghdad (or admin's home city at M3+)
- Zone polygons overlaid (color-coded by Activity Level — green: 0-5 active trips, yellow: 6-15, red: 16+)
- Captain pins (small icons; clustering at zoom-out)
- Click polygon → opens Zone Detail
- Click captain pin → opens Captain Detail

**Activity Highlights feed** (right side):

- Real-time chip feed (last 20 events, newest top)
- Examples:
  - "Room expired in Al-Karada — 3 riders affected" (red urgency)
  - "Captain Karim H. approved" (green)
  - "Trip TRIP-1234 completed — 4 riders, 28,000 IQD" (neutral)
- Each chip click → drill-through to relevant detail page
- Auto-refresh via WebSocket subscription

**Empty state:** Pre-launch / first install — "Welcome to Beep. Create zones in Setup → Operations Foundations and approve your first captains to start operations."

---

### 3.2 Sub-Module: Needs Action

#### 3.2.1 Needs Action — List Page

**Views:** Table (4 tabs)

**Purpose:** Prioritized admin triage. Every item here represents an action the admin must take.

**Page-level conventions:**
- **Layout:** App Layout Block · page header (title + Refresh) · 4-tab strip (Pending Captains · Flagged Trips · Expired Rooms · Stuck Items)
- **Audit logging:** Every action button click writes to AuditLog
- **Tab badges:** Each tab header carries a count badge; badge red when count > SLA threshold

**Tab 1 — Pending Captains** (FIFO triage):

| Column | Source | Sortable | Filterable | Default Visible |
|---|---|---|---|---|
| Captain Name | `Captain.name` | yes | text | yes |
| Phone | `Captain.phone` | no | text | yes |
| Gender | `Captain.gender` | yes | m/f filter | yes |
| Registered At | `Captain.registered_at` | yes (default ↑ oldest first) | date range | yes |
| Age (hours) | computed (now - registered_at) | yes | range | yes — red when > 24h |
| Documents Complete | computed (`len(Captain.documents) >= 3`) | yes | yes/no | yes |
| City | `Captain.city` | yes | multi-select | yes (M3+) |

**Row actions per Pending Captain row:** `[Approve]` (single-click; opens confirmation modal) · `[Reject]` (opens reason dialog) · `[Open Detail]` (drill to Captain Detail)
**Bulk action:** Bulk approve (super-admin only; opens confirmation listing all selected)

**Tab 2 — Flagged Trips:**

Trips needing manual attention — system-flagged via rules:
- Status IN_PROGRESS for > 2h (potential stuck trip)
- Cancellation reason = "captain_late" with > 30min wait
- Rider rating ≤ 2 stars

| Column | Source | Default Visible |
|---|---|---|
| Trip ID | `Trip.id` | yes |
| Type | `Trip.type` | yes |
| Flag Reason | computed | yes |
| Captain | `Trip.captain_id` → Captain.name | yes |
| Rider(s) | `Trip.rider_ids[]` → User.name | yes |
| Zone | `Trip.zone_id` → Zone.name (Abriyah only) | yes |
| Created At | `Trip.requested_at` | yes |
| Stars (if rated) | `Trip.rating.stars` | yes |

**Row actions:** `[Investigate]` (drill to Trip Detail) · `[Dismiss Flag]` (clears from queue)

**Tab 3 — Expired Rooms:**

Rooms that hit `room_max_wait_seconds` without captain accept — needs zone/pricing analysis.

| Column | Source | Default Visible |
|---|---|---|
| Room ID | `Room.id` | yes |
| Zone | `Room.zone_id` → Zone.name | yes |
| Room Type | `Room.room_type` (mixed / women_only) | yes |
| Rider Count at Expiry | `Room.rider_count_at_expiry` | yes |
| Opened At | `Room.opened_at` | yes |
| Expired At | `Room.expired_at` | yes (default sort ↓ newest first) |

**Row actions:** `[Investigate Zone]` (drill to Zone Detail) · `[Dismiss]`
**Pattern indicator:** If same zone has ≥5 expired rooms in last 24h, banner: "Zone {name} — high expiry rate. Review pricing or captain supply."

**Tab 4 — Stuck Items:**

Catch-all for orphan states:
- Captains marked online but no location ping > 5 min
- Trips ACCEPTED but no captain location ping
- Rooms LOCKED for > 10 min without progression to DISPATCHED

| Column | Source | Default Visible |
|---|---|---|
| Item Type | enum (captain_idle / trip_no_ping / room_stuck) | yes |
| ID | entity id | yes |
| Related Entity | name or label | yes |
| Stuck Duration | computed | yes |
| Last Event | timestamp | yes |

**Row actions:** `[Force Resolve]` (super-admin only; forces state transition with reason) · `[Investigate]` · `[Dismiss]`

**Empty states per tab:** "No pending captains — you're caught up." / "No flagged trips." / "No expired rooms in the last 24h." / "No stuck items — operations healthy."

---

## §4 Module-Scoped Business Rules

### 4.1 SLA Breach Visualization Rule

- **Applies to:** Needs Action → Pending Captains tab
- **Rule:** Captain rows with `registered_at` more than 24h ago render with red row background and red urgency indicator in the Age column. Tab badge turns red when any row breaches SLA.
- **Rationale:** 24h is the median approval target per Charter §1.3 Success Metrics; visual urgency drives triage.

### 4.2 Activity Highlights Retention Rule

- **Applies to:** Overview → Activity Highlights feed
- **Rule:** Feed shows the last 20 events; events older than 24h are dropped from the feed. Full history accessible via per-module page drill-throughs.
- **Rationale:** Feed is a "what just happened" surface, not an audit log.

### 4.3 Finance Read-Only Action Suppression Rule

- **Applies to:** Needs Action triage actions for Finance role
- **Rule:** Finance-role admins see all Needs Action tabs and rows but every action button (`[Approve]`, `[Reject]`, `[Dismiss]`, `[Force Resolve]`) renders as disabled with tooltip "Finance role is read-only for triage actions."
- **Rationale:** Audit-trail accountability — finance cannot modify operational state.

### 4.4 Pattern Banner Threshold

- **Applies to:** Needs Action → Expired Rooms tab
- **Rule:** When a single zone has ≥5 expired rooms in the trailing 24h window, a banner surfaces at top of the tab: "Zone {name} — high expiry rate. Review pricing or captain supply." Banner click → drill-through to Zone Detail → Pricing tab.
- **Rationale:** Captures the operational pattern that pricing or supply problems cluster in zones.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- Read-only KPI aggregation on Overview
- Real-time city map with zone + captain overlays
- Activity Highlights feed (last 24h)
- 4-tab triage queue (Pending Captains · Flagged Trips · Expired Rooms · Stuck Items)
- Triage actions (Approve · Reject · Investigate · Dismiss · Force Resolve)

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Captain Approval workflow internals | Captains module | Dashboard delegates Approve action to Captains module's underlying state machine |
| Trip Detail page | Operations module | Dashboard drills through but doesn't own |
| Zone Detail page | Zones module | Dashboard drills through |
| Reports (Trip Volume, Captain Leaderboard, etc.) | Reports module | Dashboard shows real-time; Reports shows historical aggregations |
| AI-flagged items (fraud detection) | Sub-Agent (Horizon 2) | Currently a Stub; will add 5th tab "Flagged by AI" when promoted |

### 5.3 Out of Scope (Future)

- **Customizable KPI card layout** (Horizon 1, M2+) — let admins reorder or hide cards
- **Dashboard widgets / modular layout** (Horizon 2) — drag-drop dashboard composition
- **AI-flagged items tab** (Horizon 2) — adds 5th Needs Action tab via Sub-Agent capability `beep.query.fraud_signals`
- **Trend graphs on KPI cards** (Horizon 1) — sparklines showing 7-day trend per KPI

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **KPI Card Strip** | The 8-card row at top of Overview showing real-time operational metrics. Cards subscribe to Event Bus via WebSocket. | Pending merge |
| **Activity Highlights** | Real-time chip feed on Overview showing last 20 significant events (room expiries, approvals, completed trips). 24h retention. | Pending merge |
| **Needs Action Triage** | The 4-tab queue on Needs Action page representing items requiring admin attention. FIFO per tab. SLA-driven urgency surfacing. | Pending merge |
| **SLA Breach** | A pending item that has exceeded its target action time (e.g. > 24h for captain approval). Surfaces as red urgency indicator. | Pending merge |

---

## Appendix A — Cross-Reference Integrity Check (CRI)

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entities Trip, Room, Captain, User, CaptainDailyActivation | §6.1, §6.2, §6.4, §6.5, §6.6 | ✓ |
| §2.3 Events consumed (9 events) | §5.5.1 | ✓ |
| §2.4 Captain Daily Activation Gate | §8.2 | ✓ |
| §2.4 Trip Cancellation Cascade | §8.3 | ✓ |
| §2.6 Real-Time Broadcast pattern | §4.6 | ✓ |
| §2.6 Multi-View Pattern | §4.7 | ✓ |

**Verdict:** PASS

---

**End of Beep Dashboard Module PRD V1.0.0**
