# Beep — App Charter V1.0.0

**Conforms to:** App Charter Standard V1.3.1+ · Module PRD Standard V1.4.1+ · Sub-Agent PRD Standard V1.0.1+ · Add New Form Standard V1.2.3+ · Details Page Standard V1.0.6+ · App Layout Block

---

## Section 0: Document History + Module PRD Index

### 0.1 Charter Version Table

| Version | Date | Summary of Changes |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release to engineering. Transformed from `Beep_PRD_V1.0.md` into TORCH App Charter format per Implementation Playbook A. |

### 0.2 Charter Status

| Status | Value |
|---|---|
| Current status | **Approved** (V1.0.0 — 2026-05-19) |

### 0.3 Module PRD Index + Sub-Agent PRD Index

**Module PRD Index:** 7 L1 modules in the Admin Dashboard, each authored as a separate Module PRD per `TORCH_Module_PRD_Standard.md`. The Customer App and Captain App are documented as **Mobile Client Surfaces** in §3.4 — they are platform clients with flow specs, not list-page modules.

| Module | File | Module PRD Version | Compatible Charter Version | Milestone | Owner | Status |
|--------|------|-------------------|---------------------------|-----------|-------|--------|
| Dashboard | `Beep_Module_Dashboard_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |
| Operations | `Beep_Module_Operations_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |
| Zones | `Beep_Module_Zones_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |
| Captains | `Beep_Module_Captains_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |
| Customers | `Beep_Module_Customers_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |
| Reports | `Beep_Module_Reports_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M2 (Core Completeness)** | Operations PM | Stub at M1 → Active at M2 |
| Setup | `Beep_Module_Setup_PRD_V1.0.0.md` | V1.0.0 | V1.0.0+ | **M1 (Foundation)** | Operations PM | Active |

**Sub-Agent PRD Index:** Beep registers one sub-agent (`beep.agent`). Stub authored at M1 (no AI features in v1; intent catalog deferred to v2). Full version will be authored when AI / Intelligence Layer milestone is approved.

| Sub-Agent | File | Sub-Agent PRD Version | Compatible Charter Version | Milestone | Owner | Status |
|-----------|------|----------------------|---------------------------|-----------|-------|--------|
| `beep.agent` | `Beep_Sub_Agent_PRD_V1.0.0.md` (Stub) | V1.0.0 (Stub) | V1.0.0+ | **M4+ (Deferred — Horizon 2)** | Operations PM | Stub (no active capabilities) |

**Compatibility rule:** Module PRDs and the Sub-Agent PRD declare a `Compatible Charter Version` field. Charter major bumps may force re-baseline at the next milestone boundary per the Charter Compatibility Lock.

---

## Section 1: Executive Summary

### 1.1 Overview

**Beep** is a ride-hailing platform for Iraq, structured as a TORCH Business OS application that comprises one Admin Dashboard (the L1-module surface) plus two mobile client surfaces — the **Customer App** and the **Captain App** — that share a single backend, data model, and Event Bus. Beep ships with one unified `Trip` entity model encompassing two trip types — `REGULAR` (standard 1-rider point-to-point ride, parity with Baly) and `ABRIYAH` (zone-based shared ride for up to 4 riders with distance-based per-km pricing) — with type-discriminated routing, matching, and billing behavior.

Beep's single major differentiator is the **Abriyah product (عبريه)**: pre-defined geographic zones where both pickup and drop-off of every rider must remain inside the same zone, with a transient `Room` entity that matches up to 4 mixed or women-only riders before dispatching to a single captain. Per-rider fare is calculated independently from that rider's pickup→drop-off distance × the zone's per-km rate (e.g. 1,000 IQD/km), giving fully transparent pricing with no split or share between riders. Captains are gated by a static **2,000 IQD daily activation fee** (recorded but not collected at v1; collection ships at v2 alongside online payments). No paid add-ons at v1; the Beep platform is single-package Free-Core for the v1 launch.

### 1.2 Key Objectives

- Unified `Trip` entity with two types (REGULAR · ABRIYAH) and type-driven matching: 1-to-1 dispatch for REGULAR; Room-mediated 1-to-N matching for ABRIYAH
- Single Free-Core package viable standalone at v1; Online Payments add-on planned at v2 (Horizon 1) to enable real wallet/card-based collection of trip fares and the daily captain activation fee
- One platform, three surfaces — Admin Dashboard (web, 7 L1 modules) + Customer App (mobile flow) + Captain App (mobile flow) — all sharing one backend, one Event Bus, one entity model
- Cross-surface event ownership — every state change publishes an Event Bus event that drives push notifications on the two mobile clients and real-time dashboard updates on the web admin
- 6 published events covering Trip lifecycle (`requested · accepted · started · completed · cancelled · rated`), 4 covering Room lifecycle (`opened · locked · dispatched · expired`), 3 covering Captain lifecycle (`registered · approved · activated_today`)
- 5 zone management primitives (polygon, type, per-km rate, base fare, women-only flag) with the `ST_Contains` PostGIS check at the database level
- Captain Approval Workflow registered with platform — 1 template (single-step admin review on signup) with internal-only inline UX on Captain Detail page; daily activation gating enforced at session start
- Multi-branch entity scope deferred to v2 (single-city Baghdad launch); multi-currency deferred (IQD-only at v1)
- 0 AI features at v1 (Sub-Agent registered as Stub for forward compatibility); 3 candidate AI features in Charter §11 Horizon 2 (Fraud Detection · Surge Pricing Suggestions · Captain-Match Optimizer)
- Real-time WebSocket presence on Admin Operations → Live Trips Map for operator situational awareness

### 1.3 Success Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Trip request to nearest-captain broadcast | < 3 seconds P95 | Backend log timing |
| Admin Dashboard live trips map page load | < 1s P50, < 2s P95 | Performance monitoring |
| Abriyah share of total trips in covered zones | 25–35% by month 6 | Trip analytics by `Trip.type` |
| Average Abriyah room wait time | < 3 minutes | Room timing telemetry (`opened_at` → `dispatched_at` or `expired_at`) |
| Room fill rate (rooms reaching 4 riders before dispatch) | ≥ 30% by month 6 | Room analytics |
| Captain approval turnaround | < 24h median from registration submit to admin Approve/Reject | Workflow timing |
| Daily captain activation rate | ≥ 70% of approved captains tap "Activate Today" on a working day | Captain Daily Activation analytics |
| Cancellation rate (all trip types) | < 8% | Trip analytics |
| 30-day rider retention | ≥ 40% | Cohort analysis |
| Mobile app availability | 99.5% monthly | Uptime monitoring |
| Concurrent online capacity (year 1 target) | 10K captains + 50K riders | Load test gate |

### 1.4 Scope Boundaries (cumulative — app-level)

| In Scope | Out of Scope | Rationale |
|----------|-------------|-----------|
| Trip master CRUD (2 types — Regular · Abriyah) | Multi-stop trips (rider with 2+ destinations) | Deferred to v2 |
| Room matching engine for Abriyah (up to 4 riders, mixed or women-only) | Sub-room split (e.g. 2 women + 2 men in one trip) | Out-of-band — Abriyah is single-type per room by design |
| Zone CRUD with polygon, type, per-km rate, base fare, women-only flag | Cross-city zone aggregation, inter-city trips | v1 is intra-city only (Baghdad first) |
| Captain registration + single-step admin approval workflow | Tiered captain levels, captain reviews/disputes beyond stars | Deferred to v2 |
| Daily activation fee (2,000 IQD, static — recorded only) | Real fee collection (wallet / card / agent-collected cash) | v2 with Online Payments add-on |
| Cash-only trip fares paid on drop-off | Wallet / credit card / coupon / split payment | v2 with Online Payments add-on |
| Native phone call + WhatsApp deep-link from in-app trip detail | In-app voice / video / VoIP | Out-of-scope — Iraq market doesn't expect it; phone+WhatsApp is the local norm |
| In-app rider↔captain chat after acceptance | Group chat for Abriyah rooms (4 riders + captain) | Deferred — Abriyah relies on captain navigation, not group coordination |
| 1–5 star rating after trip with optional comment | Complaint workflow, escalation, refunds | Deferred to v2 |
| Bilingual UI (Arabic primary, RTL; English secondary) | Right-to-left content authoring for admin dashboard | Deferred — admin is operator-facing and operator can read English |
| Single-city operations (Baghdad) | Multi-city / multi-country support | Deferred to v2 expansion phase |
| Single-currency (IQD) | Multi-currency display | Iraq market is IQD-only |
| Masked phone numbers between rider and captain | Real numbers visible (v1 behavior) | v2 — current behavior is intentional (riders trust direct numbers) |

**Scope-drift control:** Any new scope item added in a Module PRD that is not reflected here requires a Charter update.

### 1.5 Target Users & Personas

