# Beep — Operations Module PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · Details Page Standard V1.0.6+ · App Layout Block

---

## §0 Module Document History

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release to engineering. |

**Status:** **Approved** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+. **Milestone:** M1 (Foundation).

---

## §1 Module Overview

### 1.1 Purpose

The Operations module is the **live ops surface** for Beep — the real-time view of trips and rooms in motion. It is where the on-call operator spends their day: watching the city map for stuck trips, drilling into individual trip detail to call a rider/captain, and monitoring the Abriyah room pipeline. Unlike Dashboard (which aggregates), Operations exposes individual entities at full fidelity with action affordances.

### 1.2 Sub-modules

Per Charter §3.1:

- **Live Trips Map** ⟨single-page cluster: real-time map of all in-progress trips + filter sidebar⟩ — 1 list page
- **Live Rooms** ⟨single-page cluster: real-time list of open Abriyah rooms; Kanban by status⟩ — 1 list page

Cardinality rule: Live Trips Map (1 with annotation ✓) · Live Rooms (1 with annotation ✓). Net Operations list pages: 2.

### 1.3 Package

**Core**. Free-Core package.

### 1.4 Primary Personas

- **Omar** (Operator) — primary user; live ops monitoring throughout shift
- **Super-admin** — escalation actions (force-cancel trip, override dispatch)
- **Yousef** (Finance) — read-only observability

### 1.5 Acceptance Criteria (module-level)

1. Given an Operator opens Live Trips Map, when there are 50 trips in REQUESTED/MATCHED/ACCEPTED/IN_PROGRESS state, then all 50 pins render on the Google Maps canvas within < 2s P95.
2. Given a captain location ping arrives via WebSocket, when the trip's captain pin is visible on the map, then the pin updates position within ≤2s.
3. Given an Operator filters Live Trips Map by `Type = ABRIYAH AND Status = IN_PROGRESS`, then only matching trips render and the count chip shows "12 trips".
4. Given an Operator clicks a trip pin, when the trip card opens, then it shows Trip ID, Type, Status, Rider name(s), Captain name + phone (with Call + WhatsApp buttons), Zone (if Abriyah), and `[Open Detail]` button.
5. Given an Operator opens Live Rooms in Kanban view, when there are 8 rooms across 4 status columns, then each column shows rooms grouped by status (Open · Locked · Dispatched · Expired) with rider count + zone name on each card.
6. Given a room expires while Operator is viewing Live Rooms, when the `beep.room.expired` event fires, then the card moves from Open to Expired column within ≤2s without page refresh.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `Trip` | **Primary entity** on Live Trips Map; Trip Detail accessible via row/pin click | §6.1 |
| `Room` | **Primary entity** on Live Rooms; Room Detail accessible via card click | §6.2 |
| `Captain` | Read-only — captain pin location + call action | §6.4 |
| `User` | Read-only — rider name + call action from Trip card | §6.5 |
| `Zone` | Read-only — zone polygon overlay; per-zone filter | §6.3 |

### 2.2 Events Published

None directly. Operator-triggered cancel actions delegate to backend, which publishes `beep.trip.cancelled`.

### 2.3 Events Consumed

