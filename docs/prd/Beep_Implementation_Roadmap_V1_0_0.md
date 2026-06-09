# Beep — Implementation Roadmap V1.0.0

**Document Status:** **APPROVED** (2026-05-19). 3 milestones: M1 Foundation · M2 Core Completeness · M3 Online Payments (v2 add-on). Authored alongside Charter V1.0.0.
**Date:** 2026-05-19
**Approval reference:** Initial sequencing approved as part of base Charter V1.0.0 release.
**Source spec:** `Beep_App_Charter_V1.0.0.md`
**Source structure:** Charter §3 Navigation Tree · §4 Patterns · §5 Platform Services · §6 Entities · §8 Cross-Module Flows
**Sequencing:** Charter skeleton → Roadmap → Module PRDs milestone-by-milestone → Sub-Agent Stub upfront, Full deferred to post-v2 AI milestone

---

## 1. Overview

This Implementation Roadmap defines how Beep is delivered. It maps every Module PRD listed in Charter §0.3 + the Sub-Agent PRD to a milestone, fixes target versions per milestone, and locks acceptance criteria so engineering knows exactly when a milestone is "done."

**Source document:** App Charter V1.0.0 (1 backend · 3 client surfaces · 7 Admin Dashboard L1 modules · 19 list pages · 9 owned entities · 19 published events + 2 consumed · 4 cross-module engines · 1 approval template · 2 Import Specs · 0 active sub-agent capabilities at v1)

**Two invariants the user cannot override during iteration:**
1. Each milestone must produce a **shippable, testable increment**. No milestone may leave Beep broken.
2. The Charter foundation (data model, Event Bus, navigation shell, packaging, App Layout Block adoption on Admin Dashboard) lands entirely in **Milestone 1**.

Everything else — which Module PRD lands in which milestone, the timing of multi-city expansion, whether the Online Payments add-on lands at M3 or later — is open to iteration.

**Status notice:** This document is approved and released to engineering as V1.0.

---

## 2. Milestone Summary Table

| # | Milestone | Scope (proposed) | T-Shirt Size | Dependencies | Acceptance Criteria |
|---|---|---|:--:|---|---|
| **M1** | **Foundation (MVP)** | Charter foundation (all 9 entities + Event Bus 19 events + PostGIS schema + Asia/Baghdad timezone setup) + Admin Dashboard 5 active modules (Dashboard · Operations · Zones · Captains · Customers · Setup) + Customer App (Onboarding · Home · Regular booking · Abriyah booking · Waiting Room · Live Trip · Rate) + Captain App (Onboarding · Approval Pending · Activate Today · Online toggle · Trip Queue · Live Trip · Earnings) + 2-3 Abriyah-enabled zones live in Baghdad + Captain Approval Workflow + Daily Activation gate (static — no collection) + Cash-only fares + Native phone/WhatsApp + In-app chat + 1-5 star rating + Bilingual UI (AR primary, RTL) + 2 Import Specs (`beep.zone`, `beep.captain_bulk`) + 8 Push notification types + Reports module **Stub** + Sub-Agent PRD **Stub** | **L** | None | A rider can book Regular and Abriyah trips end-to-end. Captains can register, get approved by admin within 24h, do daily activation, go online, accept trips (regular + room-based abriyah, mixed + women-only). Cash payment on drop-off works. Admin operates 2-3 Abriyah-enabled zones in Baghdad with per-zone pricing. Abriyah women-only mode works for female-registered riders + female captains. Push notifications delivered reliably. Admin Dashboard Live Trips Map shows real-time trip state. Sub-Agent registered as Stub (no active capabilities). |
| **M2** | **Core Completeness** | Reports module Stub → Active (7 reports across Trip · Captain · Financial categories) · Search Command Center registration (14 nav + 3 action + 5 entity) · Bulk actions on Admin Dashboard (bulk approve captains, bulk archive zones, bulk export trips) · Multi-view toggle persistence per page per user via App Preferences Pattern · Promo codes + referral program (Customer App + Admin) · Iraqi-Arabic copy polish across all surfaces | **M** | M1 | All Core features specified work end-to-end. All 7 reports generate correctly with filter persistence. Bulk actions work on All Captains, Zones, Trips. Search Command Center returns Beep entity results in ⌘+K. Promo codes redeemable on trip request. Multi-view toggle (Table/Kanban on Live Rooms; Inbox on Pending Captains) persists per user. |
| **M3** | **Online Payments Add-on (v2)** | Online Payments add-on activation: wallet + card payment methods for trip fares · Real 2,000 IQD daily activation fee collection (charge at Activate Today; status flips pending → paid on success) · Masked phone numbers between rider and captain (Twilio-style proxy numbers) · Refund + cancellation penalty flows · Financial Reports — Real Revenue activates (replaces "Accrued Fees" with "Collected Fees") · Multi-stop regular trips · Scheduled trips · Multi-city expansion (Erbil, Basra, Mosul) | **L** | M2 | Wallet + card payments work end-to-end for both trip fares and daily activation fees. Masked numbers protect rider/captain privacy. Refunds processable from Admin Dashboard. Multi-city operations live in 4 cities. Scheduled trips bookable up to 7 days ahead. |