| Persona | Role | Primary Goal | Key Pain Point |
|---------|------|-------------|---------------|
| **Sara** | Rider (Customer) | Cheap reliable short trips inside her neighborhood (2–6 trips/week) | Standard ride-hail is expensive for short trips; she's open to sharing if price drops meaningfully |
| **Karim** | Captain (Driver) | Flexible income with short turnover trips, willing to pay small daily fee | Long pickups across the city eat his fuel and time; he wants to stay in one zone all day |
| **Layla** | Female Captain | Driving income while serving women-only Abriyah riders | Cultural / safety constraints limit her ability to take male passengers — Beep's women-only mode lets her work |
| **Omar** | Operator / Admin | Run zones, approve captains, monitor live trips, adjust per-zone pricing | No single dashboard today; he runs ops over WhatsApp + spreadsheets |
| **Yousef** | Finance (read-only) | Track daily activation fee accrual, captain payouts, platform revenue | Needs visibility into recorded-but-uncollected fees at v1 + actuals at v2 |

### 1.6 Technology Stack

Beep uses the standard TORCH Business OS technology stack — see `torch-design-principles.md §11` — with three app-specific stack additions noted here for engineering:

| Component | Technology | Rationale |
|---|---|---|
| Mobile apps (Customer + Captain) | Flutter (single codebase, Android-first per Iraq market) | iOS App Store availability in Iraq is limited at launch |
| Real-time trip + room state | WebSockets + Firebase Realtime DB (hybrid: WebSocket for captain-app trip stream, Firebase for room state broadcasts) | Mobile resilience over flaky 3G |
| Spatial queries | **PostgreSQL + PostGIS (mandatory)** — `ST_Contains` for zone polygon containment | Without PostGIS, Abriyah pickup/dropoff validation collapses |
| Maps | Google Maps SDK | Familiar UX for Iraqi market |
| SMS / OTP | Iraqi gateway (Asiacell or Korek partner — final selection in §11 Open Decisions) | Local-network SMS reliability |

See **Appendix A** for the full technology stack with rationale per layer.

---

## Section 2: Module Packaging & Entitlements

### 2.1 Package Definitions

| Package | Type | Price | Includes |
|---------|------|-------|----------|
| **Core Beep** | Free-Core | 0 IQD/mo (Beep platform itself is free to admins; riders/captains pay per-trip cash) | Admin Dashboard (Dashboard + Operations + Zones + Captains + Customers + Reports + Setup) · Customer App (Regular + Abriyah trip booking, mixed + women-only modes) · Captain App (registration + daily activation + Regular + Abriyah acceptance) · 2 trip types (Regular · Abriyah) · Room matching engine for Abriyah · Cash payments + native phone/WhatsApp · 1–5 star rating · Captain Approval Workflow · Daily activation fee recording (static, no collection) · Bilingual EN+AR · Single-city (Baghdad) operations · 0 AI features at v1 |
| **Online Payments** ⟨v2 add-on — Horizon 1⟩ | Paid Add-on (price TBD) | Activates wallet + card for trip fares · Real daily activation fee collection · Masked phone numbers between rider and captain · Promo codes + referral program · 0 new AI features (still v1) |

### 2.2 Entitlement Behavior

| State | Sidebar | Pages | Data | AI Features |
|-------|---------|-------|------|-------------|
| **v1 (Free-Core only)** | All 7 admin modules visible | All pages active; cash-only payment flow | Trip / Room / Zone / Captain / User entities live | No AI features; ✨ panel suppressed |
| **AI Orchestrator subscription off (default at v1)** | No sidebar change | All pages active | Full data access | ✨ panel hidden (no AI capabilities registered yet) |
| **Online Payments add-on not purchased** ⟨v2 default⟩ | No sidebar change at v2 | Wallet / Payment Method tab hidden on Customer App profile; Daily Fee Collection tab hidden on Captain App | Trip continues cash; Daily activation recorded only | N/A |

### 2.3 Sidebar Summary

| Condition | Admin Dashboard Sidebar L1 Items |
|-----------|-----------------|
| Core only (v1) | 7 items: Dashboard · Operations · Zones · Captains · Customers · Reports · Setup |
| Core + Online Payments add-on (v2) | 7 items (no new modules; payment surfaces are tabs inside existing pages) |

---

## Section 3: Application Architecture

### 3.1 Navigation Tree — Admin Dashboard

The OS shell (launcher · sidebar icon strip · browser-style tab bar · header logo · footer with breadcrumbs + Support / Feedback / User Manual) is owned by the **App Layout Block**. Beep declares only its module map and tab titles below.

```
Beep — Admin Dashboard
├── Dashboard                                   ◀ CORE
│   ├── Overview [Table]                        ⟨single-page cluster: app landing surface; KPI cards + city map + Activity Highlights⟩
│   └── Needs Action [Table]                    ⟨single-page cluster: tabbed admin triage with 4 tabs⟩
│
├── Operations                                  ◀ CORE
│   ├── Live Trips Map [Map, Table]             ⟨single-page cluster: real-time map of all in-progress trips + filter sidebar⟩
│   └── Live Rooms [Table, Kanban]              ⟨single-page cluster: real-time list of open Abriyah rooms; Kanban by status (Open / Locked / Dispatched / Expired)⟩
│
├── Zones                                       ◀ CORE
│   └── Zones [Table, Map]                      ⟨single-page cluster: list + map view of all polygons; click row → Zone Detail with polygon editor⟩
│
├── Captains                                    ◀ CORE
│   ├── Pending Approval [Table, Inbox]
│   ├── All Captains [Table]
│   └── Daily Activation Log [Table]
│
├── Customers                                   ◀ CORE
│   └── All Customers [Table]
│
├── Reports                                     ◀ CORE — sub-modules are entry points; no Reports Hub screen
│   ├── Trip Reports
│   │   ├── Trip Volume [Table]
│   │   ├── Abriyah Performance [Table]
│   │   └── Cancellation Analysis [Table]
│   ├── Captain Reports
│   │   ├── Captain Leaderboard [Table]
│   │   └── Daily Activation Report [Table]
│   └── Financial Reports
│       ├── Revenue by Zone [Table]
│       └── Activation Fees Accrued [Table]
│
└── Setup                                       ◀ CORE
    ├── Operations Foundations
    │   ├── Pricing Defaults [Table]            ⟨city-level fallback per-km rate; per-zone overrides live in Zone Detail⟩
    │   ├── Daily Activation Fee [Table]        ⟨single-row setting: 2,000 IQD default⟩
    │   └── Room Settings [Table]               ⟨max riders (4), max wait seconds (300), women-only globally enabled (true)⟩
    ├── Admin Users [Table]                     ⟨admin role management — super-admin, operator, finance read-only⟩
    └── App Settings ⟨single-page cluster⟩
        └── General Settings [Table]
```

### 3.2 Page Count Summary

| Page Type | Count | Breakdown |
|-----------|-------|-----------|
| List Pages (Admin) | 19 | Dashboard 2 · Operations 2 · Zones 1 · Captains 3 · Customers 1 · Reports 7 · Setup 5 (incl. Pricing Defaults · Daily Activation Fee · Room Settings · Admin Users · General Settings) |
| Detail / Workspace Pages (Admin) | 5 | Zone Detail (4 tabs: Overview · Polygon Editor · Pricing · History) · Captain Detail (5 tabs: Overview · Documents · Daily Activation History · Trips · History) · Customer Detail (3 tabs: Overview · Trips · History) · Trip Detail (3 tabs: Overview · Map Replay · Ratings) · Room Detail (3 tabs: Overview · Rider List · Timeline) |
| Full-Page Forms / Wizards (Admin) | 1 | Zone Creation Wizard (Wide Drawer 60-80% — Step 1 Polygon Draw · Step 2 Attributes · Step 3 Review) |
| Compact Drawer Forms (Admin) | 2 | Add Admin User · Edit Pricing Defaults |
| Mobile Client Flows (Customer + Captain) | 9 | Customer: Onboarding · Home · Regular Booking · Abriyah Booking · Waiting Room · Live Trip · Trip Complete & Rate. Captain: Onboarding · Approval Pending · Activate Today · Online Toggle · Trip Queue · Live Trip · Earnings. *(Documented as flows in §3.4 — not list pages.)* |
| **Total Interactive Admin Pages** | **27** | |
| **Total Mobile Client Flows** | **~14** | (7 Customer + 7 Captain) |

### 3.3 Navigation Pattern — Admin Dashboard

Per `torch-design-principles.md §1` and §6.2 — list pages declare view types per qualifying criteria; sub-modules host ≥2 list pages or carry single-page-cluster annotation; "Add new" actions are list-page buttons or Search Command Center actions, never sidebar items.

**Navigation completeness:** Every list page either appears in §3.1 above or is documented in §11 Future Enhancements.

