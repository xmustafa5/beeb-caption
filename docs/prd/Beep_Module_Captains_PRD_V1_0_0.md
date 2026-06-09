# Beep — Captains Module PRD V1.0.0

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

The Captains module is Beep's **driver-management surface** — it owns the lifecycle of the `Captain` entity from registration submit through approval / rejection / blocking, and provides the operational record of daily activations and trip history. It is the surface where the Captain Approval Workflow (Charter §4.10, §5.1) is operated by admins, and where finance can read accrued daily activation fees per captain (Charter §4.11).

### 1.2 Sub-modules

Per Charter §3.1:

- **Pending Approval** — 1 list page (Table + Inbox views)
- **All Captains** — 1 list page (Table view)
- **Daily Activation Log** — 1 list page (Table view; Kanban optional)

Cardinality rule: 3 list pages across 3 sub-modules (each ≥1 page).

### 1.3 Package

**Core**.

### 1.4 Primary Personas

- **Omar** (Operator) — daily user; processes pending approvals, monitors captain activity
- **Super-admin** — block / unblock captains; bulk operations
- **Yousef** (Finance) — reads Daily Activation Log for accrued fees report

### 1.5 Acceptance Criteria

1. Given a captain submits registration via Captain App, when the Operator opens Pending Approval, then the captain appears in the list within ≤30s.
2. Given an Operator opens Pending Approval in Inbox view, when they tap a row, then they see the captain's Documents preview (driver_license · car_registration · captain_selfie) inline with `[Approve]` / `[Reject]` buttons.
3. Given an Operator approves a captain, then captain status → APPROVED, `beep.captain.approved` fires, captain receives push notification, and the row is removed from Pending Approval list.
4. Given an Operator rejects a captain, then a reason dialog opens (required), captain status → REJECTED, `beep.captain.rejected` fires with reason, and captain receives push notification.
5. Given a super-admin blocks a captain on Captain Detail, then status → BLOCKED, `beep.captain.blocked` fires with reason, any active trip is force-cancelled, and the captain is signed out of the Captain App.
6. Given a captain has not done Daily Activation today, when the admin opens Daily Activation Log filtered by Date=today, then that captain does not appear (only activated captains show); the All Captains list shows an "Activated Today" badge.
7. Given an Operator imports 100 captains via `beep.captain_bulk` Import Spec, when 95 rows pass validation, then 95 Captain records are created with status PENDING and appear in Pending Approval queue.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `Captain` | **Primary entity (CRUD)** — Pending Approval, All Captains, Captain Detail (5 tabs) | §6.4 |
| `CaptainDailyActivation` | **Primary entity (read-only display)** — Daily Activation Log; Captain Detail → Daily Activation History tab | §6.6 |
| `Trip` | Read-only — Captain Detail → Trips tab; trip count aggregations | §6.1 |
| `Rating` | Read-only — average star rating on Captain row + Detail Overview | §6.7 |
| `AuditLog` | Read-only — Captain Detail → History tab | §6.8 |

### 2.2 Events Published

| Event | Trigger | Charter Reference |
|---|---|---|
| `beep.captain.registered` | Captain submits registration (via Captain App OR Import Engine) | §5.5.1 |
| `beep.captain.approved` | Approve action on Pending Approval / Captain Detail | §5.5.1 |
| `beep.captain.rejected` | Reject action with reason | §5.5.1 |
| `beep.captain.blocked` | Block action (super-admin only) | §5.5.1 |

### 2.3 Events Consumed

| Event | Handler |
|---|---|
| `beep.captain.activated_today` | Add row to Daily Activation Log; update Activated Today badge on All Captains |
| `beep.trip.completed` | Increment trip count + recompute avg rating on Captain Detail |
| `beep.trip.cancelled` | Increment cancellation count on Captain Detail |
| `beep.trip.rated` | Update avg rating on Captain row |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Captain Approval Workflow** | **Owner** — this module owns the inline UX (state-driven Action Bar on Captain Detail) and the Pending Approval Inbox view | §4.10, §5.1 |
| **Captain Daily Activation Gate** | Read-only consumer — Daily Activation Log is the historical record | §4.11, §8.2 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Full CRUD + Block / Unblock |
| Operator | Approve · Reject · view all; cannot Block (super-admin only) |
| Finance | Read-only on Daily Activation Log + Captain Detail (no actions) |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Captain Approval Pattern | State-driven Action Bar + Status Badge on Captain Detail | §4.10 |
| Captain Lifecycle State Machine | PENDING → APPROVED / REJECTED → BLOCKED | §4.5 |
| Multi-View Pattern | Pending Approval (Table + Inbox); All Captains (Table); Daily Activation Log (Table; Kanban optional by activation status) | §4.7 |
| Daily Activation Gating | Daily Activation Log surfaces the gating record | §4.11 |