**Total milestones:** 3. **Total T-shirt size:** L+M+L. **Critical path:** M1 → M2 → M3 (Online Payments depends on Core Completeness for reporting + bulk-action infrastructure).

**Deferred to Horizon 2 (no milestone yet):** AI features (Fraud Detection · Surge Pricing Suggestions · Captain-Match Optimizer). Sub-Agent PRD promotion Stub → Full happens when this milestone is approved.

---

## 3. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  M1: FOUNDATION (MVP) ◀ Charter foundation lands entirely here          │
│  ├─ Data model (9 entities + 4 cross-app refs)                          │
│  ├─ Event Bus (19 published + 2 consumed registered)                    │
│  ├─ PostGIS schema + ST_Contains zone validation                        │
│  ├─ Asia/Baghdad timezone for daily activation cron                     │
│  ├─ Navigation shell (App Layout Block; 7 Admin sidebar items)          │
│  ├─ Packaging (Core entitlement; Online Payments gate inactive)         │
│  ├─ Admin Dashboard Modules (5 Active, 1 Stub):                         │
│  │   ├─ Dashboard PRD V1.0.0 Active                                     │
│  │   ├─ Operations PRD V1.0.0 Active                                    │
│  │   ├─ Zones PRD V1.0.0 Active                                         │
│  │   ├─ Captains PRD V1.0.0 Active                                      │
│  │   ├─ Customers PRD V1.0.0 Active                                     │
│  │   ├─ Reports PRD V1.0.0 STUB                                         │
│  │   └─ Setup PRD V1.0.0 Active                                         │
│  ├─ Customer App PRD V1.0.0 Active (7 flows)                            │
│  ├─ Captain App PRD V1.0.0 Active (7 flows)                             │
│  ├─ Sub-Agent PRD V1.0.0 STUB (registration contracts only)             │
│  ├─ Captain Approval Workflow (1 template) registered                   │
│  ├─ Daily Activation Gate (static — no collection)                      │
│  ├─ Push Notification Service (8 types via FCM)                         │
│  ├─ SMS/OTP integration (Iraqi gateway)                                 │
│  ├─ Document Center (3 link types, 1 printout template)                 │
│  ├─ Import Engine — 2 Specs (beep.zone, beep.captain_bulk)              │
│  ├─ Real-Time Trip + Room broadcast (WebSocket + Firebase RTDB)         │
│  └─ Bilingual UI (AR primary, RTL) on all 3 surfaces                    │
│      │                                                                   │
│      ▼                                                                   │
│  M2: CORE COMPLETENESS                                                  │
│  ├─ Reports PRD V1.0.0 Stub → Active (7 reports)                        │
│  ├─ Search Command Center registration (14 nav + 3 action + 5 entity)   │
│  ├─ Bulk actions (Captains, Zones, Trips)                               │
│  ├─ Multi-view persistence (Kanban on Live Rooms, Inbox on Pending)     │
│  ├─ Promo codes + referral program                                      │
│  └─ Iraqi-Arabic copy polish                                            │
│      │                                                                   │
│      ▼                                                                   │
│  M3: ONLINE PAYMENTS ADD-ON (v2)                                        │
│  ├─ Wallet + Card payment methods                                       │
│  ├─ Real daily activation fee collection (charge on Activate Today)     │
│  ├─ Masked phone numbers (proxy service)                                │
│  ├─ Refund + cancellation penalty flows                                 │
│  ├─ Financial Reports — Collected Revenue                               │
│  ├─ Multi-stop regular trips                                            │
│  ├─ Scheduled trips                                                     │
│  └─ Multi-city expansion (Erbil, Basra, Mosul)                          │
│                                                                          │
│  ▶ Horizon 2 (no milestone yet): AI Features                            │
│    Sub-Agent PRD V1.0.0 Stub → V1.1.0 Full when approved                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Cumulative Feature Matrix

