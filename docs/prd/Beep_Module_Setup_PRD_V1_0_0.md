# Beep — Setup Module PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · Add New Form Standard V1.2.3+ · App Layout Block

---

## §0 Module Document History

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release to engineering. |

**Status:** **Approved** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+. **Milestone:** M1 (Foundation).

---

## §1 Module Overview

### 1.1 Purpose

The Setup module is Beep's **configuration surface** — it owns three sub-modules: Operations Foundations (city-level pricing defaults, daily activation fee, room settings), Admin Users (role-based admin management for super-admin / operator / finance), and App Settings (general settings: org timezone display, locale, retention policies). Where Zones owns per-zone overrides, Setup owns the org-level fallback / default values.

### 1.2 Sub-modules

Per Charter §3.1:

- **Operations Foundations** — 3 list pages (Pricing Defaults · Daily Activation Fee · Room Settings)
- **Admin Users** — 1 list page
- **App Settings** ⟨single-page cluster⟩ — 1 list page (General Settings)

Net Setup list pages: 5.

### 1.3 Package

**Core**.

### 1.4 Primary Personas

- **Super-admin** — primary user; only role that can edit settings
- **Operator** — read-only access to Operations Foundations (informational)
- **Finance** — read-only across all Setup pages

### 1.5 Acceptance Criteria

1. Given a super-admin opens Setup → Operations Foundations → Pricing Defaults, when they edit the city-level default `abriyah_per_km_iqd` from 1000 to 1200 and save, then the default takes effect for **new zones created from this point forward**; existing zones are unaffected unless individually re-edited.
2. Given a super-admin opens Daily Activation Fee, when they change the fee from 2000 to 2500 IQD and save, then any captain's `Activate Today` action from this point uses the new fee; today's already-recorded activations are unaffected.
3. Given a super-admin opens Admin Users, when they invite a new operator by email + role, then a new admin account is created with role-restricted access per Charter §1.5 roles.
4. Given a super-admin attempts to remove their own super-admin role, then the action is blocked with error: "At least one super-admin must exist."
5. Given any non-super-admin opens Setup, then all edit buttons are disabled with tooltip "Super-admin role required to edit settings."

---

## §2 Charter References

### 2.1 Entities Used

Setup uses configuration / setting "entities" that are effectively singleton records, plus admin user records owned by the auth platform.

| Entity / Setting | Role | Charter Reference |
|---|---|---|
| Pricing Defaults (singleton) | Org-level default Abriyah per-km + base fare for new zones | Charter §6 (configuration, not entity-table) |
| Daily Activation Fee (singleton) | Org-level static fee 2000 IQD | Charter §4.11 + §6.6 read-side |
| Room Settings (singleton) | Org-level defaults for room_max_riders (4) + room_max_wait_seconds (300) | Charter §4.8 + §6.3 read-side |
| Admin User | **Cross-app entity** — owned by Auth Microservice / Business OS Core | Charter §6 Cross-App Entity References |
| General Settings (singleton) | App-level: locale, retention, contact info | Charter §10 |

### 2.2 Events Published

| Event | Trigger |
|---|---|
| `beep.zone.updated` | (indirectly) — Pricing Defaults change doesn't itself emit; per-zone changes flow through Zones module |
| `org.setting.changed` | (cross-app, Business OS Core convention) — when Setup settings change |

At v1, internal Setup edits emit only AuditLog rows and no public Event Bus event (no other module needs to react to default changes since they affect only future entity creation).

### 2.3 Events Consumed

| Event | Handler |
|---|---|
| `org.user.role_changed` | If admin role changed mid-edit, refresh permissions; revoke session if role demoted to read-only |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Captain Daily Activation Gate** | Configuration origin — the fee amount used in `CaptainDailyActivation.fee_amount_iqd` defaults to this setting | Charter §4.11, §8.2 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Super-admin | Full CRUD on all settings + admin user management |
| Operator | Read-only on Operations Foundations; no access to Admin Users (super-admin only) |
| Finance | Read-only across all pages |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| Compact Drawer Forms | Edit dialogs for single-setting edits (e.g. Edit Daily Activation Fee) | Add New Form Standard variant |
| Multi-View | Table-only on all Setup pages (small datasets) | §4.7 |

### 2.7 Import Specs Used

None.