| Event | Handler |
|---|---|
| `beep.trip.requested` | Add new trip pin to Live Trips Map |
| `beep.trip.accepted` | Update pin color (queued → en route) |
| `beep.trip.started` | Update pin color (en route → in progress) |
| `beep.trip.completed` | Remove pin from map; remove room card if Abriyah |
| `beep.trip.cancelled` | Remove pin; surface in Activity Highlights of Dashboard |
| `beep.room.opened` | Add room card to Open column in Live Rooms |
| `beep.room.joined` | Update rider count on room card |
| `beep.room.locked` | Move card from Open to Locked column |
| `beep.room.dispatched` | Move card from Open/Locked to Dispatched column |
| `beep.room.expired` | Move card to Expired column |
| Captain location ping (WebSocket stream) | Update captain pin position on map |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Abriyah Room Matching Engine** | Observer — Live Rooms is the operator-facing view into matching engine state | §8.1 |
| **Trip Cancellation Cascade** | Originator (admin-initiated) — Trip Detail action `[Force Cancel]` triggers cancellation flow | §8.3 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Full read + force-cancel + override actions |
| Operator | Full read + call/WhatsApp captain/rider + investigate; cannot force-cancel without confirmation |
| Finance | Read-only |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Real-Time Trip + Room Broadcast | Both pages subscribe to WebSocket + Firebase RTDB | §4.6 |
| Multi-View Pattern | Live Trips Map (Map + Table); Live Rooms (Table + Kanban) | §4.7 |
| Cross-Surface Boundary Rules | Trip / Room state changes broadcast via Event Bus | §4.9 |
| Trip State Machine | Status colors + valid actions per state | §4.3 |
| Room State Machine | Kanban columns mirror state machine | §4.4 |

### 2.7 Import Specs Used

None.

### 2.8 Sub-Agent Intents Used

None active at v1. Horizon 2 candidate: `beep.execute.optimize_room_dispatch` would surface per-room ✨ icon on Live Rooms cards.

---

## §3 Page Specifications

### 3.1 Sub-Module: Live Trips Map

#### 3.1.1 Live Trips Map — List Page

**Views:** Map (default) + Table (toggleable)

**Purpose:** Real-time situational awareness of every trip in motion.

**Page-level conventions:**
- **Layout:** App Layout Block · page header (title + view switcher Map/Table + filter chips bar + `[Refresh]`) · split body (filter sidebar left 280px + map/table center) · footer count chip
- **Toolbar:** `[Refresh]` · `[Export CSV]` (current filter result) · `[Settings ⚙]` (refresh cadence, pin clustering threshold)
- **Saved Views:** per-user via scope key `data_views.operations.live_trips`
- **Filter retention:** `filters.operations.live_trips`
- **Performance target:** < 2s P95 with 100 trips; < 5s P95 with 500 trips (clustering activates)

**Map view (default):**

- Google Maps SDK centered on admin's home city
- **Pin colors by Trip status:**
  - REQUESTED — yellow
  - MATCHED (Abriyah, in room) — orange
  - ACCEPTED — light blue (captain en route to pickup)
  - IN_PROGRESS — green (carrying rider(s))
  - (CANCELLED / COMPLETED pins removed from map)
- **Pin shape:** circle for Regular, hexagon for Abriyah
- **Captain location pin overlay:** small captain icon next to trip pin showing real-time captain position
- **Zone polygon overlay:** semi-transparent zone boundaries (toggle on/off via Settings)
- **Click pin → trip card popover:**

  | Element | Content |
  |---|---|
  | Header | Trip ID · Type badge · Status badge |
  | Riders | Name(s) · Phone(s) · `[📞 Call]` `[💬 WhatsApp]` per rider |
  | Captain | Name · Phone · `[📞 Call]` `[💬 WhatsApp]` · Plate |
  | Zone (Abriyah only) | Name + per-km rate |
  | Fare | Per-rider fare list with total |
  | Timestamps | Requested · Accepted · Started · ETA |
  | Actions | `[Open Detail]` · `[Force Cancel]` (super-admin only; confirmation required) |

**Table view:**

| Column | Source | Default Visible |
|---|---|---|
| Trip ID | `Trip.id` | yes |
| Type | `Trip.type` | yes |
| Status | `Trip.status` | yes (color-coded) |
| Rider Count | `len(Trip.rider_ids)` | yes |
| Captain | `Trip.captain_id` → name | yes |
| Zone | `Trip.zone_id` → name (Abriyah only) | yes |
| Pickup → Drop-off | distance computed | no |
| Fare Total | sum of `fare_per_rider_iqd` | yes |
| Requested At | `Trip.requested_at` | yes (default sort ↓) |
| Status Duration | computed (time in current status) | yes |

**`columnExcluded`:** `id`, `organization_id`, `rider_ids` (surfaced via rider count), `version`