### 3.4 Mobile Client Surfaces — Customer App + Captain App

The Customer App and Captain App are **platform clients**, not L1 sidebar modules. They share Beep's backend, data model, and Event Bus with the Admin Dashboard. Their flows are documented in the respective Module PRDs:

- **Customer App** — see `Beep_Module_Customer_App_PRD_V1.0.0.md`
- **Captain App** — see `Beep_Module_Captain_App_PRD_V1.0.0.md`

Both apps follow the **Mobile Client Surface Standard** (Charter §4.15): screen flows rather than list pages, native gesture navigation, push-notification-driven state transitions, offline-resilient action queues.

**Mobile client flow inventory:**

| Surface | App | Trigger | Outcome |
|---|---|---|---|
| Onboarding | Customer | First app open | Phone OTP, gender (optional, required for women-only) |
| Home | Customer | App open after onboarding | Two primary CTAs: Regular · عبريه |
| Regular Booking | Customer | Tap Regular | Pickup pin · destination pin · estimated fare · Request |
| Abriyah Booking | Customer | Tap عبريه | Zone detection · room type (mixed / women-only) · pickup pin (in-zone) · destination pin (in-zone) · fare = distance × per-km rate · Join Room |
| Waiting Room | Customer | After Join Room | Live counter "waiting for up to N more riders" + wait time progress + cancel |
| Live Trip | Customer + Captain | After room dispatched OR captain accepted | Map · live captain location · ETA · in-app chat + Call + WhatsApp buttons · cancel |
| Trip Complete & Rate | Customer + Captain | Drop-off complete | Final fare + 1–5 star rating + optional comment |
| Approval Pending | Captain | After registration submit | Waiting screen + push notification on Approve/Reject |
| Activate Today | Captain | First open of day after approval | Confirm 2,000 IQD daily fee · enables online toggle (static at v1) |
| Online Toggle | Captain | After Activate Today | Online / Offline switch · receives trip + room requests when online |
| Trip Queue | Captain | While online | Incoming trip requests (Regular) + room requests (Abriyah, filtered by gender for women-only) · Accept / Decline |
| Earnings | Captain | Earnings tab | Daily / weekly gross earnings minus 2,000 IQD daily fee |

---

## Section 4: Core Architectural Patterns

### 4.1 AI Architecture

**Beep registers 0 AI features at v1.** The Sub-Agent PRD ships as a Stub (registration contracts only; no active capabilities). Per `torch-design-principles.md §4`, the contract is preserved for forward compatibility — when the AI / Intelligence Layer milestone is approved (post-v2), the Sub-Agent will be promoted to Full and inline AI features added per the candidates in §11.

**Candidate AI features for Horizon 2 (not active at v1):**

| # | Candidate Feature | Module | Notes |
|---|-------------------|--------|-------|
| 1 | Fraud Detection | Operations · Captains | Flag unusual trip patterns, document-mismatch on registration |
| 2 | Surge Pricing Suggestions | Zones | AI suggests temporary per-km rate adjustments per zone based on demand |
| 3 | Captain-Match Optimizer | Operations | Smarter room dispatching when multiple captains in zone |

**Graceful Degradation:** At v1, the ✨ panel is hidden across the Admin Dashboard. Inline AI button slots are reserved but render nothing. When the Sub-Agent is promoted to Full, these slots activate without UI re-layout.

**Sub-agent registration is out of scope for this section** — see §5.3.

### 4.2 Unified Trip Entity & Type System

All trips (Regular and Abriyah) share a single master entity with type-discriminated behavior. Per-rider fare is calculated independently — even Abriyah's 4-rider trips emit one fare per rider, not a split single fare — keeping the billing model linear in rider count.

| Trip Type | Rider Count | Same-Zone Constraint | Per-Rider Fare Source | Variant-able | Core Use Case |
|-----------|:--:|:--:|:--:|:--:|---|
| `REGULAR` | 1 | — (any pickup / any destination) | Distance + base fare (city-level pricing) | — | Standard 1-rider point-to-point |
| `ABRIYAH` | 1–4 | ✓ both pickup & destination inside same zone | Distance × zone per-km rate (+ optional zone base fare) | — | Shared in-neighborhood trips |

### 4.3 Trip State Machine

```
                       ┌──────────────┐
                       │  REQUESTED   │ ◀ initial
                       └──────┬───────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
       ┌──────────────┐               ┌──────────────┐
       │   MATCHED    │ (Abriyah —    │   ACCEPTED   │ (Regular —
       │ (in Room)    │  joined room) │  captain     │  direct
       └──────┬───────┘               │  accepted)   │  dispatch)
              │                       └──────┬───────┘
              │ room dispatched or            │
              │ captain accepts room          │
              └───────────────┬───────────────┘
                              ▼
                       ┌──────────────┐
                       │ IN_PROGRESS  │
                       │ (captain en  │
                       │  route &     │
                       │  picking up) │
                       └──────┬───────┘
                              │ all drop-offs done
                              ▼
                       ┌──────────────┐
                       │  COMPLETED   │ ◀ terminal (rated)
                       └──────────────┘

                  Any state → CANCELLED ◀ terminal
                              (rider, captain, or system timeout)
```

- **Initial state:** REQUESTED
- **Terminal states:** COMPLETED · CANCELLED
- **Transitions:**
  - REQUESTED → MATCHED (Abriyah only — rider joined a Room; emits `beep.trip.matched`)
  - REQUESTED → ACCEPTED (Regular — captain accepted directly; emits `beep.trip.accepted`)
  - MATCHED → ACCEPTED (Room dispatched to captain — auto on full room OR captain manual accept; emits `beep.trip.accepted` + `beep.room.dispatched`)
  - ACCEPTED → IN_PROGRESS (captain marks "Started" on pickup leg; emits `beep.trip.started`)
  - IN_PROGRESS → COMPLETED (last drop-off marked done; emits `beep.trip.completed`)
  - REQUESTED / MATCHED / ACCEPTED → CANCELLED (any actor; emits `beep.trip.cancelled` with reason)

### 4.4 Room State Machine (Abriyah-specific)

```
                       ┌──────────────┐
                       │     OPEN     │ ◀ initial (room created when first rider joins zone)
                       └──────┬───────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
       ┌──────────────┐               ┌──────────────┐
       │    LOCKED    │ (captain      │   EXPIRED    │ ◀ terminal
       │ (captain     │  accepted     │ (no captain  │ (room_max_wait
       │  accepted    │  before full) │  accepted in │  exceeded;
       │  before 4    │               │  time window)│  riders notified)
       │  riders)     │               └──────────────┘
       └──────┬───────┘
              │
              ▼
       ┌──────────────┐
       │  DISPATCHED  │ ◀ terminal (auto on 4 riders OR via LOCKED)
       │ (captain en  │
       │  route to    │
       │  riders)     │
       └──────────────┘
```

- **Initial state:** OPEN
- **Terminal states:** DISPATCHED · EXPIRED
- **Transitions:**
  - OPEN → DISPATCHED (room reaches 4 riders — auto-dispatch; emits `beep.room.dispatched`)
  - OPEN → LOCKED (captain accepts partial room; emits `beep.room.locked`)
  - LOCKED → DISPATCHED (captain confirms; emits `beep.room.dispatched`)
  - OPEN / LOCKED → EXPIRED (room_max_wait_seconds exceeded with no captain; emits `beep.room.expired`)
- **Rules:**
  - A LOCKED room rejects new rider joiners (room is "captain-claimed")
  - An OPEN room with type=`women_only` is visible only to female captains
  - A rider can be in only one OPEN/LOCKED room at a time; cancelling exits the room and reopens the slot

### 4.5 Captain Lifecycle State Machine

```
                       ┌──────────────┐
                       │   PENDING    │ ◀ initial (registration submitted)
                       └──────┬───────┘
                              │ admin Approve / Reject
              ┌───────────────┴───────────────┐
              ▼                               ▼
       ┌──────────────┐               ┌──────────────┐
       │   APPROVED   │               │   REJECTED   │ ◀ terminal
       └──────┬───────┘               └──────────────┘
              │
              │ admin Block (any time)
              ▼
       ┌──────────────┐
       │   BLOCKED    │ ◀ terminal (admin-initiated; reversible to APPROVED via unblock)
       └──────────────┘
```

- **Initial state:** PENDING
- **Terminal states:** REJECTED · BLOCKED (BLOCKED reversible via admin Unblock → APPROVED)
- **Daily activation:** Orthogonal to the lifecycle state — an APPROVED captain must additionally have a `CaptainDailyActivation` row for today's date with status `paid` (or `waived`) before the captain app exposes the Online toggle.

### 4.6 Real-Time Trip & Room Broadcast

