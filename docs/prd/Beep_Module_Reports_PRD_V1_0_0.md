# Beep — Reports Module PRD V1.0.0 (Stub)

**Conforms to:** Module PRD Standard V1.4.1+ (§0–§2 + §5 populated; §3–§4 + §6 deferred to Active version at M2 — Stub mode)

---

## §0 Module Document History

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base **Stub** — §0 + §1 + §2 + §5 populated. §3 Page Specifications + §4 Module-Scoped Rules + §6 Glossary deferred to Active version at M2 per Implementation Roadmap V1.0 §5.2. |

**Status:** **Approved (Stub)** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+. **Milestone:** **M2 (Core Completeness)** — module is registered but not yet authored to Active state. Promotion happens at M2 when 2 weeks of operational data is available and the reports specifications can be designed against real data shapes.

---

## §1 Module Overview

### 1.1 Purpose

The Reports module is Beep's **historical analytics surface** — read-only aggregations across Trips, Captains, Rooms, and Daily Activations. The module owns 7 reports across 3 categories: Trip Reports (Trip Volume · Abriyah Performance · Cancellation Analysis), Captain Reports (Leaderboard · Daily Activation Report), and Financial Reports (Revenue by Zone · Activation Fees Accrued / Collected). Unlike Dashboard (real-time) or Operations (live ops), Reports answers "what happened" questions over arbitrary date ranges.

**Why Stub at M1:** Reporting requires operational data to be useful. Building reports in Month 1 with no live data produces empty surfaces and wasted effort. The module is registered at M1 with a sidebar landing entry that shows "Reports coming in M2 — data is being collected." Engineering work on this module begins after M1 launch.

### 1.2 Sub-modules

Per Charter §3.1:

- **Trip Reports** — 3 list pages (Trip Volume · Abriyah Performance · Cancellation Analysis)
- **Captain Reports** — 2 list pages (Captain Leaderboard · Daily Activation Report)
- **Financial Reports** — 2 list pages (Revenue by Zone · Activation Fees Accrued)

Net Reports list pages: 7 (planned for M2 Active).

### 1.3 Package

**Core** — included in Free-Core; no add-on gate.

### 1.4 Primary Personas

- **Omar** (Operator) — uses Trip Reports + Captain Reports for weekly ops review
- **Yousef** (Finance) — primary user of Financial Reports for monthly accrual / revenue tracking
- **Super-admin** — strategic overview across all reports

### 1.5 Acceptance Criteria (Stub-only — Active criteria deferred to M2)

1. Given an admin opens Reports at M1, then the module shows a landing page reading: "Reports activate at M2. Live operational data is being collected — the 7 reports below will be available within 8 weeks of launch."
2. Given the module reaches M2 promotion, then all 7 reports activate with the specifications authored in Reports PRD V1.0.0 Active (this PRD bumps Stub → Active without a major-version increment per Roadmap §6).

---

## §2 Charter References

### 2.1 Entities Used (read-only aggregation)

| Entity | Role | Charter Reference |
|---|---|---|
| `Trip` | Read-only aggregation source | §6.1 |
| `Room` | Read-only — Abriyah performance metrics | §6.2 |
| `Zone` | Read-only — revenue groupings | §6.3 |
| `Captain` | Read-only — leaderboard, activation status | §6.4 |
| `CaptainDailyActivation` | Read-only — accrued / collected fees | §6.6 |
| `Rating` | Read-only — average rating aggregations | §6.7 |

### 2.2 Events Published

None. Reports is a read-only consumer.

### 2.3 Events Consumed

| Event | Handler Action |
|---|---|
| `beep.trip.completed` | Incremental rollup for Trip Volume / Revenue by Zone (at M2) |
| `beep.trip.cancelled` | Incremental rollup for Cancellation Analysis |
| `beep.room.dispatched` | Incremental rollup for Abriyah Performance fill rate |
| `beep.room.expired` | Incremental rollup for Abriyah Performance expiry rate |
| `beep.captain.activated_today` | Incremental rollup for Daily Activation Report + Activation Fees Accrued |