**Filter sidebar (Map and Table view):**

| Filter | Type | Default |
|---|---|---|
| Type | multi-select | All (REGULAR + ABRIYAH) |
| Status | multi-select | REQUESTED · MATCHED · ACCEPTED · IN_PROGRESS |
| Zone | multi-select (Abriyah-enabled zones) | All |
| Captain | search-as-type | (none) |
| Stuck > N min | toggle + range slider | off |
| Time window | last 1h / 6h / today | last 6h |

**Row/pin actions:**
- `[Open Detail]` → Trip Detail page (full-page workspace)
- `[📞 Call Captain]` → native phone-dial deep link
- `[💬 WhatsApp Captain]` → wa.me deep link with pre-filled trip ID
- `[Force Cancel]` — super-admin only; opens confirmation: "Force-cancel Trip TRIP-N? Reason required." Reason captured; emits `beep.trip.cancelled` with `cancelled_by = system` and Operator's ID in audit log.

**Drill-through:** Click pin → popover → `[Open Detail]` → Trip Detail (3 tabs: Overview · Map Replay · Ratings).

---

### 3.2 Sub-Module: Live Rooms

#### 3.2.1 Live Rooms — List Page

**Views:** Kanban (default) + Table (toggleable)

**Purpose:** Real-time pipeline of Abriyah rooms across their lifecycle. Kanban columns mirror the Room state machine (Charter §4.4).

**Page-level conventions:**
- **Layout:** App Layout Block · page header (title + view switcher Kanban/Table + filter chips + Refresh) · Kanban body (4 columns) OR Table body
- **Saved Views:** scope key `data_views.operations.live_rooms`
- **Performance target:** < 1s P95 with 50 rooms

**Kanban columns (mirroring `Room.status`):**

| Column | Status | Visible | Card Sort |
|---|---|---|---|
| Open | OPEN | always | oldest opened_at ↑ (FIFO) |
| Locked | LOCKED | always | locked_at ↑ |
| Dispatched | DISPATCHED | last 1h only (auto-archive after 1h) | dispatched_at ↓ |
| Expired | EXPIRED | last 24h only (auto-archive after 24h) | expired_at ↓ |

**Card design:**

```
┌──────────────────────────────────┐
│ Room {id}        [women-only 🚺] │
│ Zone: Al-Karada                  │
│ ▮▮▮▯  3 of 4 riders              │
│ ⏱ 2:47 / 5:00 (wait time)        │
│ Riders: Sara A. · Layla M. · ... │
│ Captain: (waiting)               │
└──────────────────────────────────┘
```

- Header: Room ID + women-only icon (🚺) if applicable
- Zone name
- Rider count visual (filled circles + total)
- Wait time progress (current vs `zone.room_max_wait_seconds`)
- Rider name preview (first 2 + ellipsis)
- Captain (if assigned in LOCKED/DISPATCHED)

**Card click → Room Detail page** (3 tabs: Overview · Rider List · Timeline)

**Table view columns:**

| Column | Source | Default |
|---|---|---|
| Room ID | `Room.id` | yes |
| Zone | `Room.zone_id` → name | yes |
| Type | `Room.room_type` (mixed / women_only) | yes |
| Status | `Room.status` | yes |
| Rider Count | `len(Room.rider_ids)` | yes |
| Captain | `Room.captain_id` → name (if any) | yes |
| Opened At | `Room.opened_at` | yes |
| Wait Time / Max | computed | yes |

**Filters:**
- Zone (multi-select)
- Room Type (mixed / women_only)
- Status (multi-select; Kanban view shows all 4 columns by default)

**Row actions (Table view) / Card actions (Kanban):**
- `[Open Detail]` → Room Detail
- `[Force Dispatch]` (super-admin only; LOCKED rooms only) — manually flip LOCKED → DISPATCHED
- `[Force Expire]` (super-admin only; OPEN/LOCKED only) — manually flip to EXPIRED with reason

---

## §4 Module-Scoped Business Rules

### 4.1 Pin Clustering Threshold