### 2.7 Import Specs Used

| Spec ID | Entity | Module Usage | Charter Reference |
|---|---|---|---|
| `beep.captain_bulk` | Captain | `[Import]` toolbar on All Captains list. Required: phone, name, gender, car_make, car_model, car_plate. Optional: car_color, national_id. Validators run phone format + plate uniqueness. Post-commit: status PENDING — admin must still upload docs and approve. | §5.6.1 + §5.6.2 |

### 2.8 Sub-Agent Intents Used

None active at v1. Horizon 2 candidate: `beep.query.fraud_signals` would surface a "Fraud Signal" column on Pending Approval + Captain Detail Overview when promoted to Full.

---

## §3 Page Specifications

### 3.1 Sub-Module: Pending Approval

#### 3.1.1 Pending Approval — List Page

**Views:** Table (default) + Inbox (toggleable per Multi-View Pattern — qualifies because sequential processing with detail preview)

**Purpose:** FIFO triage queue for new captain registrations.

**Page-level conventions:**
- **Layout:** App Layout Block · page header (title + view switcher + filter chips + Refresh) · table OR inbox body
- **Toolbar:** `[Refresh]` · `[Export]`
- **Bulk actions:** Bulk Approve (super-admin only; opens confirmation listing rows)
- **Saved Views:** scope key `data_views.captains.pending_approval`
- **Performance target:** < 1s P95 with 50 pending rows

**Table view columns:**

| Column | Source | Sortable | Filterable | Default |
|---|---|---|---|---|
| Captain Name | `Captain.name` | yes | text | yes |
| Phone | `Captain.phone` | no | text | yes |
| Gender | `Captain.gender` | yes | m/f | yes |
| Car | `{make} {model} ({plate})` | no | text | yes |
| Registered At | `Captain.registered_at` | yes (default ↑ oldest first) | date range | yes |
| Age (hours) | computed | yes | range | yes (red > 24h) |
| Documents | computed (count uploaded / 3 required) | yes | range | yes |
| National ID | `Captain.national_id` | no | text | no |

**`columnExcluded`:** `id`, `organization_id`, `version`, `documents` (JSONB — surfaced visually)

**Filters:** Gender · Age (range) · Documents Complete (yes/no)

**Inbox view:**

Two-pane layout per Multi-View Pattern:
- Left pane: row list (same columns abridged: Name · Phone · Age · Documents)
- Right pane: full preview of selected captain
  - Identity summary (Name AR/EN · Phone · Gender · National ID)
  - Car summary (make · model · color · plate)
  - **Documents thumbnails** — 3 thumbnails clickable to full-screen preview
  - Inline action buttons: `[✓ Approve]` · `[✗ Reject]` · `[Open Full Detail]`

**Row actions (both views):** `[Approve]` · `[Reject]` · `[Open Detail]`

**Empty state:** "No pending captains — you're caught up."

---

### 3.2 Sub-Module: All Captains

#### 3.2.1 All Captains — List Page

**Views:** Table

**Purpose:** The master captain directory across all lifecycle states.

**Page-level conventions:**
- **Toolbar:** `[Import]` (uses `beep.captain_bulk` Spec) · `[Export ▼]` · `[Refresh]`
- **Saved Views:** scope key `data_views.captains.all_captains`
- **Filter retention:** `filters.captains.all_captains`

**Columns:**

| Column | Source | Default Visible |
|---|---|---|
| Name | `Captain.name` (+ name_ar) | yes |
| Phone | `Captain.phone` | yes |
| Gender | `Captain.gender` | yes |
| Status | `Captain.status` (PENDING / APPROVED / REJECTED / BLOCKED) | yes (color-coded) |
| Car | `{make} {model} ({plate})` | yes |
| Activated Today | computed (CaptainDailyActivation exists for date=today) | yes (badge) |
| Online Now | runtime (WebSocket presence) | yes (badge) |
| Total Trips | `count(Trip where captain_id=this AND status=COMPLETED)` | yes |
| Avg Rating | `avg(Rating.stars where of_user_id=captain.id)` | yes |
| Total Cancellations | `count(Trip where captain_id=this AND status=CANCELLED)` | no |
| Registered At | `Captain.registered_at` | yes |
| Approved At | `Captain.approved_at` | no |