Beep applies a hybrid real-time pattern: **WebSockets** for the captain-app trip-stream subscription (captain receives incoming trip requests as a server-pushed stream), and **Firebase Realtime DB** for Room state broadcasts (Customer App subscribes to its room and sees rider-count + wait-time updates without polling). The Admin Dashboard's Live Trips Map and Live Rooms pages subscribe to the same WebSocket stream filtered by admin city/zone.

Conflict resolution: optimistic-locking on Trip / Room records with `version` integer; conflicting captain accepts on the same room are resolved first-write-wins.

### 4.7 Multi-View Pattern

Per `torch-design-principles.md §6.1–6.2`, Beep's list pages support:

| View | Where it qualifies | Beep Pages |
|---|---|---|
| Table | always | every list page |
| Kanban | ≥3 state machine stages with pipeline value | Live Rooms (Open / Locked / Dispatched / Expired); Captain Daily Activation Log (Paid / Pending / Waived) optional |
| Inbox | sequential processing with detail preview | Captains → Pending Approval |
| Map | spatial entities | Operations → Live Trips Map; Zones list |
| Tree | 3+ level hierarchy | — (Beep has no tree hierarchies at v1) |

### 4.8 Zone Polygon System

A `Zone` is a closed polygon with attributes:

| Attribute | Type | Required | Validation |
|---|---|---|---|
| `polygon` | array of [lat, lng] pairs | yes | Min 4 points; first = last (closed); no self-intersection (DB-level check via `ST_IsValid`) |
| `type` | enum: `regular_only` / `abriyah_enabled` | yes | Only `abriyah_enabled` zones surface in Customer App's Abriyah flow |
| `abriyah_per_km_iqd` | int | required when type=`abriyah_enabled` | > 0; default 1,000 |
| `abriyah_base_fare_iqd` | int | no | ≥ 0; default 0 |
| `allow_women_only` | bool | yes | default `true`; if `false`, the women-only toggle is suppressed in Customer App for this zone |
| `room_max_riders` | int | yes | default 4; range 2–6 |
| `room_max_wait_seconds` | int | yes | default 300; range 60–900 |
| `active` | bool | yes | inactive zones suppress new requests but allow in-flight trips to complete |

**Containment check:** every Abriyah pickup-pin and destination-pin placement queries `ST_Contains(zone.polygon, pin_point)` at the database level. Non-PostGIS deployments do not work.

### 4.9 Cross-Surface Boundary Rules

Beep is a single backend with three client surfaces. Cross-surface contracts:

| Contract Type | Mechanism | Example |
|---|---|---|
| State change broadcast | Event Bus publish + subscribe | Captain App accepts trip → `beep.trip.accepted` → Customer App push + Admin Dashboard live-map row update |
| Direct API read | REST/GraphQL | Admin Dashboard reads `Captain` details on Captain Detail page |
| Direct API write | REST/GraphQL | Admin Dashboard Approve Captain → writes `Captain.status = approved` + emits `beep.captain.approved` |
| Push notification | FCM (Firebase Cloud Messaging) | `beep.trip.accepted` event triggers push to the relevant Customer App device |
| Real-time stream | WebSocket / Firebase RTDB | Captain App trip-stream subscription; Room state broadcast |

**Direct DB access across surfaces is forbidden** — all reads/writes go through the API layer.

### 4.10 Captain Approval Pattern

One internal workflow registered: **Captain Registration Approval** (single-step admin review on signup). Unlike P&S's multi-step chains (Creator → PM → Admin), Beep's approval is single-step (Admin only) reflecting the operational model.

**Inline UX:** State-driven Action Bar + Status Badge on Captain Detail (Admin Dashboard) per `TORCH_Details_Page_Standard.md`. Captain App shows a "Pending Approval" screen until decision pushed.

### 4.11 Daily Activation Gating Pattern

Beep introduces a TORCH-novel pattern: a **daily session gate** orthogonal to entity state. An approved Captain cannot go Online without a same-day `CaptainDailyActivation` record. The record carries:

| Field | Value at v1 | Value at v2 |
|---|---|---|
| `status` | `pending` (default — recorded only, no collection) | `paid` (after wallet/card charge succeeds) / `failed` / `waived` |
| `fee_amount_iqd` | 2,000 (configurable in Setup) | same |
| `collected_at` | null (v1) | timestamp of successful charge (v2) |

The Online toggle in the Captain App reads `getCaptainDailyActivation(captain_id, today)` on every session start. Returns null → Captain App shows "Activate Today" CTA → on confirm, creates the record (status `pending` at v1; status `paid` after charge at v2) → Online toggle enabled.

### 4.12 Trip Attribution Model — Per-Rider Fare Independence

A core Abriyah rule: **fares are not split or shared between riders.** Each rider in a 4-rider Abriyah trip pays their own independent fare based on their own pickup→drop-off distance × the zone's per-km rate.

| Rider | Pickup→Drop-off Distance | Zone Rate | Fare |
|---|---|---|---|
| A | 3 km | 1,000 IQD/km | 3,000 IQD |
| B | 7 km | 1,000 IQD/km | 7,000 IQD |
| C | 10 km | 1,000 IQD/km | 10,000 IQD |
| D | 4 km | 1,000 IQD/km | 4,000 IQD |
| **Trip total to captain** | — | — | **24,000 IQD** (sum, minus platform fee — default 0% at v1) |

Each rider pays their own fare in cash separately on drop-off. The Trip entity carries a `fare_per_rider_iqd: [{rider_id, amount}]` array — not a single `fare_total` — to make this contract explicit at the data layer.

### 4.13 Women-Only Eligibility Pattern

Beep's only gender-gated feature surfaces in three places, all controlled by the same predicate `(user.gender == 'female' OR captain.gender == 'female')`:

| Surface | Predicate Check | Behavior |
|---|---|---|
| Customer App Abriyah booking — women-only toggle | `user.gender == 'female'` | Toggle visible only when user gender is female; if unset, app prompts to confirm gender first |
| Customer App room joining — women-only room | `user.gender == 'female'` (re-checked at join time) | Male rider with female gender on file flagged for review; women-only room flat-rejects non-female riders |
| Captain App trip queue — women-only room visibility | `captain.gender == 'female'` (set at registration, locked) | Male captains do not see women-only rooms in the queue feed |

Gender is **self-declared** at v1. ID-verified gender is a Horizon 1 candidate (see §11).

### 4.14 Cancellation Pattern

Cancellation is allowed before captain pickup. Three actors can cancel:

| Actor | Allowed When | Effect |
|---|---|---|
| Rider | Trip status ∈ {REQUESTED, MATCHED, ACCEPTED} | Trip → CANCELLED; if MATCHED in a Room, room slot reopens for new joiners (if room still OPEN); push to captain (if any) |
| Captain | Trip status ∈ {ACCEPTED} | Trip → CANCELLED; rebroadcast to other captains (Regular) or room reopens (Abriyah) |
| System | Room timeout (`room_max_wait_seconds` exceeded) — Trip → CANCELLED with reason `room_expired` | All matched riders' trips cancelled; pushed to all |

**No cancellation penalty at v1** (deferred to v2 with Online Payments). Cancellation reason captured as enum + optional free-text comment.

### 4.15 Mobile Client Surface Standard

For Customer App and Captain App. Per Charter §3.4, these are platform clients, not L1 modules. Conventions:

- **Navigation:** native gesture (back swipe on iOS; back button on Android) — no sidebar / tabs
- **Screen flow specs** replace list-page specs — flows defined as: Trigger → Screens → State transitions → Push events emitted
- **Offline behavior:** Captain App queues location pings + last-action commits when offline; flushes on reconnect. Customer App caches last trip detail for offline view.
- **Push-notification-driven state updates:** every Event Bus event published by the backend that affects a mobile user triggers a corresponding FCM push
- **Authentication:** Phone OTP via Iraqi SMS gateway; session refresh via secure token rotation

---

## Section 5: Platform Service Integration

### 5.1 Automation Engine Integration

**Approval Workflow Templates** (Beep registers 1; admin operations app configures lifecycle):

| Entity | Trigger | Default Chain | Conditions | Configurable | Threshold |
|---|---|---|---|---|---|
| Captain (registration) | status = PENDING on signup | Single step — Admin only | always-on | yes | N/A |

**Process Automation Rules:**

| Rule | Trigger | Effect |
|---|---|---|
| Room auto-dispatch on full | Room reaches `room_max_riders` riders | Room → DISPATCHED; broadcast trip to all riders' apps |
| Room auto-expire on timeout | Room age > `room_max_wait_seconds` with no captain accept | Room → EXPIRED; all matched riders' trips → CANCELLED with reason `room_expired` |
| Daily activation reset | 00:00 org-timezone (Asia/Baghdad) | Yesterday's `CaptainDailyActivation` rows untouched; new day requires new Activate Today |
| Idle online captain timeout | Captain marked online but no location ping for 5 min | Captain → offline; admin alert if captain was assigned to active trip |