### 2.8 Sub-Agent Intents Used

None active at v1.

---

## §3 Page Specifications

### 3.1 Sub-Module: Operations Foundations

#### 3.1.1 Pricing Defaults — List Page

**Views:** Table (single-row settings list)

**Purpose:** Org-level fallback Abriyah pricing applied to newly-created zones. Per-zone overrides live in Zone Detail → Pricing.

**Columns:**

| Column | Source | Default |
|---|---|---|
| Setting | label | yes |
| Value | setting value | yes |
| Unit | (e.g. IQD/km) | yes |
| Last Updated By | actor name | yes |
| Last Updated At | timestamp | yes |

**Rows (5 settings):**

| Setting | Default Value | Validation |
|---|---|---|
| Default Abriyah Per-km Rate | 1000 IQD/km | range 100–10000 |
| Default Abriyah Base Fare | 0 IQD | range 0–5000 |
| Default Regular Base Fare | 2000 IQD | range 500–10000 |
| Default Regular Per-km Rate | 500 IQD/km | range 100–5000 |
| Default Minimum Fare | 2000 IQD | range 500–10000 |

**Row actions:** `[Edit]` → opens Compact Drawer with single field

**Note:** Editing a default does **not** retroactively update existing zones. Only zones created after the edit pick up the new default.

---

#### 3.1.2 Daily Activation Fee — List Page

**Views:** Table (single row)

**Purpose:** Org-level static daily activation fee used by Captain App's Activate Today flow.

**Columns:** Setting · Value · Unit · Last Updated By · Last Updated At

**Single row:** Daily Activation Fee — default 2000 IQD — range 500–10000

**Row action:** `[Edit]` → Compact Drawer

**Behavior on edit:**
- New value applies immediately to next captain Activate Today action
- Already-recorded activations for today are unaffected (no retroactive change)
- AuditLog row written
- Banner on save: "Daily activation fee updated to {N} IQD. Effective for next activation."

---

#### 3.1.3 Room Settings — List Page

**Views:** Table

**Purpose:** Org-level defaults for Abriyah Room behavior. Per-zone overrides live in Zone Detail → Pricing.

**Rows:**

| Setting | Default Value | Validation |
|---|---|---|
| Default Max Riders per Room | 4 | range 2–6 |
| Default Max Wait Seconds | 300 | range 60–900 |
| Allow Women-Only Globally | true | bool |

**Row actions:** `[Edit]`

**Note:** Changing defaults does not retroactively update existing zones.

---

### 3.2 Sub-Module: Admin Users

#### 3.2.1 Admin Users — List Page

**Views:** Table

**Purpose:** Manage admin accounts that access the Beep Admin Dashboard. Roles: super-admin · operator · finance.

**Columns:**

| Column | Source | Default Visible |
|---|---|---|
| Name | admin user name | yes |
| Email | admin user email | yes |
| Role | enum (super-admin / operator / finance) | yes |
| Last Login | timestamp | yes |
| Status | active / disabled | yes |
| Created At | timestamp | no |

**Toolbar:** `[+ Invite Admin]` (opens Compact Drawer)

**Add Admin User form (Compact Drawer):**

| Field | Type | Required | Validation |
|---|---|---|---|
| Email | text | yes | valid email; not already-an-admin |
| Name | text | yes | ≤100 chars |
| Role | dropdown | yes | super-admin / operator / finance |
| Send Invite | toggle | default on | sends invite email via auth platform |

**On submit:** Auth platform creates admin user, sends invite email if toggled on. New row appears in list with status "invited" until first login → "active".

**Row actions:** `[Edit Role]` · `[Disable / Re-enable]` · `[Resend Invite]` (if status=invited) · `[Remove]` (super-admin only, with self-removal block per §4)

---

### 3.3 Sub-Module: App Settings

#### 3.3.1 General Settings — List Page

**Views:** Table

**Purpose:** Org-level app preferences (locale display, retention, contact info).

**Rows:**

| Setting | Default Value | Validation |
|---|---|---|
| Default Locale (Admin Dashboard) | `ar-IQ` | enum: ar-IQ / en |
| Mobile Apps Default Locale | `ar-IQ` (RTL) | enum: ar-IQ / en |
| Audit Log Retention (days) | 2555 (7 years) | range 365–3650 |
| Notification Log Retention (days) | 90 | range 30–365 |
| Support Phone | (org-configured) | E.164 phone |
| Support WhatsApp | (org-configured) | E.164 phone |
| Org Timezone | Asia/Baghdad | read-only (sourced from Org Setup; display only) |
| Currency | IQD | read-only |

