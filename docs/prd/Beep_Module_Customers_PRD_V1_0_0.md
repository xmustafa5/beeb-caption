# Beep — Customers Module PRD V1.0.0

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

The Customers module is Beep's **rider directory** — read-only by design (riders self-register via Customer App) with admin actions limited to block / unblock and complaint review. The module owns the operator-facing view of the `User` entity (riders, distinct from admin users which live in Setup → Admin Users).

### 1.2 Sub-modules

Per Charter §3.1:

- **All Customers** — 1 list page (Table)

Net Customers list pages: 1.

### 1.3 Package

**Core**.

### 1.4 Primary Personas

- **Omar** (Operator) — primary user; looks up riders by phone for support inquiries
- **Super-admin** — Block / Unblock customers
- **Yousef** (Finance) — read-only

### 1.5 Acceptance Criteria

1. Given an Operator opens Customers → All Customers, when they search "07901234567" in the phone filter, then the matching User row appears within ≤500ms.
2. Given an Operator clicks a customer row, then Customer Detail opens with 3 tabs (Overview · Trips · History) showing trip count, avg rating given, and cancellation rate.
3. Given a super-admin blocks a customer, then `User.blocked = true`, the customer cannot request new trips, and any in-flight trip is allowed to complete.
4. Given a customer's gender field is unset, when they attempt to use women-only Abriyah in Customer App, then the app prompts them to confirm gender (handled in Customer App PRD — this module shows the unset state).

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `User` | **Primary entity (read + block/unblock)** | §6.5 |
| `Trip` | Read-only — trip history on Customer Detail | §6.1 |
| `Rating` | Read-only — ratings given by + received by this customer | §6.7 |
| `AuditLog` | Read-only — Customer Detail → History tab | §6.8 |

### 2.2 Events Published

None directly. Block/Unblock writes `User.blocked = true/false` and the system emits no formal Event Bus event at v1 (could be added at v2 if other modules need to react — e.g. wallet refund flow needs `beep.user.blocked`).

### 2.3 Events Consumed

| Event | Handler |
|---|---|
| `beep.trip.completed` | Increment trip count on Customer Detail Overview + All Customers row |
| `beep.trip.cancelled` | Increment cancellation count |
| `beep.trip.rated` | Update avg rating given/received |

### 2.4 Cross-Module Flows This Module Participates In

None directly. Customers is a leaf module — observes Trip / Rating data, doesn't drive cross-module workflows.

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Block / Unblock |
| Operator | Read + Call/WhatsApp customer |
| Finance | Read-only |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Multi-View Pattern | All Customers (Table only — no Kanban/Inbox/Map qualification) | §4.7 |
| Women-Only Eligibility Pattern | Read surface — Customer Detail shows gender + women-only Abriyah eligibility status | §4.13 |

### 2.7 Import Specs Used

None at v1. Customer self-registration via Customer App; no bulk import surface (rejected for v1 — riders register themselves).

### 2.8 Sub-Agent Intents Used

None active at v1.

---

## §3 Page Specifications

### 3.1 Sub-Module: All Customers

#### 3.1.1 All Customers — List Page

**Views:** Table

**Purpose:** Operator's lookup directory for support inquiries + super-admin's block-management surface.

**Page-level conventions:**
- **Toolbar:** `[Export ▼]` · `[Refresh]`
- **Saved Views:** scope key `data_views.customers.all_customers`
- **Filter retention:** `filters.customers.all_customers`
- **Performance target:** < 1s P95 with 10K customers

**Columns:**

| Column | Source | Sortable | Filterable | Default Visible |
|---|---|---|---|---|
| Name | `User.name` (+ name_ar) | yes | text | yes |
| Phone | `User.phone` | yes | text (exact match) | yes |
| Gender | `User.gender` (m / f / unset) | yes | multi-select | yes |
| Total Trips | `count(Trip where rider_id=this AND status=COMPLETED)` | yes | range | yes |
| Avg Rating Received | `avg(Rating.stars where of_user_id=user.id)` | yes | range | no |
| Avg Rating Given | `avg(Rating.stars where by_user_id=user.id)` | yes | range | no |
| Cancellation Count | `count(Trip where rider_id=this AND status=CANCELLED AND cancelled_by=rider)` | yes | range | yes |
| Blocked | `User.blocked` | yes | yes/no | yes |
| Created At | `User.created_at` | yes | date range | no |