### 2.4 Cross-Module Flows This Module Participates In

None directly. Reports is a leaf module — historical aggregation of upstream module data.

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Full access to all 7 reports |
| Operator | Trip Reports + Captain Reports |
| Finance | Financial Reports + Captain Reports (read-only) |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Multi-View Pattern | Most reports declare Table view only; some may add Chart variant at M2 design | §4.7 |

### 2.7 Import Specs Used

None.

### 2.8 Sub-Agent Intents Used

None active at v1. Horizon 2: AI-driven anomaly detection on report data is a possible Sub-Agent extension.

---

## §3 Page Specifications

**DEFERRED TO ACTIVE VERSION.** Detailed list page specs (columns, filters, default sorts, bulk actions, drill-throughs, performance targets) will be authored at M2 promotion alongside 2 weeks of operational data analysis.

Planned 7 reports for M2 Active (specs TBD):

| # | Report | Category | Headline metric |
|---|---|---|---|
| 1 | Trip Volume | Trip | Total trips per day/week/month by type · cancellation rate · avg fare |
| 2 | Abriyah Performance | Trip | Room fill rate · avg room wait time · women-only share |
| 3 | Cancellation Analysis | Trip | Cancellation count + reason breakdown by zone / time-of-day |
| 4 | Captain Leaderboard | Captain | Top N captains by trip count / avg rating / total earnings |
| 5 | Daily Activation Report | Captain | Activation rate per day · % of approved captains activating · activation by zone |
| 6 | Revenue by Zone | Financial | Total revenue (accrued at v1; collected at v2) per zone over date range |
| 7 | Activation Fees Accrued | Financial | Sum of accrued fees per day/week/month; switches to "Collected Fees" semantics at M3 |

---

## §4 Module-Scoped Business Rules

**DEFERRED TO ACTIVE VERSION.** Reporting business rules (data retention, aggregation timezone, weekend boundaries, etc.) will be authored at M2.

---

## §5 Module Scope Boundaries

### 5.1 In Scope (planned for M2 Active)

- 7 historical reports across Trip / Captain / Financial categories
- Date-range filtering
- Export to CSV / Excel
- Drill-through from report rows to entity Detail pages

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Real-time KPIs | Dashboard module | Reports is historical; Dashboard is live |
| Per-trip detail | Operations module (Trip Detail) | Reports is aggregation; Operations is per-entity |
| Per-captain detail | Captains module (Captain Detail) | Same |
| Custom report builder | Out (Horizon 3) | v1 / v2 ships 7 fixed reports |
| Scheduled email reports | Out (Horizon 2) | |

### 5.3 Out of Scope (Future)

- **Custom report builder** (Horizon 3) — drag-drop report composition
- **Scheduled report emailing** (Horizon 2) — weekly accrual report auto-sent to finance
- **AI-driven anomaly detection** (Horizon 2) — Sub-Agent capability flags unusual patterns in report data
- **Chart variants** for report views (M2 design decision per report)
- **Per-city scoped reports** (M3 with multi-city) — filter chip + scope-aware aggregation

---

## §6 Module Glossary Additions

**DEFERRED TO ACTIVE VERSION.** Glossary additions will be authored at M2 when report-specific terms are introduced.

---

## Appendix A — CRI (Stub)

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entities Trip, Room, Zone, Captain, CaptainDailyActivation, Rating | §6.1, §6.2, §6.3, §6.4, §6.6, §6.7 | ✓ |
| §2.3 Events consumed | §5.5.1 | ✓ |
| §2.6 Multi-View | §4.7 | ✓ |

**Verdict:** PASS (Stub).

---

**End of Beep Reports Module PRD V1.0.0 (Stub)**