**Row actions:** `[Edit]` (super-admin only; read-only rows have no edit)

---

## §4 Module-Scoped Business Rules

### 4.1 Defaults Are Not Retroactive

- **Applies to:** All Operations Foundations settings
- **Rule:** Editing a default value affects only entities (zones, activations) created AFTER the edit timestamp. Existing entities retain their original values.
- **Rationale:** Retroactive change would break audit-traceability of why a specific zone has a specific price.

### 4.2 Last Super-Admin Cannot Be Removed

- **Applies to:** Admin Users → Remove action OR Edit Role to non-super-admin
- **Rule:** If the system has only one super-admin, that admin cannot be removed or demoted. Error: "At least one super-admin must exist. Promote another admin first, then retry."
- **Rationale:** Prevents lockout of administrative control.

### 4.3 Self-Demotion Confirmation

- **Applies to:** Admin Users → Edit Role on own account
- **Rule:** A super-admin demoting themselves to operator/finance must confirm via modal: "You are demoting your own role. You will lose super-admin access on next login. Continue?"
- **Rationale:** Common user error; explicit confirmation prevents accidents.

### 4.4 Invite-Only Admin Creation

- **Applies to:** Add Admin User form
- **Rule:** New admins can only be created via invite (email sent through auth platform). No password-set-on-create flow.
- **Rationale:** Auth security best practice.

### 4.5 Read-Only Cross-App Settings

- **Applies to:** Org Timezone, Currency rows on General Settings
- **Rule:** These settings are owned by Org Setup (Business OS Core) and surfaced read-only here for operator awareness. Edit redirects to Org Setup app.
- **Rationale:** Cross-app ownership integrity.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- Org-level Operations Foundation defaults (pricing, fee, room settings)
- Admin user management (invite, role, disable, remove)
- General Settings (locale, retention, support contacts)
- Compact Drawer edit dialogs

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Per-zone pricing overrides | Zones module | Per-zone lives on Zone Detail |
| Captain Approval Workflow template config | Platform-level Automation Engine config (or future Setup tab if customizable) | At v1 the template is fixed |
| Org Timezone CRUD | Org Setup (Business OS Core) | Cross-app entity |
| Currency CRUD | Org Setup | Cross-app entity |
| City CRUD | Org Setup | Cross-app entity |
| Auth provider config | Auth Microservice | Platform-level |
| Notification template CRUD | Notification Center config (platform-level) | Templates are platform-managed |

### 5.3 Out of Scope (Future)

- **Custom Captain Approval template** (Horizon 2) — multi-step approval chain config
- **Per-city configuration** (M3 with multi-city) — same settings repeated per city
- **Feature flags / toggles** (Horizon 2) — toggle Abriyah on/off per city, etc.
- **API keys / integrations** (Horizon 1) — third-party SDK config (SMS provider, maps API, etc.)

---

## §6 Module Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Operations Foundations** | The Setup sub-module containing org-level defaults for pricing, daily activation fee, and room settings. Defaults are not retroactive — they apply only to entities created after the edit. | Pending merge |
| **Default Pricing** | The city-level Abriyah per-km + base fare values applied to new zones. Per-zone overrides live in Zone Detail. | Pending merge |
| **Daily Activation Fee Setting** | The org-level 2000 IQD daily fee written to new `CaptainDailyActivation` records. At v1 status=pending (no collection); at v2 collection ships with Online Payments. | Pending merge |
| **Last Super-Admin Lock** | The rule preventing removal/demotion of the only super-admin in the system to avoid administrative lockout. | Pending merge |

---

## Appendix A — CRI

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Cross-app Admin User | §6 Cross-App Entity References | ✓ |
| §2.1 Configuration entities | §6 + §4.11 + §4.8 + §10 | ✓ |
| §2.4 Captain Daily Activation Gate | §4.11, §8.2 | ✓ |
| §2.6 Multi-View | §4.7 | ✓ |

**Verdict:** PASS

---

**End of Beep Setup Module PRD V1.0.0**
