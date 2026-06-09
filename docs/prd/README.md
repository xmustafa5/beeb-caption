# Beep — TORCH PRD Suite

This bundle is the complete TORCH-compliant PRD suite for **Beep**, a ride-hailing platform with one Admin Dashboard (7 L1 modules) plus two Mobile Client Surfaces (Customer App, Captain App) — all sharing a single backend, data model, and Event Bus.

Transformed from the original `Beep_PRD_V1.0.md` (single-doc PRD) into the multi-document TORCH framework per `PRD_Implementation_Base/05_Implementation_Playbook.md` Playbook A.

---

## Suite Overview

| Layer | File | Purpose |
|---|---|---|
| **Charter** | `Beep_App_Charter_V1_0_0.md` | The contract — entities, events, patterns, navigation, packaging, cross-module flows |
| **Roadmap** | `Beep_Implementation_Roadmap_V1_0_0.md` | 3-milestone sequencing (M1 Foundation · M2 Core Completeness · M3 Online Payments) |
| **Sub-Agent** | `Beep_Sub_Agent_PRD_V1_0_0.md` | Stub — 0 active capabilities at v1; Horizon 2 candidates documented |
| **Admin Module PRDs** | 7 files | One per L1 sidebar module |
| **Mobile Client Surface PRDs** | 2 files | Customer App + Captain App as flow-based clients (Charter §4.15) |

---

## Read in This Order

1. **Charter first** — `Beep_App_Charter_V1_0_0.md` is the source of truth. Every other doc references it.
2. **Roadmap second** — `Beep_Implementation_Roadmap_V1_0_0.md` shows which modules ship at which milestone.
3. **Pick a module** based on what you're building:

| Admin Modules | Mobile Surfaces | Special |
|---|---|---|
| `Beep_Module_Dashboard_PRD_V1_0_0.md` | `Beep_Module_Customer_App_PRD_V1_0_0.md` | `Beep_Sub_Agent_PRD_V1_0_0.md` (Stub) |
| `Beep_Module_Operations_PRD_V1_0_0.md` | `Beep_Module_Captain_App_PRD_V1_0_0.md` | |
| `Beep_Module_Zones_PRD_V1_0_0.md` | | |
| `Beep_Module_Captains_PRD_V1_0_0.md` | | |
| `Beep_Module_Customers_PRD_V1_0_0.md` | | |
| `Beep_Module_Reports_PRD_V1_0_0.md` (Stub at M1; Active at M2) | | |
| `Beep_Module_Setup_PRD_V1_0_0.md` | | |

---

## Key Structural Decisions

### One App, Three Surfaces
Beep is **one TORCH app** with one Charter — not three separate apps for Customer / Captain / Admin. Rationale: shared backend + shared data model + shared Event Bus would force entity duplication or a 4th "Platform Contract" doc the original framework doesn't have.

### Customer App + Captain App as Mobile Client Surfaces
Charter §4.15 introduces the **Mobile Client Surface Standard** — flows, not list pages. The two mobile clients reference the same entities, events, and patterns from the Charter; their PRDs spec flows (Onboarding · Booking · Live Trip · Rate) rather than list-page tables.

### Reports as Stub at M1
Reporting needs operational data to be useful. Reports module is a Stub at M1 with §3 / §4 / §6 deferred to M2 promotion (Stub → Active) when ~2 weeks of live data is available.

### Sub-Agent Stub Through M3
Beep has **0 AI features at v1 / v2**. Sub-Agent is registered with the AI Orchestrator as a forward-compatible Stub. Three Horizon 2 candidates are documented: Fraud Detection · Surge Pricing Suggestions · Captain-Match Optimizer.

### PostGIS Is Mandatory
Charter §1.6 + §4.8 — Beep's zone polygon containment (`ST_Contains`) relies on PostgreSQL + PostGIS. Non-PostGIS deployments do not work.

### Single-City Baghdad at v1
Multi-city (Erbil · Basra · Mosul) is M3 with Online Payments.

---

## Cross-Document Integrity

Each Module PRD's **Appendix A CRI** verifies that its §2 Charter References point to real Charter sections. All 9 Module PRDs + the Sub-Agent Stub have passing CRI checks.

When updating any document:
- Bump version per `PRD_Implementation_Base/06_Conventions_Reference.md` versioning rules
- If Charter changes, audit all Module PRD §2 references
- If a new event is added to Charter §5.5.1, update every Module PRD that publishes or consumes it
- Re-run all 10 integrity rules from `06_Conventions_Reference.md`

---

## Counts

| Metric | Value |
|---|---|
| Total files | 12 |
| Total lines | ~5,000 |
| Owned entities | 9 (Trip · Room · Zone · Captain · User · CaptainDailyActivation · Rating · AuditLog · NotificationLog) |
| Published events | 19 |
| Consumed events | 2 (org platform events) |
| Admin L1 modules | 7 |
| Mobile client flows | 14 (7 Customer + 7 Captain) |
| Approval workflow templates | 1 (Captain Approval) |
| Import Specs | 2 (`beep.zone`, `beep.captain_bulk`) |
| Cross-module engines | 4 (Abriyah Matching · Daily Activation Gate · Cancellation Cascade · Zone Pricing Propagation) |
| Active AI capabilities at v1 | 0 (Stub) |
| Horizon 2 AI candidates | 3 |
| Milestones | 3 (M1 Foundation · M2 Core Completeness · M3 Online Payments) |

---

**Bundle generated 2026-05-19.**