| Feature | M1 | M2 | M3 |
|---|:--:|:--:|:--:|
| Admin Dashboard → Dashboard (Overview + Needs Action) | ✅ | ✅ | ✅ |
| Admin Dashboard → Operations (Live Trips + Live Rooms) | ✅ | ✅ | ✅ |
| Admin Dashboard → Zones (CRUD + polygon editor + pricing) | ✅ | ✅ | ✅ |
| Admin Dashboard → Captains (Pending + All + Daily Activation Log) | ✅ | ✅ | ✅ |
| Admin Dashboard → Customers (All Customers) | ✅ | ✅ | ✅ |
| Admin Dashboard → Reports (7 reports) | — | ✅ | ✅ |
| Admin Dashboard → Setup (Pricing + Daily Fee + Room + Admin Users + General) | ✅ | ✅ | ✅ |
| Customer App — Regular booking | ✅ | ✅ | ✅ |
| Customer App — Abriyah booking (mixed + women-only) | ✅ | ✅ | ✅ |
| Customer App — Waiting Room + Live Trip + Rate | ✅ | ✅ | ✅ |
| Customer App — In-app chat + native Call + WhatsApp | ✅ | ✅ | ✅ |
| Customer App — Promo codes redemption | — | ✅ | ✅ |
| Customer App — Multi-stop regular trips | — | — | ✅ |
| Customer App — Scheduled trips | — | — | ✅ |
| Captain App — Registration + Approval Pending | ✅ | ✅ | ✅ |
| Captain App — Activate Today (static fee) | ✅ | ✅ | — |
| Captain App — Activate Today (real charge) | — | — | ✅ |
| Captain App — Online toggle + Trip Queue | ✅ | ✅ | ✅ |
| Captain App — Earnings tab | ✅ | ✅ | ✅ |
| Cash payment | ✅ | ✅ | ✅ |
| Wallet + Card payment | — | — | ✅ |
| Masked phone numbers | — | — | ✅ |
| Refunds + cancellation penalty | — | — | ✅ |
| 1 Captain Approval Workflow template | ✅ | ✅ | ✅ |
| Daily Activation Gate (static record) | ✅ | ✅ | — |
| Daily Activation Gate (real collection) | — | — | ✅ |
| Bulk Import — 2 Specs (Zone + Captain) | ✅ | ✅ | ✅ |
| Bulk actions (approve / archive / export) | — | ✅ | ✅ |
| Multi-view toggle persistence | — | ✅ | ✅ |
| Search Command Center registration | — | ✅ | ✅ |
| Sub-Agent (Stub — registration only) | ✅ | ✅ | ✅ |
| Sub-Agent (Full — N capabilities) | — | — | — *(Horizon 2)* |
| 0 AI features (Stub at v1) | ✅ | ✅ | ✅ |
| 3 AI features (Horizon 2) | — | — | — *(no milestone)* |
| Multi-city operations (Baghdad only at M1/M2; 4 cities at M3) | — | — | ✅ |
| Bilingual UI (AR primary, RTL) | ✅ | ✅ | ✅ |

**Stakeholder narrative per milestone:**
- After M1 — "Beep launched in Baghdad. Riders book Regular + Abriyah trips end-to-end. Captains register, get approved, do daily activation, accept trips. Admin runs zones, captains, customers, live ops on the web dashboard."
- After M2 — "Reports work, bulk operations work, search works across the platform. Promo codes drive growth. Iraqi-Arabic copy polished."
- After M3 — "Online Payments live: wallets, cards, real fee collection, masked numbers, refunds. Multi-city — Beep operates in Baghdad + Erbil + Basra + Mosul. Multi-stop and scheduled trips give riders more flexibility."

---

## 5. Milestone Scope Details

### 5.1 Milestone 1 — Foundation (MVP)