**Inline UX:** State-driven Action Bar + Status Badge on Captain Detail per `TORCH_Details_Page_Standard.md`.

**Approval Chain Auto-Escalation:** Single-step admin approval — no chain. If the single admin is unavailable, registration sits in Pending Approval queue with backlog alert on Dashboard → Needs Action.

### 5.2 Document Center Integration

**Document Link Types** (3 — uploaded at captain registration):

| Link Type | Source Entity | Allowed Formats | Protection |
|-----------|--------------|-----------------|-----------|
| `driver_license` | Captain | JPG, PNG, PDF | CONFIDENTIAL |
| `car_registration` | Captain | JPG, PNG, PDF | CONFIDENTIAL |
| `captain_selfie` | Captain | JPG, PNG | INTERNAL |

**Printout Templates** (1 — v1): Trip Receipt (cash-payment record for rider on request).

**Fallback (Document Center not installed):** Captain registration uses platform's basic upload — documents stored as URLs in `Captain.documents[]` JSONB.

### 5.3 AI Orchestrator Integration

**Sub-Agent ID:** `beep.agent`

**Behavior summary:** Stub at v1 — registered with no active capabilities. The ✨ panel is hidden across the Admin Dashboard. Forward-compatible registration ensures Horizon 2 AI features can ship without re-architecture.

**Capability headline table** (mirrors Sub-Agent PRD §2.1):

| Capability | Scope (headline) | Source of truth |
|---|---|---|
| QUERY | *(none active at v1 — Horizon 2)* | Sub-Agent PRD §2 |
| CREATE | *(none active at v1 — Horizon 2)* | Sub-Agent PRD §2 |
| UPDATE | *(none active at v1 — Horizon 2)* | Sub-Agent PRD §2 |
| EXECUTE | *(none active at v1 — Horizon 2)* | Sub-Agent PRD §2 |

**Sub-Agent PRD pointer:** `Beep_Sub_Agent_PRD_V1.0.0.md` (Stub).

**Integrity rule:** The capability headline table above must exactly match Sub-Agent PRD §2.1 row headers.

### 5.4 Search Command Center Integration

| Registration Type | Count | Notes |
|-------------------|-------|-------|
| **Navigation Entries** | 14 | Bilingual labels (EN + AR), keyword-rich, role-gated (super-admin / operator / finance). Full table maintained in each Module PRD's § Search Command Center Registration. |
| **Action Entries** | 3 | Create Zone · Approve Captain (search by captain phone) · Block Customer — open as right drawers. |
| **Searchable Entities** | 5 | Trip (by id, phone, zone) · Captain (by phone, plate, name) · Customer (by phone, name) · Zone (by name) · Room (by id) |

**Focus Mode:** When ⌘+K opens inside Beep Admin, results are grouped under a "Beep (X results)" section header with bolder font and Beep icon, separator labeled "Other Apps" below.

**Registration timing:** On app activation; refreshed on app updates.

**Critical rule:** Beep does NOT register its own ⌘+K / Ctrl+K handler. The OS chrome owns this shortcut globally.

### 5.5 Business OS Services

#### 5.5.1 Event Bus — Published Events

| Event | Trigger | Payload Fields |
|-------|---------|---------------|
| `beep.trip.requested` | Trip record created (Regular OR Abriyah) | `id, type, rider_id, room_id?, zone_id?, pickup, destination, fare_estimate_iqd, created_at` |
| `beep.trip.accepted` | Trip status → ACCEPTED | `id, type, captain_id, rider_ids[], pickup_points, dropoff_points, fare_per_rider_iqd[], accepted_at` |
| `beep.trip.started` | Trip status → IN_PROGRESS (first pickup) | `id, captain_id, started_at` |
| `beep.trip.completed` | Trip status → COMPLETED (last drop-off) | `id, captain_id, rider_ids[], fare_per_rider_iqd[], distance_per_rider_km[], completed_at` |
| `beep.trip.cancelled` | Trip status → CANCELLED | `id, cancelled_by (rider / captain / system), reason, cancelled_at` |
| `beep.trip.rated` | Rating row written | `trip_id, by_user_id, stars, comment, rated_at` |
| `beep.room.opened` | New OPEN Room created | `id, zone_id, room_type (mixed / women_only), first_rider_id, opened_at, expires_at` |
| `beep.room.joined` | Rider added to existing OPEN Room | `room_id, rider_id, current_rider_count, joined_at` |
| `beep.room.locked` | Captain accepts partial room | `room_id, captain_id, rider_count_at_lock, locked_at` |
| `beep.room.dispatched` | Room → DISPATCHED (full or via captain accept) | `room_id, captain_id, trip_id, rider_count, dispatched_at` |
| `beep.room.expired` | Room → EXPIRED (timeout) | `room_id, zone_id, rider_count_at_expiry, expired_at` |
| `beep.captain.registered` | Captain submits registration | `id, phone, gender, registered_at` |
| `beep.captain.approved` | Admin Approves Captain | `id, approved_by (admin_id), approved_at` |
| `beep.captain.rejected` | Admin Rejects Captain | `id, rejected_by, reason, rejected_at` |
| `beep.captain.blocked` | Admin Blocks Captain | `id, blocked_by, reason, blocked_at` |
| `beep.captain.activated_today` | Captain confirms Activate Today | `captain_id, date, fee_amount_iqd, status (pending at v1; paid at v2), activated_at` |
| `beep.zone.created` | Admin creates new Zone | `id, name, city, type, abriyah_per_km_iqd?, created_by, created_at` |
| `beep.zone.updated` | Zone attributes modified | `id, changedFields[], updated_by, updated_at` |
| `beep.zone.archived` | Zone soft-deleted (active=false) | `id, archived_by, archived_at` |

#### 5.5.2 Event Bus — Consumed Events

| Event | Source App | Handler in Beep |
|---|---|---|
| `org.user.role_changed` | Business OS Core | Refresh admin role on Admin Dashboard; revoke active admin session if role → finance-read-only mid-edit |
| `org.timezone.changed` | Business OS Core | Reset daily activation cron schedule (very rare — Baghdad is Asia/Baghdad locked) |

#### 5.5.3 Notification Center Registrations

8 notification types registered at v1:

| Type | Audience | Trigger | Channel |
|---|---|---|---|
| Trip accepted | Rider | `beep.trip.accepted` | Push (FCM) |
| Captain arriving | Rider | Captain marks "Arrived at pickup" | Push |
| Trip completed | Rider | `beep.trip.completed` | Push |
| Trip cancelled | Rider OR Captain | `beep.trip.cancelled` (opposite party) | Push |
| Room dispatched | Riders in room | `beep.room.dispatched` | Push |
| Room expired | Riders in room | `beep.room.expired` | Push |
| Captain approved / rejected | Captain | `beep.captain.approved` / `beep.captain.rejected` | Push |
| New trip in queue | Captain | New trip broadcast to captain | Push |

#### 5.5.4 Audit Trail

Beep writes to the org-wide AuditLog on every: state transition on Trip / Room / Captain / Zone · admin login · Approve/Reject/Block action · zone pricing edit · settings change. Retention 7 years per Setup → General Settings.

### 5.6 Import Engine Integration

#### 5.6.1 Specs Registered

Beep registers **2 Import Specs** at v1 (small surface — most data is created via UI):

| Spec ID | Entity | Version | Required Columns | Optional Columns | Cross-App Resolution | Dedupe Key (scope) | Per-Row Validators | Post-Commit Behavior |
|---------|--------|---------|------------------|------------------|---------------------|-------------------|-------------------|---------------------|
| `beep.zone` | Zone | v1 | name, city, polygon (WKT format), type | abriyah_per_km_iqd, abriyah_base_fare_iqd, allow_women_only, room_max_riders, room_max_wait_seconds, active | — | name (scope: city) | polygon valid (ST_IsValid), no self-intersection; type ∈ {regular_only, abriyah_enabled}; per_km required when type=abriyah_enabled | Active immediately; emit `beep.zone.created` per row |
| `beep.captain_bulk` | Captain | v1 | phone, name, gender, car_make, car_model, car_plate | car_color, national_id | — | phone (scope: global) | phone format valid; gender ∈ {m, f}; plate unique | Status PENDING (still requires admin approval per row); documents must be uploaded post-import via Captain Detail before approval can complete |

**Why so few:** Beep's master data (zones, captains) is created by operators via the Admin UI in low volume. Trips are runtime entities, not seed data. Customers self-register via mobile.

#### 5.6.2 App Entry Points

| Entry Point | Location | Default Spec |
|-------------|----------|--------------|
| Setup wizard (first-run onboarding) | App activation flow | `beep.zone` (seed initial Baghdad zones) |
| Zones list toolbar `[Import]` | Admin → Zones | `beep.zone` |
| Captains → All Captains list toolbar `[Import]` | Admin → Captains | `beep.captain_bulk` |