**`columnExcluded`:** `id`, `documents`, `version`

**Filters:** Status (multi-select) · Gender · Activated Today (yes/no) · Online Now (yes/no) · Avg Rating (range) · Total Trips (range)

**Bulk actions (M2+):** Bulk export · Bulk block (super-admin)

**Row actions:** `[Open Detail]` · `[Block / Unblock]` (super-admin only) · `[Call]` · `[WhatsApp]`

---

### 3.3 Sub-Module: Daily Activation Log

#### 3.3.1 Daily Activation Log — List Page

**Views:** Table (default); Kanban optional (by status: pending / paid / waived) — qualifies marginally; included for forward compatibility with M3 when status transitions become meaningful

**Purpose:** Historical record of daily captain activations. Finance reads this for accrued-fees reporting.

**Page-level conventions:**
- **Toolbar:** `[Export ▼]` · `[Refresh]`
- **Filter retention:** `filters.captains.daily_activation_log`
- **Default filter:** Date = today

**Columns:**

| Column | Source | Default Visible |
|---|---|---|
| Date | `CaptainDailyActivation.date` | yes (default sort ↓) |
| Captain Name | join Captain.name | yes |
| Captain Phone | join Captain.phone | yes |
| Fee Amount (IQD) | `fee_amount_iqd` | yes |
| Status | `status` (pending / paid / waived) | yes (color-coded; pending = yellow at v1, paid = green at v2, waived = gray) |
| Activated At | `created_at` | yes |
| Collected At | `collected_at` (M3+) | yes (— at M1/M2) |
| Waived By | `waived_by` → admin name | no |
| Waived Reason | `waived_reason` | no |

**Filters:** Date range · Status · Captain (search-as-type)

**Row actions:**
- `[View Captain]` → Captain Detail
- `[Waive Fee]` (super-admin only; opens reason dialog; sets status=waived; emits audit log)

**Aggregation footer:** Sum of fee_amount_iqd for current filter result.

---

### 3.4 Captain Detail Page (5 tabs)

| Tab | Content |
|---|---|
| **Overview** | Identity (Name EN/AR · Phone · Gender · National ID) · Car details · Status badge · KPI strip (Total Trips · Avg Rating · Activated Today · Total Cancellations · Total Earnings This Month) · `[Call]` `[WhatsApp]` actions |
| **Documents** | Per-document type sections (driver_license · car_registration · captain_selfie) showing thumbnails, upload date, replace-document action (super-admin only) |
| **Daily Activation History** | Embedded list filtered to this captain — same columns as Daily Activation Log §3.3.1 |
| **Trips** | Embedded list of all trips for this captain — Trip ID · Type · Rider count · Fare · Status · Date · drill-through to Trip Detail |
| **History** | Lifecycle Timeline — every state transition with timestamp + actor + reason; audit log entries |

**Action Bar (state-driven per Details Page Standard):**

| Status | Visible Actions |
|---|---|
| PENDING | `[Approve]` · `[Reject]` (with reason) |
| APPROVED | `[Block]` (super-admin only with reason) · `[Call]` · `[WhatsApp]` |
| REJECTED | `[Reconsider]` (returns to PENDING) — super-admin only |
| BLOCKED | `[Unblock]` (super-admin only; restores to APPROVED) |

---

## §4 Module-Scoped Business Rules

### 4.1 Document Completeness Pre-Check

- **Applies to:** Approve action (Pending Approval and Captain Detail)
- **Rule:** A captain cannot be approved unless `Documents Complete = yes` (all 3 required document types uploaded). If incomplete, `[Approve]` button is disabled with tooltip: "Captain must upload all 3 documents before approval."
- **Rationale:** Document gate is the basic compliance check; missing docs would create downstream regulatory risk.

### 4.2 Rejection Reason Required