**Charter sections fully activated:** §3 Navigation Tree (all 7 Admin modules render — Reports module shows landing-only stub) · §4 Patterns (all patterns in place; §4.1 AI = 0 features active, Sub-Agent Stub) · §5 Platform Services (Captain Approval registered, Document Center 3 link types, Push Notification Center 8 types, Org Setup deps, Import Engine partial — 2 Specs) · §6 Data Model (all 9 entities created in DB; PostGIS polygon column live) · §8 Cross-Module Flows (Abriyah Room Matching · Daily Activation Gate · Cancellation Cascade · Zone Pricing Propagation — all 4 engines active) · §9 Multi-Branch (single-city Baghdad) · §10 System Features (no multi-currency; AR-RTL on mobile)

**Module PRDs included:**

| File | Version | Status | What's specified |
|---|:--:|:--:|---|
| `Beep_Module_Dashboard_PRD_V1.0.0.md` | V1.0.0 | Active | Overview (KPI cards · city map · Activity Highlights) + Needs Action (4-tab admin triage) |
| `Beep_Module_Operations_PRD_V1.0.0.md` | V1.0.0 | Active | Live Trips Map (real-time WebSocket + filter sidebar) + Live Rooms (Kanban by status) |
| `Beep_Module_Zones_PRD_V1.0.0.md` | V1.0.0 | Active | Zones list (Table + Map view) · Zone Creation Wizard (3-step Wide Drawer) · Zone Detail (4 tabs: Overview · Polygon Editor · Pricing · History) |
| `Beep_Module_Captains_PRD_V1.0.0.md` | V1.0.0 | Active | Pending Approval (Table + Inbox) · All Captains (Table) · Daily Activation Log (Table) · Captain Detail (5 tabs: Overview · Documents · Daily Activation History · Trips · History) |
| `Beep_Module_Customers_PRD_V1.0.0.md` | V1.0.0 | Active | All Customers (Table) · Customer Detail (3 tabs: Overview · Trips · History) |
| `Beep_Module_Reports_PRD_V1.0.0.md` | — | **Stub** | Stub: purpose, entities owned, primary persona — no §3/§4 yet (activates at M2) |
| `Beep_Module_Setup_PRD_V1.0.0.md` | V1.0.0 | Active | Operations Foundations (Pricing Defaults · Daily Activation Fee · Room Settings) · Admin Users · General Settings |
| `Beep_Module_Customer_App_PRD_V1.0.0.md` | V1.0.0 | Active | 7 mobile flows: Onboarding · Home · Regular Booking · Abriyah Booking · Waiting Room · Live Trip · Trip Complete & Rate |
| `Beep_Module_Captain_App_PRD_V1.0.0.md` | V1.0.0 | Active | 7 mobile flows: Onboarding · Approval Pending · Activate Today · Online Toggle · Trip Queue · Live Trip · Earnings |
| `Beep_Sub_Agent_PRD_V1.0.0.md` | V1.0.0 | **Stub** | Stub: §0 + §1 Sub-Agent Overview + §2 Capability Matrix (0 active capabilities; forward-compatible registration) |

**Entities included:** All 9 Beep-owned entities created in DB (Trip, Room, Zone, Captain, User, CaptainDailyActivation, Rating, AuditLog, NotificationLog).

**Platform integrations included:**
- Automation Engine: 1 Captain Approval template registered
- Document Center: 3 link types (driver_license, car_registration, captain_selfie) + 1 printout template (Trip Receipt)
- Org Setup: City picker, Timezone (Asia/Baghdad locked), Currency (IQD locked)
- Notification Center: 8 push notification types via FCM
- SMS/OTP: Iraqi gateway integration (provider TBD — Open Decision §11)
- Real-Time: WebSocket (captain trip stream) + Firebase Realtime DB (room state broadcasts)
- Import Engine: 2 Specs (`beep.zone`, `beep.captain_bulk`); `[Import]` toolbar on Zones list + All Captains list

**Operational rollout:**
- 2–3 Abriyah-enabled zones in Baghdad (e.g. Al-Karada, Al-Mansour, Al-Kadhimiya) seeded via Setup wizard
- Captain Approval queue staffed by 1 admin during business hours; SLA 24h
- Cash collection between rider and captain — no platform involvement at v1