**`columnExcluded`:** `id`, `organization_id`, `version`, `photo_url`

**Filters:** Gender · Blocked (yes/no/all; default all) · Total Trips (range) · Cancellation Count (range)

**Bulk actions (M2+):** Bulk export

**Row actions:**
- `[Open Detail]` → Customer Detail
- `[Call]` (Operator+; native phone dial)
- `[WhatsApp]` (Operator+; wa.me deep link)
- `[Block / Unblock]` (super-admin only)

---

#### 3.1.2 Customer Detail Page (3 tabs)

| Tab | Content |
|---|---|
| **Overview** | Identity (Name EN/AR · Phone · Gender) · KPI strip (Total Trips · Avg Rating Received · Avg Rating Given · Cancellation Count · Total Spend at v1=0 since cash; at v2 real spend) · Block status badge · `[Call]` `[WhatsApp]` |
| **Trips** | Embedded list filtered to this customer — Trip ID · Type · Captain · Fare · Status · Date · drill-through to Trip Detail |
| **History** | Audit log entries: registration · block/unblock events · gender changes (if any — rare) |

**Action Bar (state-driven):**
- Active: `[Block]` (super-admin only, opens reason dialog) · `[Call]` · `[WhatsApp]`
- Blocked: `[Unblock]` (super-admin only)

---

## §4 Module-Scoped Business Rules

### 4.1 Block Requires Reason + Super-Admin

- **Applies to:** Block action on All Customers row + Customer Detail
- **Rule:** Block requires super-admin role + reason text (≥ 10 chars). On confirm: `User.blocked = true`, `User.blocked_reason = reason`. Audit log captures actor + reason.
- **Rationale:** Blocking impacts user access — accountability required.

### 4.2 Block Does Not Cancel In-Flight Trips

- **Applies to:** Block action
- **Rule:** Blocking a customer does NOT cancel their in-flight trips (unlike captain block which does). In-flight trips complete normally; the block prevents new trip requests only.
- **Rationale:** Mid-trip cancellation due to block would strand the rider. Better to complete in-flight and prevent future requests.

### 4.3 Gender Edit Restricted

- **Applies to:** Customer Detail
- **Rule:** Customer gender field is editable on Customer Detail Overview by super-admin only, with audit log capture. Gender drives women-only Abriyah eligibility (Charter §4.13); changes are rare and require justification.
- **Rationale:** Self-declared gender at v1 lives in Customer App; admin override is escalation-only.

### 4.4 Phone Number Uniqueness Globally

- **Applies to:** N/A here (Customer App owns registration); read-only constraint
- **Rule:** Phone is a global natural key per Charter §6.5. This module surfaces phone but does not write it; uniqueness enforced at DB layer.
- **Rationale:** Phone is the OTP identity anchor.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- Read-only customer directory
- Customer Detail with 3 tabs
- Block / Unblock action (super-admin)
- Gender edit (super-admin only, escalation)
- Phone-based lookup for support
- Native Call + WhatsApp actions

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Customer registration | Customer App (mobile flow) | Self-service |
| Trip request | Customer App | Self-service |
| Rating submission | Customer App (post-trip flow) | Self-service |
| Wallet / payment method | Customer App (M3+ with Online Payments) | |
| Promo code redemption | Customer App (M2) + Reports for usage analytics | |
| Bulk customer import | N/A | Rejected for v1 — riders self-register |

### 5.3 Out of Scope (Future)

- **Referrals tab on Customer Detail** (M2 patch bump — V1.1.0 — when referral program ships)
- **Spend analytics** (M3 with real payments)
- **Complaint workflow integration** (Horizon 2)
- **Customer segmentation tags** (Horizon 2)

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Customer Directory** | The read-only list of all rider users on All Customers page. Lookups by phone for support; bulk operations limited at v1. | Pending merge |
| **Customer Block** | The super-admin action that sets `User.blocked = true`, preventing new trip requests. In-flight trips unaffected. | Pending merge |

---

## Appendix A — CRI

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entity User | §6.5 | ✓ |
| §2.1 Entity Trip, Rating, AuditLog | §6.1, §6.7, §6.8 | ✓ |
| §2.6 Multi-View | §4.7 | ✓ |
| §2.6 Women-Only Eligibility | §4.13 | ✓ |

**Verdict:** PASS

---

**End of Beep Customers Module PRD V1.0.0**