- **Applies to:** Reject action
- **Rule:** Reject opens a reason dialog with required dropdown (enum: `documents_invalid` · `vehicle_unfit` · `identity_mismatch` · `existing_account` · `other`) + optional free-text comment. Cannot submit reject without reason.
- **Rationale:** Audit trail + captain feedback — captains see rejection reason in push notification.

### 4.3 Block Force-Cancels Active Trips

- **Applies to:** Block action (super-admin)
- **Rule:** When blocking a captain, the system queries for any trip where `captain_id = this AND status ∈ {ACCEPTED, IN_PROGRESS}`. If any found, the confirmation modal shows: "Captain has {N} active trip(s). Blocking will force-cancel them. Continue?" On confirm, `beep.trip.cancelled` is emitted per trip with reason `captain_blocked`.
- **Rationale:** A blocked captain cannot continue any trip — rider safety + trip cancellation cascade integrity.

### 4.4 Fee Waiver Requires Reason + Super-Admin

- **Applies to:** Waive Fee action on Daily Activation Log
- **Rule:** Only super-admin role can waive a daily fee. Waiver requires a reason (text, ≥ 10 chars). Audit log captures actor + before/after + reason.
- **Rationale:** Revenue-impacting action; accountability is required.

### 4.5 Gender Locked Post-Registration

- **Applies to:** Captain Detail → Overview edit mode
- **Rule:** `Captain.gender` is read-only once the captain row exists. Edit mode does not expose this field. Change requires admin support escalation outside the app (manual DB intervention by engineering).
- **Rationale:** Gender drives women-only Abriyah eligibility (Charter §4.13); ad-hoc edits could break in-flight room visibility logic.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- Captain CRUD (Approve / Reject / Block / Unblock / view)
- Captain Approval Workflow inline UX
- Document review on Pending Approval Inbox view
- Daily Activation Log (read-only display)
- Fee waiver action (super-admin)
- Captain Detail with 5 tabs

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Captain registration (signup form) | Captain App (mobile client surface) | Registration is captain-self-service |
| Daily activation creation | Captain App (Activate Today flow) | Self-service in app |
| Document upload | Captain App | Self-service |
| Trip CRUD | Operations module | Trips are runtime |
| Rating CRUD | Customer App / Captain App (post-trip flow) | Self-service |
| Captain Approval template definition | Setup module (or platform-level) | Template is configuration; this module is the runtime |

### 5.3 Out of Scope (Future)

- **Tiered captain levels** (Bronze/Silver/Gold) — Horizon 2 with gamification
- **Captain leaderboard module page** — Reports module Captain Leaderboard at M2
- **Multi-step approval chain** — currently single-step admin (Charter §4.10); Horizon 2 if scale demands
- **AI-flagged registrations** — Horizon 2 via Sub-Agent `beep.query.fraud_signals`

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Pending Approval Queue** | The FIFO triage list on Captains → Pending Approval, sorted by `registered_at` oldest-first. SLA target 24h. | Pending merge |
| **Inbox View** | Two-pane Multi-View variant used on Pending Approval — left list, right preview with inline approve/reject. | Pending merge |
| **Document Completeness** | The check that all 3 required document types (driver_license · car_registration · captain_selfie) are uploaded before Approve is enabled. | Pending merge |
| **Fee Waiver** | The super-admin action on Daily Activation Log that sets `CaptainDailyActivation.status = waived` with reason. Used for ops exceptions. | Pending merge |

---

## Appendix A — Cross-Reference Integrity Check (CRI)

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entity Captain | §6.4 | ✓ |
| §2.1 Entity CaptainDailyActivation | §6.6 | ✓ |
| §2.1 Entity Trip, Rating, AuditLog | §6.1, §6.7, §6.8 | ✓ |
| §2.2 Events captain.registered/approved/rejected/blocked | §5.5.1 | ✓ |
| §2.4 Captain Approval Workflow | §4.10, §5.1 | ✓ |
| §2.4 Captain Daily Activation Gate | §4.11, §8.2 | ✓ |
| §2.6 Captain Approval Pattern | §4.10 | ✓ |
| §2.6 Captain Lifecycle State Machine | §4.5 | ✓ |
| §2.6 Multi-View Pattern | §4.7 | ✓ |
| §2.6 Daily Activation Gating | §4.11 | ✓ |
| §2.7 Import Spec beep.captain_bulk | §5.6.1 | ✓ |

**Verdict:** PASS

---

**End of Beep Captains Module PRD V1.0.0**