**What's explicitly excluded from M1 (deferred to later milestones):**
- Reports module Active state (M2)
- Search Command Center registration (M2)
- Bulk actions (M2)
- Promo codes (M2)
- Online payments / wallet / real daily fee collection (M3)
- Masked phone numbers (M3)
- Multi-stop / scheduled trips (M3)
- Multi-city expansion (M3)
- All AI features (Horizon 2)

**Open Items deferred:** All 8 Open Decisions from Charter §11 — captain fee mechanism, distance algorithm, pickup merge logic, captain incentives, women-only verification timing, female captain recruitment, SMS provider selection, iOS App Store strategy.

### 5.2 Milestone 2 — Core Completeness

**Module PRDs included:**

| File | Version | Status | What activates |
|---|:--:|:--:|---|
| `Beep_Module_Reports_PRD_V1.0.0.md` | V1.0.0 | **Active** (Stub → Active at M2) | Trip Reports (Trip Volume · Abriyah Performance · Cancellation Analysis) · Captain Reports (Leaderboard · Daily Activation Report) · Financial Reports (Revenue by Zone · Activation Fees Accrued — "Accrued" at M1/M2; flips to "Collected" semantics at M3) |

**Bumped documents:**

| File | From | To | Trigger |
|---|---|---|---|
| `Beep_App_Charter_V1.0.0.md` | V1.0.0 | V1.0.1 | Patch — §0.3 file reference update for Reports PRD Stub → Active; pointer update only, no contract changes |
| `Beep_Module_Customer_App_PRD_V1.0.0.md` | V1.0.0 | V1.1.0 | Minor — promo code redemption flow added to Home screen |
| `Beep_Module_Customers_PRD_V1.0.0.md` | V1.0.0 | V1.1.0 | Minor — Customer Detail gains Referrals tab (4 tabs total) |

**Activated:**
- Reports module — 7 reports across Trip / Captain / Financial categories
- Search Command Center — 14 nav entries + 3 action entries + 5 searchable entities registered
- Bulk actions — bulk approve captains (Pending Approval), bulk archive zones, bulk export trips
- Multi-view toggle persistence via App Preferences Pattern (Kanban view on Live Rooms; Inbox view on Pending Captains)
- Promo codes + referral program
- Iraqi-Arabic copy polish across all 3 surfaces

**Phase 8 (Flow Test):** Pending. Conducted post-M1 launch with 2 weeks of operational data. Findings absorbed in Module PRD patch bumps.

**Phase 9 (UX Simplification):** Pending. Conducted alongside Phase 8.

**What's excluded from M2:** Online payments (M3) · multi-city (M3) · all AI features (Horizon 2)

### 5.3 Milestone 3 — Online Payments Add-on (v2)

**Module PRDs included:**

| File | Version | Status | What activates |
|---|:--:|:--:|---|
| `Beep_Module_Payments_PRD_V1.0.0.md` | V1.0.0 | **Active** (new module — added at M3) | Wallet management · Payment method CRUD · Refund console · Transaction log |

**Bumped documents:**

| File | From | To | Trigger |
|---|---|---|---|
| `Beep_App_Charter_V1.0.0.md` | V1.0.1 | V1.2.0 | Minor — adds Payments module to §0.3 + §3.1 nav; adds Wallet / PaymentMethod / Transaction / Refund entities to §6 (4 new entities); adds 6 payment-related events to §5.5.1; adds Online Payments add-on row to §2.1 (was placeholder Horizon 1) |
| `Beep_Module_Captain_App_PRD_V1.1.0.md` | V1.1.0 | V1.2.0 | Minor — Activate Today flow updated: status flow `pending` → `paid` on successful charge; Failure path → CTA persists with error |
| `Beep_Module_Customer_App_PRD_V1.1.0.md` | V1.1.0 | V1.2.0 | Minor — Wallet tab on profile; Card management; Pay-with-Wallet on trip request; Refund visibility |
| `Beep_Module_Reports_PRD_V1.0.0.md` | V1.0.0 | V1.1.0 | Minor — Revenue reports flip "Accrued Fees" → "Collected Fees" semantics; Refunds report added |

**Activated:**
- Wallet + Card payment methods for trip fares
- Real 2,000 IQD daily activation fee collection
- Masked phone numbers (proxy number service — Twilio-style)
- Refund + cancellation penalty flows
- Financial Reports — Real Collected Revenue
- Multi-stop regular trips (Customer App: up to 3 destinations per trip)
- Scheduled trips (Customer App: book up to 7 days ahead)
- Multi-city expansion — Erbil + Basra + Mosul activations; admin city filter activates