- **Applies to:** Live Trips Map → Map view
- **Rule:** When > 200 trip pins are simultaneously visible at the current zoom level, Google Maps polygon clustering activates (groups pins into numbered clusters).
- **Rationale:** Performance — 1000+ pins overwhelm the canvas.

### 4.2 Force Cancel Confirmation

- **Applies to:** Live Trips Map → Force Cancel action
- **Rule:** Force-cancel requires (a) super-admin role, (b) a reason from the standard cancel-reason enum (Charter §4.14), and (c) an explicit confirmation modal. Operator role sees the button disabled with tooltip.
- **Rationale:** Operator-driven cancellation is an escalation — accountability requires explicit role gate.

### 4.3 Kanban Auto-Archive

- **Applies to:** Live Rooms → Kanban view
- **Rule:** DISPATCHED column shows rooms dispatched in the last 1h only; EXPIRED column shows rooms expired in the last 24h. Older rooms move to historical Trip / Room records accessible via Reports.
- **Rationale:** Kanban is live-pipeline; historical analysis lives in Reports.

### 4.4 Captain Location Staleness

- **Applies to:** Live Trips Map → captain pin overlay
- **Rule:** If a captain's last location ping is > 60s old, the captain pin renders in faded gray with tooltip "Last seen Xs ago." If > 5min old, the trip enters Needs Action → Stuck Items.
- **Rationale:** Captain offline mid-trip is an operational signal.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- Real-time live trips map with WebSocket + Firebase RTDB subscription
- Real-time live rooms Kanban + Table
- Filter sidebar with persistence
- Trip card popover with call/WhatsApp deep links
- Drill-through to Trip Detail / Room Detail / Captain Detail / Zone Detail
- Force Cancel + Force Dispatch + Force Expire (super-admin only)

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Trip CRUD | Backend Trip Service (no UI surface) | Trips are user-created (rider/captain apps); admins only escalate cancel |
| Room creation | Backend Room Service via Matching Engine | Rooms are runtime — not admin-created |
| Captain CRUD | Captains module | Captain entity ownership |
| Zone polygon CRUD | Zones module | |
| Historical trip / room data | Reports module | Operations is live-only |

### 5.3 Out of Scope (Future)

- **Cluster heatmap layer** showing demand density (Horizon 1)
- **AI-suggested optimal dispatch** per-room icon (Horizon 2 via `beep.execute.optimize_room_dispatch`)
- **Bulk re-dispatch** for stuck rooms (Horizon 1)

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Live Trips Map** | The real-time Google Maps surface in Operations showing every trip in {REQUESTED, MATCHED, ACCEPTED, IN_PROGRESS} state as a pin. Updates via WebSocket. | Pending merge |
| **Pin Cluster** | A Google Maps cluster representing N trip pins when zoom level shows > 200 pins. Shows count badge; expand on zoom-in. | Pending merge |
| **Force Cancel** | The super-admin action on Live Trips Map / Trip Detail that triggers `beep.trip.cancelled` with `cancelled_by = system` and reason. Audit-logged. | Pending merge |
| **Captain Location Staleness** | The fade-out / Needs Action escalation pattern when a captain's location ping is stale. > 60s = faded pin; > 5min = Stuck Items entry. | Pending merge |

---

## Appendix A — Cross-Reference Integrity Check (CRI)

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entities Trip, Room, Captain, User, Zone | §6.1, §6.2, §6.4, §6.5, §6.3 | ✓ |
| §2.3 Events (11 events) | §5.5.1 | ✓ |
| §2.4 Abriyah Room Matching | §8.1 | ✓ |
| §2.4 Trip Cancellation Cascade | §8.3 | ✓ |
| §2.6 Real-Time Broadcast | §4.6 | ✓ |
| §2.6 Multi-View | §4.7 | ✓ |
| §2.6 Trip State Machine | §4.3 | ✓ |
| §2.6 Room State Machine | §4.4 | ✓ |

**Verdict:** PASS

---

**End of Beep Operations Module PRD V1.0.0**