#### 5.6.3 Post-Commit Consumers

| Spec ID | On Commit | Events Published | Downstream Apps Notified |
|---------|-----------|------------------|-------------------------|
| `beep.zone` | Active immediately | `beep.zone.created` per row | Customer App (zone polygon cache refresh) |
| `beep.captain_bulk` | PENDING status | `beep.captain.registered` per row | Admin Dashboard (Pending Approval queue refresh) |

#### 5.6.4 Migration Dependencies

| Step | Spec(s) | Depends On | Blocking Validators |
|------|---------|------------|---------------------|
| 1 — Foundation | `org_setup.city` (consumed from Business OS Core) | — | Org Setup app installed |
| 2 — Operations Foundation | `beep.zone` | Step 1 | City exists in Org Setup |
| 3 — Captains | `beep.captain_bulk` | Step 1 | — |

---

## Section 6: Data Model

Beep owns **9 entities**.

**Cross-references:** Entity naming, code patterns, ownership scope, audit fields, and state machine conventions follow `torch-design-principles.md §7`.

### 6.1 Trip (Master Entity)

| Property | Value |
|----------|-------|
| Code Pattern | `TRIP-{SEQ}` |
| Ownership Scope | Organization (single-tenant Beep at v1) |
| Security Classification | Role-based — Admin · Operator · Finance (read-only) · Rider/Captain (own-records only) |

**Key fields:** `id (UUID), organization_id, type (enum: REGULAR / ABRIYAH), status (enum per §4.3), rider_ids[] (1 for REGULAR; 1–4 for ABRIYAH), captain_id (FK Captain, nullable until accepted), room_id (FK Room, nullable; required for ABRIYAH), zone_id (FK Zone, nullable; required for ABRIYAH), pickup_points[] (array of {lat, lng, rider_id}), dropoff_points[] (array of {lat, lng, rider_id}), fare_per_rider_iqd[] (array of {rider_id, amount}), distance_per_rider_km[] (array of {rider_id, km}), base_fare_iqd, currency (IQD locked at v1), cancelled_by (enum: rider/captain/system, nullable), cancel_reason (enum + free-text, nullable), requested_at, accepted_at, started_at, completed_at, cancelled_at, version`

**State Machine:** See §4.3.

**Relationships:** belongs_to Captain (when accepted) · belongs_to Room (Abriyah only) · belongs_to Zone (Abriyah only) · has_many Rating · references User (riders[])

### 6.2 Room

Transient matching object for Abriyah trips. Scoped to a single zone + single room_type.

**Key fields:** `id, zone_id (FK Zone), room_type (enum: mixed / women_only), rider_ids[] (1–4), status (enum per §4.4), captain_id (nullable; set when LOCKED or DISPATCHED), trip_id (nullable; set when DISPATCHED), opened_at, expires_at, locked_at, dispatched_at, expired_at, version`

**State Machine:** See §4.4.

**Relationships:** belongs_to Zone · has_many User (via rider_ids[]) · has_one Trip (when dispatched)

### 6.3 Zone

| Property | Value |
|---|---|
| Code Pattern | none (UUID only) |
| Ownership Scope | Organization (city-segmented via `city` field) |
| Security Classification | Admin / Operator CRUD; Finance read-only |

**Key fields:** `id, organization_id, name, name_ar, city, polygon (PostGIS geometry), type (enum: regular_only / abriyah_enabled), abriyah_per_km_iqd (int, nullable), abriyah_base_fare_iqd (int, default 0), allow_women_only (bool, default true), room_max_riders (int, default 4), room_max_wait_seconds (int, default 300), active (bool, default true), created_by, created_at, updated_by, updated_at, version`

**State:** Active or Archived (soft-delete via `active=false`; preserves trip history; archived zones do not appear in new request flows but in-flight trips complete normally).

**Relationships:** has_many Trip · has_many Room · belongs_to City (Org Setup)

### 6.4 Captain

| Property | Value |
|---|---|
| Code Pattern | none (UUID + phone as natural key) |
| Ownership Scope | Organization (global phone uniqueness) |
| Security Classification | Admin / Operator CRUD; Finance read-only; Captain reads own record only |

**Key fields:** `id, phone (unique global), name, name_ar, gender (enum: m / f — required; locked once registered), national_id, car_make, car_model, car_color, car_plate (unique), documents (JSONB array of {type, url, uploaded_at}), status (enum per §4.5), approved_by (FK admin), approved_at, rejected_reason, blocked_reason, registered_at, version`

**State Machine:** See §4.5.

**Relationships:** has_many Trip · has_many CaptainDailyActivation · has_many Rating (received) · has_many Document (via documents JSONB)

### 6.5 User (Rider / Customer)

| Property | Value |
|---|---|
| Code Pattern | none (UUID + phone as natural key) |
| Ownership Scope | Organization (global phone uniqueness) |
| Security Classification | Admin / Operator read; Customer reads own record; cross-rider read forbidden |

**Key fields:** `id, phone (unique), name, name_ar, gender (enum: m / f / unset — default unset; required to use women-only Abriyah), photo_url, blocked (bool, default false), blocked_reason, created_at, updated_at, version`

**State:** Active or Blocked (admin-initiated soft-block; blocked users cannot request trips but trip history preserved).

**Relationships:** has_many Trip (as rider) · has_many Rating (given + received) · referenced by Room.rider_ids[]

### 6.6 CaptainDailyActivation

| Key fields | `id, captain_id (FK Captain), date (date), fee_amount_iqd (int, default 2000), status (enum: pending / paid / waived — v1 default pending; v2 paid after charge), collected_at (nullable — v2 only), waived_by (nullable admin id), waived_reason` |
|---|---|

**Unique constraint:** `(captain_id, date)` — one row per captain per day.

**Lifecycle:** Created when captain taps "Activate Today" in Captain App. Status `pending` until v2 (Online Payments) flips it to `paid` post-charge. Admin can set status to `waived` manually for accounting.

### 6.7 Rating

| Key fields | `id, trip_id (FK Trip), by_user_id (FK User or Captain), of_user_id (FK User or Captain), stars (1–5), comment (text, optional), created_at` |
|---|---|

**Rules:** Two ratings emitted per trip (rider→captain, captain→rider — except for Abriyah where each rider rates the captain independently). 1-week edit window then locked.

### 6.8 AuditLog

| Key fields | `id, organization_id, entity_type (enum: Trip / Room / Zone / Captain / User / Setting), entity_id, action, actor_id, actor_role, before_values, after_values, ip_address, timestamp` |
|---|---|

Retention 7 years. Append-only.

### 6.9 NotificationLog

| Key fields | `id, recipient_type (enum: User / Captain / Admin), recipient_id, notification_type, payload (JSONB), channel (push / sms), status (sent / failed / queued), sent_at, delivered_at` |
|---|---|

Retention 90 days. Used for debugging push-delivery failures.

### Cross-App Entity References

| Entity | Owner App | Used By | Why Not Owned Here |
|---|---|---|---|
| `City` | Org Setup (Business OS Core) | Zone (FK), Trip (FK via Zone), Admin role scoping | City master is org-wide; Beep is one of many city-scoped apps |
| `Admin User` | Auth Microservice (Business OS Core) | Captain.approved_by, AuditLog.actor_id, Zone.created_by | Auth + role management is platform-level, not Beep-specific |
| `Currency` | Org Setup (Business OS Core) | Trip.currency (IQD locked at v1) | Org Setup owns currency master |
| `Timezone` | Org Setup (Business OS Core) | Daily activation reset cron | Org Setup owns timezone master |

### Entity Relationship Map

```
                  ┌───────────┐       ┌───────────┐
                  │   User    │       │ Captain   │
                  │ (Rider)   │       │           │
                  └─────┬─────┘       └─────┬─────┘
                        │                   │
              ┌─────────┘                   └─────────┐
              │                                       │
              │  has_many                  has_many   │
              ▼                                       ▼
        ┌──────────────┐ rider_ids[]    ┌─────────────────────────┐
        │     Room     │◄───────────────│         Trip            │
        │  (Abriyah    │ has_one (DISP) │  (REGULAR or ABRIYAH)   │
        │   transient) │───────────────►│                         │
        └──────┬───────┘                └────────┬────────────────┘
               │                                 │
               │ belongs_to             belongs_to │ (Abriyah only)
               ▼                                 ▼
        ┌──────────────┐                  ┌──────────────┐
        │     Zone     │◄─────────────────┤     Zone     │
        │  (polygon)   │                  └──────────────┘
        └──────┬───────┘
               │
               │ belongs_to
               ▼
        ┌──────────────┐   [external — Org Setup]
        │     City     │
        └──────────────┘

        ┌──────────────────────────┐
        │ CaptainDailyActivation   │  ← orthogonal to Captain.status
        │   (captain_id, date)     │     — required to go online
        └──────────────────────────┘
                  │
                  │ belongs_to
                  ▼
              Captain

        ┌──────────────┐
        │    Rating    │
        └──────────────┘
                  │
                  │ belongs_to
                  ▼
              Trip
```