**Phase 8 / Phase 9:** Conducted post-M3 launch.

---

## 6. Version-to-Milestone Map (HARD CONTRACT)

| Module / Sub-Agent PRD | M1 | M2 | M3 |
|---|:--:|:--:|:--:|
| `Beep_Module_Dashboard_PRD` | V1.0.x (Active) | V1.0.x (Active) | V1.0.x (Active) |
| `Beep_Module_Operations_PRD` | V1.0.x (Active) | V1.0.x (Active) | V1.0.x (Active) |
| `Beep_Module_Zones_PRD` | V1.0.x (Active) | V1.0.x (Active) | V1.0.x (Active) |
| `Beep_Module_Captains_PRD` | V1.0.x (Active) | V1.0.x (Active) | V1.0.x (Active) |
| `Beep_Module_Customers_PRD` | V1.0.x (Active) | V1.1.x (Active) | V1.1.x (Active) |
| `Beep_Module_Reports_PRD` | — (Stub) | V1.0.x (Active) | V1.1.x (Active) |
| `Beep_Module_Setup_PRD` | V1.0.x (Active) | V1.0.x (Active) | V1.0.x (Active) |
| `Beep_Module_Customer_App_PRD` | V1.0.x (Active) | V1.1.x (Active) | V1.2.x (Active) |
| `Beep_Module_Captain_App_PRD` | V1.0.x (Active) | V1.1.x (Active) | V1.2.x (Active) |
| `Beep_Module_Payments_PRD` | — | — | V1.0.x (Active, new) |
| `Beep_Sub_Agent_PRD` | V1.0.x (Stub) | V1.0.x (Stub) | V1.0.x (Stub) |

**Rule:** Once a PRD becomes Active at milestone M<n>, its version can only patch-up at later milestones, never minor-down. Major-version bumps require explicit Roadmap iteration.

**Sub-Agent stays Stub through M3** — Horizon 2 AI work has no scheduled milestone yet; Stub → Full promotion happens when approved.

---

## 7. Charter Compatibility Lock

| Charter Version | First Milestone Active | Compatible Module PRD Versions |
|---|---|---|
| V1.0.x | M1 | All V1.0.x Module PRDs |
| V1.1.x | M2 (Charter patch only) | All V1.0.x and V1.1.x Module PRDs (additive) |
| V1.2.x | M3 | All V1.x.x Module PRDs; introduces Payments entity model |
| V2.0.x | Horizon 2 | Forces re-baseline if AI activation requires Sub-Agent contract changes |

**Rule:** Charter major bumps require all Module PRDs to declare a new `Compatible Charter Version` field before the next milestone closes.

---

## 8. Spec Section Mapping

### 8.1 Charter §§ → Milestone

| Charter Section | M1 | M2 | M3 |
|---|:--:|:--:|:--:|
| §1 Executive Summary | ✅ | ✅ | ✅ |
| §2 Packaging | ✅ partial (Free-Core only; Online Payments gate inactive) | ✅ partial | ✅ full (Online Payments add-on active) |
| §3 Navigation Tree | ✅ partial (Reports module is landing-only stub) | ✅ full | ✅ full + Payments module |
| §4 Patterns | ✅ (incl. 0 AI features at v1) | ✅ | ✅ |
| §5.1 Automation | ✅ (1 Captain Approval template) | ✅ | ✅ |
| §5.2 Document Center | ✅ | ✅ | ✅ |
| §5.3 AI Orchestrator | ✅ Sub-Agent Stub | ✅ Stub | ✅ Stub *(Full deferred to Horizon 2)* |
| §5.4 Search Command Center | — | ✅ (registered) | ✅ |
| §5.5 Event Bus | ✅ (19 published + 2 consumed) | ✅ (same) | ✅ + 6 payment events |
| §5.6 Import Engine | ✅ (2 Specs) | ✅ | ✅ |
| §6 Data Model | ✅ (9 entities) | ✅ | ✅ + 4 payment entities |
| §8 Cross-Module Engines | ✅ (4 engines) | ✅ | ✅ + Payment Resolution engine |
| §9 Multi-City | ✅ Baghdad only | ✅ Baghdad only | ✅ 4 cities |
| §10 System Features | ✅ partial (no multi-currency, IQD only) | ✅ | ✅ |