---

## Section 7: Module Specifications — NOT IN THE CHARTER

Module-level page, form, and action specifications live in Module PRDs:

**Admin Dashboard Modules (L1 sidebar):**
- `Beep_Module_Dashboard_PRD_V1.0.0.md`
- `Beep_Module_Operations_PRD_V1.0.0.md`
- `Beep_Module_Zones_PRD_V1.0.0.md`
- `Beep_Module_Captains_PRD_V1.0.0.md`
- `Beep_Module_Customers_PRD_V1.0.0.md`
- `Beep_Module_Reports_PRD_V1.0.0.md` *(Stub at M1 → Active at M2)*
- `Beep_Module_Setup_PRD_V1.0.0.md`

**Mobile Client Surfaces (per Charter §3.4):**
- `Beep_Module_Customer_App_PRD_V1.0.0.md`
- `Beep_Module_Captain_App_PRD_V1.0.0.md`

Each Module PRD references this Charter for entities (§6), events (§5.5), navigation (§3), patterns (§4), and cross-surface contracts (§4.9) — never redefines them.

---

## Section 8: Cross-Module Business Logic

### 8.1 Workflow: Abriyah Room Matching Engine

| Property | Description |
|---|---|
| **Trigger** | Customer App user taps "Join Room" on an Abriyah booking |
| **Modules Involved** | Customer App (origin) → Backend Room Service → Captain App (when dispatched) → Admin Operations (live update) |
| **Frequency** | Per-rider request; high-volume in covered zones |

**Step Sequence:**

```
Step 1: Validate request — pickup + destination both inside Zone.polygon
        (PostGIS ST_Contains on both points)
      ↓
Step 2: Compute per-rider fare = distance(pickup, dropoff) × zone.abriyah_per_km_iqd
        + zone.abriyah_base_fare_iqd
        (distance = routing engine; haversine fallback if routing unavailable)
      ↓
Step 3: Find open Room — first match on (zone_id, room_type, status=OPEN,
        rider_count < zone.room_max_riders, expires_at > now)
        Order by oldest opened_at (first-come-first-fill)
      ↓
Step 4: If found → JOIN: add rider to room.rider_ids[], emit `beep.room.joined`
        If not found → CREATE: new Room (OPEN, expires_at = now + zone.room_max_wait_seconds),
                       emit `beep.room.opened`
      ↓
Step 5: Trip record created (status=MATCHED, room_id set), emit `beep.trip.requested`
      ↓
Step 6: Push to Customer App: room status + waiting countdown
      ↓
Step 7: Captain App broadcast: room visible in trip queue
        (women-only filter applied: female captains only)
      ↓
Step 8a: Auto-dispatch trigger A — room.rider_count == zone.room_max_riders:
         Room → DISPATCHED, all trips → ACCEPTED with same captain_id (set when captain accepts)
      ↓
Step 8b: Auto-dispatch trigger B — captain accepts partial room:
         Room → LOCKED, captain_id set, no new joiners allowed → DISPATCHED on confirm
      ↓
Step 8c: Auto-expire — Room age > expires_at:
         Room → EXPIRED, all trips → CANCELLED (reason: room_expired), riders notified
```

**Business Rules:**

- First-come-first-fill — riders join the oldest matching OPEN room
- A rider can be in only **one** OPEN or LOCKED room at a time (cancelling exits + reopens slot)
- Once a room is LOCKED, new joiners are blocked (room is "captain-claimed")
- Women-only room visibility: only `Captain.gender == 'female'` captains see women-only rooms
- Cancellation in OPEN room → slot reopens, room continues; in LOCKED room → slot reopens but captain is already committed (admin alert if captain has driven >1 km)

**Error Handling:** Pickup or destination outside zone → caller sees "عبريه غير متوفرة في هذه المنطقة" (Abriyah not available in this area) — no room created. Distance computation failure → fall back to haversine; flag admin via Needs Action queue.

**Cross-Surface Handoffs:** All driven by Event Bus + push notifications per §4.9 + §5.5.3.

### 8.2 Workflow: Captain Daily Activation Gate

| Property | Description |
|---|---|
| **Trigger** | Captain app session start (or first online toggle of day) |
| **Modules Involved** | Captain App → Backend Captain Service → Admin Captains module (Daily Activation Log refresh) |
| **Frequency** | Once per captain per day |

**Step Sequence:**

```
Step 1: Captain App opens (or taps Online toggle) — backend resolves:
        getCaptainDailyActivation(captain_id, today)
      ↓
Step 2: If row exists with status ∈ {paid, waived} → Online toggle enabled
        If row exists with status = pending (v1 norm) → Online toggle enabled
            (v1: pending is accepted; v2: pending blocks until charge)
        If no row → show "Activate Today" CTA
      ↓
Step 3: User taps "Activate Today" → create CaptainDailyActivation row
        with status = pending (v1) / charge attempt (v2)
      ↓
Step 4: v1: row created, status=pending, emit `beep.captain.activated_today` →
        Online toggle enabled
      ↓
Step 4: v2: wallet/card charge attempt:
        - Success → status=paid → enable toggle, emit event
        - Failure → status=failed → keep CTA visible with error
      ↓
Step 5: Captain may now go Online → Trip Queue subscription opens
```

**Business Rules:**

- Date is in **Asia/Baghdad timezone**; daily rollover at 00:00 local
- Multiple sessions same day reuse the existing row (no duplicate fee)
- Admin can `waive` a captain's daily fee retroactively from Captain Detail → Daily Activation tab
- v1: failure mode is "fee recorded but uncollected" — finance reports show accrued pending fees

**Error Handling:** Captain offline at midnight rollover with active trip → trip completes normally; new day starts with fresh activation requirement.

### 8.3 Workflow: Trip Cancellation Cascade

| Property | Description |
|---|---|
| **Trigger** | Any actor (rider / captain / system) initiates trip cancellation |
| **Modules Involved** | Source App → Backend Trip Service → Other affected apps via Event Bus |

**Step Sequence:**

```
Step 1: Validate cancellation legal per §4.14 (status check)
      ↓
Step 2: Update Trip.status = CANCELLED, set cancelled_by, cancel_reason
      ↓
Step 3: Branch by trip type + status at cancel:
        - REGULAR, status=REQUESTED → rebroadcast to other captains? (No at v1 —
          re-request required); rider notified.
        - REGULAR, status=ACCEPTED, rider cancels → captain notified;
          captain rebroadcast eligible? (No at v1 — captain returns to queue)
        - ABRIYAH, status=MATCHED, rider cancels → exit room.rider_ids[],
          if room still OPEN → slot reopens; if LOCKED → captain notified +
          admin alert if captain >1km en route
        - ABRIYAH, status=ACCEPTED (room DISPATCHED), one rider cancels →
          captain notified of reduced rider count; captain proceeds with remaining
        - Any, status=ACCEPTED+ system timeout → trip + room cancelled
      ↓
Step 4: Emit `beep.trip.cancelled` (+ `beep.room.expired` if system room timeout)
      ↓
Step 5: Push notifications fan out per §5.5.3
      ↓
Step 6: AuditLog row written
```

**Business Rules:**

- Cancellation reason captured as enum (`changed_mind` / `wait_too_long` / `wrong_pickup` / `captain_late` / `safety` / `system_timeout` / `other`) + optional free-text comment
- No cancellation penalty at v1 (deferred to v2 with Online Payments)
- Cancellation count per user / captain visible on respective Detail pages for ops review

### 8.4 Workflow: Zone Pricing Update Propagation

| Property | Description |
|---|---|
| **Trigger** | Admin edits `abriyah_per_km_iqd` or `abriyah_base_fare_iqd` on a Zone |
| **Modules Involved** | Admin Dashboard (Zone Detail edit) → Backend Zone Service → Customer App (cache invalidation) |

**Step Sequence:**

```
Step 1: Admin saves edit on Zone Detail → Pricing tab
      ↓
Step 2: Backend writes Zone update, emit `beep.zone.updated`
      ↓
Step 3: Customer App receives push to invalidate zone-pricing cache
        Next Abriyah booking in this zone shows new rate
      ↓
Step 4: In-flight trips already accepted: NOT affected — fare locked at trip request time
      ↓
Step 5: Audit row + admin notification banner: "Pricing for Zone X updated.
        N in-flight trips locked at old rate."
```

**Business Rules:**

- Pricing changes never retroactively affect in-flight trips
- Admin must have `super-admin` or `operator` role to edit pricing
- All pricing edits logged to AuditLog with `before_values` / `after_values`

---

## Section 9: Multi-Branch & Multi-Entity Support

### 9.1 Entity Scope Matrix

| Entity | Ownership Scope | City Visibility |
|---|---|---|
| Trip | Organization | Implicit via Zone.city; Admin Dashboard filtered by admin's city |
| Room | Organization | Implicit via Zone.city |
| Zone | Organization | Explicitly carries `city` field |
| Captain | Organization | Captains operate in any city where they have approved registration |
| User | Organization | Riders can book trips in any city (Trip carries the resolved Zone+City) |
| CaptainDailyActivation | Organization | — |

### 9.2 Cross-City Behavior

At v1 Beep is single-city (Baghdad). Multi-city operations is deferred to v2 expansion phase.

When multi-city ships:
- Captains register at one home city; can opt into adjacent cities via admin assignment
- Riders can book in any city they're physically in (GPS detects)
- Pricing remains per-zone (zones are city-scoped)
- Admin Dashboard adds city filter at the top of every list page

### 9.3 City Setup

Cities are managed in Org Setup (cross-app entity reference per §6). Beep references but does not own.

---

## Section 10: System Features

### 10.1 Search & Filtering

Admin Dashboard search via Search Command Center per §5.4. Per-page filtering via Filter Bar pattern. Mobile clients have minimal search (Customer App: search by destination address; Captain App: no search at v1).

### 10.2 Export

| Format | Pages Supported | Source |
|---|---|---|
| CSV | All Admin Dashboard list pages | Native |
| Excel | All Admin Dashboard list pages | Native |
| PDF | Trip Reports (via Trip Receipt printout template) | Document Center Printout Service |

### 10.3 Printing

Trip Receipt printout via Document Center for cash-payment record on rider request.

### 10.4 Audit Trail

Per §5.5.4. Default retention 7 years.

### 10.5 Multi-Currency Support

**IQD-only at v1.** Multi-currency deferred to v2 expansion phase. Trip.currency field exists with IQD locked default.

### 10.6 Localization Framework

Bilingual (EN + AR) on Admin Dashboard. **Arabic-primary, RTL** on Customer App and Captain App. Country Localization Pack consumed from Org Setup. Iraqi-Arabic copy polish scheduled for v1.1.

### 10.7 Accessibility

WCAG 2.1 AA target on Admin Dashboard. Mobile clients: native platform accessibility APIs (TalkBack on Android, VoiceOver on iOS).

---

## Section 11: Future Enhancements

### Horizon 1 — Next Minor Version (v1.1 / v2.0 — well-defined, likely soon)

- **Online Payments add-on (v2):** wallet + card for trip fares, real collection of 2,000 IQD daily activation fee, masked phone numbers between rider and captain
- **Promo codes + referral program (v1.1)**
- **Multi-stop regular trips (v2)**
- **Scheduled trips (v2)**
- **ID-verified gender for women-only mode (v2)** — current self-declared model carries minor abuse risk
- **Real fee collection mechanism decision (Open Decision §11):** online wallet / card vs cash-to-Beep-agent
- **Captain incentive for filled Abriyah rooms (v2):** bonus per 4-rider room or commission split
- **Multi-city expansion (v2):** add Erbil, Basra, Mosul

### Horizon 2 — Next Major Version (requires significant planning)

- **AI features (3 candidates per §4.1):** Fraud Detection · Surge Pricing Suggestions · Captain-Match Optimizer — promotes Sub-Agent PRD from Stub to Full
- **Detailed captain leaderboards / gamification**
- **Real complaint workflow with escalation + refunds**
- **Group chat for Abriyah rooms (4 riders + captain)**

### Horizon 3 — Long-Term Vision (aspirational)

- **Inter-city trips**
- **Beep for Business (corporate accounts)**
- **Beep Delivery (parcel + food sub-vertical sharing the same captain pool)**
- **EV captain incentive program**

### Considered & Rejected

| Item | Why Rejected |
|---|---|
| In-app VoIP voice calls | Iraqi market norm is direct phone + WhatsApp; building VoIP duplicates the user's existing tools and adds latency cost |
| Split-fare Abriyah (one fare divided among riders) | Adds dispute risk; per-rider independent fare per §4.12 is transparent and matches local price-sensitivity expectations |
| Multi-step approval chain for captain registration | Operational overhead with no clear safety gain at v1 scale (Iraq's market is small enough that single-admin review is fast) |
| Captain rating tiers (Bronze/Silver/Gold) | Gamification noise without enough data to justify tiers at v1; consider at Horizon 2 with leaderboards |
| Real-time surge pricing | Politically sensitive in cost-of-living-conscious Iraq market; defer to AI-suggested surge per Horizon 2 |

### Open Decisions Needed (carried from source PRD §15)

1. **Captain fee collection mechanism** — wallet vs card vs cash-to-agent at v2
2. **Distance calculation for Abriyah fare** — routing engine actual distance vs haversine — *Recommend: routing distance for fairness*
3. **Merge close pickups** — if 2 riders are within 100m, pick up together or separately?
4. **Captain incentive structure** — flat bonus vs commission split for filled rooms
5. **Women-only ID verification timing** — v2 default or earlier if abuse signals appear
6. **Female captain recruitment program** — supply-side without it, demand-side struggles
7. **SMS provider final selection** — Asiacell vs Korek vs aggregator
8. **App Store availability** — iOS limited in Iraq; Android-first confirmed?

---

## Section 12: Glossary

| Term | Definition |
|---|---|
| **Abriyah / عبريه** | Beep's zone-based shared-ride product. Up to 4 riders in one trip, all pickups + drop-offs inside the same zone, per-rider distance-based fare, optional women-only mode |
| **Zone** | Admin-defined polygon on the map; `regular_only` or `abriyah_enabled` |
| **Room** | Transient match of 1–4 Abriyah riders inside one zone awaiting captain dispatch. Either `mixed` or `women_only` type. Terminal states: DISPATCHED or EXPIRED |
| **Daily Activation Fee** | 2,000 IQD that a Captain must record each day they want to go online. Static / not collected in v1; real collection ships at v2 with Online Payments |
| **Captain** | Driver (Beep's term, parity with Baly) |
| **Rider / Customer** | Passenger |
| **IQD** | Iraqi Dinar |
| **Trip Type** | Closed enum: REGULAR (1 rider, any pickup/destination) or ABRIYAH (1–4 riders, same-zone constraint, distance-based per-rider fare) |
| **Mixed Room** | Abriyah room open to riders of any gender; default room type |
| **Women-Only Room** | Abriyah room restricted to female riders and female captains; gated by `User.gender == 'female'` predicate |
| **Room Dispatch** | The moment a Room transitions to DISPATCHED — either auto on reaching 4 riders, or on captain manual accept of a partial room |
| **Room Expiry** | The moment a Room transitions to EXPIRED — no captain accepted within `zone.room_max_wait_seconds`. All matched riders' trips are cancelled with reason `room_expired` |
| **Mobile Client Surface** | A platform client (Customer App, Captain App) — flow-driven, not module-driven. Documented per Charter §3.4 + §4.15 |
| **Activate Today** | Captain App action where a captain confirms the daily activation fee for today's date — required gate for the Online toggle |
| **PostGIS** | PostgreSQL spatial extension. Mandatory dependency for Beep — `ST_Contains` is used for zone polygon validation |
| **Live Trips Map** | Admin Operations module page — real-time map of all in-progress trips with WebSocket subscription |
| **Live Rooms** | Admin Operations module page — real-time list (Kanban view) of all open / locked / dispatched / expired Abriyah rooms |
| **Per-Rider Fare Independence** | The Abriyah pricing contract: each rider in a 4-rider Abriyah trip pays their own independent fare based on their own pickup→drop-off distance. Fares are not split or shared between riders (§4.12) |

---

## Appendix A — Full Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Mobile apps | Flutter (Dart) — single codebase | Android-first launch; iOS App Store availability limited in Iraq |
| Backend | Node.js (NestJS) **or** Python (FastAPI) — selected post-team-staffing | Either works; pick based on hire pool |
| Trip + room state real-time | WebSocket (captain trip stream) + Firebase Realtime DB (room state broadcasts) | Hybrid for mobile resilience over 3G |
| Database | **PostgreSQL + PostGIS** | PostGIS mandatory — zone polygon containment via `ST_Contains` |
| Maps & routing | Google Maps SDK | Iraqi market familiarity |
| Push notifications | Firebase Cloud Messaging | Standard for Android+iOS |
| SMS / OTP | Iraqi gateway (Asiacell or Korek partner) | Local-network reliability |
| Admin dashboard | React / Next.js + shadcn/ui | TORCH platform standard |
| Hosting | AWS or DigitalOcean | Iraqi-friendly latency |
| Object storage | S3 (or DO Spaces) | Captain document uploads |

---

**End of Beep App Charter**