### 8.2 Module PRD §§ → Milestone

| Module PRD Section | Authored at |
|---|---|
| §0 Document History | Authored at first milestone activation; patched every milestone the module touches |
| §1 Module Overview | First milestone activation |
| §2 Charter References | First milestone activation; re-validated on every Charter bump |
| §3 Page Specifications | First milestone activation; per-page may activate at later milestones with gated placeholder text |
| §4 Module-Scoped Rules | First milestone activation; new rules require minor bump |
| §5 Scope Boundaries | First milestone activation |
| §6 Glossary Additions | First milestone activation; merged into Charter §12 at next Charter minor bump |

---

## 9. Roadmap History

| Version | Date | Summary |
|---|---|---|
| V1.0 | 2026-05-19 | Base version — initial 3-milestone sequencing authored alongside Charter V1.0.0. Approved for engineering. |

---

## 10. Iteration Trail (Part E — Concluded)

### 10.1 Iteration Prompt (V0.1 — preserved as historical context)

> *"Update Beep_PRD V1.0 (single-doc PRD format) to match the TORCH PRD template suite. Author full suite — Charter + Module PRDs + Sub-Agent Stub + Roadmap — using the Implementation Base files 00–06. Treat Beep as ONE TORCH app with Admin Dashboard as the L1-module surface and Customer/Captain Apps as mobile-client surfaces per Charter §3.4 + §4.15."*

### 10.2 Key Decisions

| Decision | Rationale | Trade-off |
|---|---|---|
| One TORCH app (not three) | Beep has one backend, one Event Bus, one data model — three Charters would force entity duplication or a 4th "Platform Contract" doc the original P&S framework doesn't have | Customer/Captain Apps documented as flows, not list-page modules — but TORCH template wasn't designed for mobile-flow specs |
| Reports as Stub at M1 | Reporting needs operational data to be useful; building reports in Month 1 with no live data is wasted effort | Operators rely on Live Trips Map + raw Trip list for first 2 months |
| Sub-Agent Stub through M3 | No AI features designed for v1 or v2; forward-compatibility ensures Horizon 2 ships without re-architecture | Sub-Agent PRD content is minimal at v1 |
| Online Payments as a single M3 bundle | Wallet, real fee collection, masked numbers, refunds all share the payment-platform integration cost; grouping reduces re-work | M3 is L-sized; could be split if team prefers |
| Multi-city deferred to M3 | Single-city operations let the team prove the Abriyah Room Matching engine in one zone before scaling | Erbil / Basra / Mosul wait ~6-9 months for service |
| Daily Activation Fee static at v1 | Real collection requires Online Payments infrastructure (M3); recording-only proves the model | Pending fees accrue in books without collection — finance reports show "accrued" not "real" revenue |

### 10.3 Open Questions Resolved

| Question | Resolution | Resolved In |
|---|---|---|
| Is Beep one app or three? | One app, per Charter Compatibility check — shared backend forces shared Charter | Charter V1.0.0 §0.3 |
| Where do Customer/Captain Apps fit in TORCH? | Mobile Client Surfaces per Charter §3.4 + §4.15 (new pattern introduced for Beep) | Charter V1.0.0 §4.15 |
| When does Sub-Agent Stub → Full? | Horizon 2 (no scheduled milestone yet) — AI features are not part of v1 or v2 | Roadmap §2 + Charter §11 Horizon 2 |
| Single-city or multi-city at M1? | Single-city Baghdad — multi-city is M3 expansion | Charter §1.4 + Roadmap §5.1 |
| When does the Daily Activation Fee get real? | M3 alongside Online Payments | Charter §4.11 + Roadmap §5.3 |

### 10.4 Open Questions Still Carried (from source PRD §15)

The 8 Open Decisions in Charter §11 remain unresolved — they need product/business input before M3 ships:
1. Captain fee collection mechanism
2. Distance algorithm for Abriyah fare
3. Pickup merge logic
4. Captain incentive structure
5. Women-only ID verification timing
6. Female captain recruitment program
7. SMS provider final selection
8. iOS App Store strategy

---

**End of Beep Implementation Roadmap V1.0.0**
