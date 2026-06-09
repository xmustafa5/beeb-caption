# TORCH Beep — Sub-Agent PRD V1.0.0 (Stub)

**Conforms to:** Sub-Agent PRD Standard V1.0.1+ (§0–§2 populated; §3–§10 deferred to Full version at the AI / Intelligence Layer milestone — Stub mode)

---

## §0 Document History

| Version | Date | Author | Summary of Changes | Compatible Charter Version | Triggered By |
|---|---|---|---|---|---|
| V1.0.0 | 2026-05-19 | Operations PM | Base **Stub** — §0–§2 populated (sub-agent identity + capability matrix headline; 0 active capabilities at v1). §3–§10 deferred to Full version at the AI / Intelligence Layer milestone (Horizon 2 per Charter §11). | V1.0.0+ | Phase 7c-Stub (initial Beep release) |

**Status:** **Approved (Stub)** (V1.0.0 — 2026-05-19).

**Compatible Charter Version:** V1.0.0+.

**Milestone:** **Horizon 2 (Deferred)** per Implementation Roadmap V1.0 §2. No active AI features at v1 / v2; promotion to Full happens when AI / Intelligence Layer milestone is approved.

---

## §1 Sub-Agent Overview

### 1.1 Identity

| Field | Value |
|---|---|
| **Sub-Agent ID** | `beep.agent` |
| **Display Name** | AI Beep Assistant |
| **Owning App** | Beep |
| **Charter Reference** | §5.3 in `Beep_App_Charter_V1.0.0.md` |
| **Orchestrator Registration Date** | 2026-05-19 (registered as Stub at M1 release for forward compatibility) |
| **Current Lifecycle Status** | Stub — registered with 0 active capabilities |

### 1.2 Behavior Statement

At v1 and v2, the Beep Sub-Agent is **registered with no active capabilities** — it exists in the AI Orchestrator's registry as a forward-compatible placeholder. The ✨ panel is hidden across the Admin Dashboard and Mobile Client Surfaces. No conversational features, no inline AI features, no cross-app delegation edges are active.

When the AI / Intelligence Layer milestone is approved (Charter §11 Horizon 2), this PRD will be promoted from Stub to Full with three candidate capability clusters:

1. **Fraud Detection** — flag unusual trip patterns (e.g., circular routes, impossible drive times) and document-mismatch on Captain registration (e.g., selfie / license photo divergence)
2. **Surge Pricing Suggestions** — analyze zone demand patterns and suggest temporary per-km rate adjustments per zone for admin review
3. **Captain-Match Optimizer** — improve Abriyah room dispatch quality when multiple captains are simultaneously in-zone (today: first-accept-wins; future: optimize for rider wait time + captain proximity)

Until Full promotion, the agent **takes no calls and exposes no surfaces**. Forward-compatible registration ensures Horizon 2 ships without re-architecture of the platform AI integration.

### 1.3 Scope Boundaries

**In scope (eventual Full version — not active at Stub):**
- Read access to all 9 Beep-owned entities + 4 cross-app entity references per Charter §6
- Fraud signal generation (flags only — no automatic state changes; surfaces in Dashboard → Needs Action for human review)
- Pricing suggestion generation (suggestions only — admin must confirm; no automatic Zone.abriyah_per_km_iqd writes)
- Room dispatch optimization (suggestions to backend matching engine — does not override admin-controlled rules)

**Out of scope (forever):**
- Direct payment processing or fee collection — that's the Online Payments add-on (Charter §11 Horizon 1, ships at M3)
- Automatic captain approval — registration approval stays single-step admin action per Charter §4.10
- Automatic zone pricing changes — every pricing change must have an admin actor for AuditLog accountability
- Cross-tenant data access — Beep is single-tenant at v1; the agent never reads outside the org

**Out of scope at v1 / v2 specifically:**
- All conversational ✨ panel intents (deferred to Full)
- All inline AI buttons (no AI feature surfaces designed for v1 / v2 per Charter §4.1)
- All cross-app delegation edges (no other-app agents to delegate to / from at v1)

### 1.4 Audience

Per Charter §1.5 personas — Sara (Rider) · Karim (Captain) · Layla (Female Captain) · Omar (Operator/Admin) · Yousef (Finance read-only). At Stub, **none of these personas interact with the agent**. When Full activates, Omar (Operator) and Yousef (Finance) are the primary admin-side audience for Fraud Detection and Surge Pricing surfaces; Sara / Karim / Layla benefit indirectly via better matching.

No inbound delegating agents at v1 / v2. (No other apps in the Beep ecosystem at v1; multi-app ecosystem is a far-horizon possibility.)

---

## §2 Capability Matrix

### 2.1 Capabilities (0 active + 0 Reserved at v1)

| # | Capability ID | Type | One-line Scope | Entities / Operations | Write-State Rule | RBAC Filter | Idempotency | Add-on Gate | ICTP |
|---|---|---|---|---|---|---|---|---|---|

*(No capability rows. The table is intentionally empty at Stub. Forward-compatible row format preserved for Horizon 2 Full promotion.)*

**Active capability count:** **0** at v1 / v2. Horizon 2 candidates listed below (not yet active):

**Horizon 2 Candidate Capabilities (NOT ACTIVE — for Full version authoring reference only):**

| # | Candidate Capability ID | Candidate Type | Candidate Scope | Charter §4.1 Source |
|---|---|---|---|---|
| 1 | `beep.query.detect_fraud_signals` | QUERY | Read Trip + Captain + Document patterns; return fraud probability scores per entity | Charter §4.1 Horizon 2 #1 |
| 2 | `beep.query.suggest_surge_pricing` | QUERY | Read Zone demand / supply patterns; return per-zone per-km rate adjustment suggestions | Charter §4.1 Horizon 2 #2 |
| 3 | `beep.execute.optimize_room_dispatch` | EXECUTE | Given an OPEN Room and N captains in-zone, return optimal dispatch ordering | Charter §4.1 Horizon 2 #3 |

### 2.2 Charter §5.3 Headline Mirror

The Charter §5.3 capability headline table summarizes the **0 active capabilities** into 4 rows by capability type. The summary mirrors §2.1 above:

| Capability Type | Count | Scope (headline) |
|---|---|---|
| QUERY | **0** | *(none active at v1 — Horizon 2: fraud signals, surge pricing suggestions)* |
| CREATE | **0** | *(none active at v1)* |
| UPDATE | **0** | *(none active at v1)* |
| EXECUTE | **0** | *(none active at v1 — Horizon 2: room dispatch optimization)* |

**Integrity rule:** When this PRD is promoted from Stub to Full, the Charter §5.3 capability headline must be updated in lock-step to reflect the new active capability counts. Both update via a coordinated Charter minor bump + Sub-Agent PRD minor bump.

### 2.3 Write-State Rules (cross-cutting — forward-compatible)

These rules will apply across all CREATE / UPDATE / EXECUTE capabilities when the agent is promoted to Full. Stated here for forward-compatible reference:

- **No automatic state changes on Trip, Room, Captain, Zone, or User.** All AI signals are suggestions surfaced for human review (Dashboard → Needs Action).
- **AuditLog never modified.** All agent-generated signals write new AuditLog rows with `actor_role = 'ai_agent'`; existing rows are never edited or deleted.
- **Direct event publication forbidden.** The agent never publishes Event Bus events directly. Capabilities trigger event publication per Charter §5.5 only when state actually changes (which is admin-confirmed, not agent-initiated).
- **Bulk operations must enumerate qualifying/disqualifying subset** before confirmation, citing state-machine ineligibility per Charter §4.3 + §4.4 + §4.5.

### 2.4 Out-of-Band Capabilities

Capabilities the agent **cannot** perform under any circumstance (forward-compatible declaration):

- **Direct Trip / Room state machine transitions.** Trip and Room state changes per Charter §4.3 + §4.4 are driven by user actions (rider / captain / system timeout) — never by the agent.
- **Direct Captain approval / rejection / blocking.** Per Charter §4.10, captain registration approval is a single-step admin action — the agent can flag suspicious registrations but cannot approve or reject.
- **Direct Zone pricing edits.** Per Charter §8.4, pricing changes require admin actor for AuditLog accountability. Agent surfaces suggestions; admin clicks "Apply" → admin is the actor.
- **Direct payment processing or fee collection.** Payment platform integration is the Online Payments add-on responsibility, not the AI sub-agent's.
- **Direct AuditLog manipulation.** Audit trail is append-only per Charter §5.5.4.
- **Cross-tenant data access.** Beep is single-tenant at v1; no multi-tenant aggregation regardless of future expansion.
- **Approval workflow modification.** The agent cannot change the Captain Approval template per Charter §5.1.
- **Import Spec definition modification.** Specs are declared in Charter §5.6.1; the agent only invokes them.

---

## §3 Intent Catalog

**DEFERRED TO FULL VERSION.** At Stub, the agent has no intents. The §3 Intent Table will be authored at the AI / Intelligence Layer milestone (Horizon 2) with intent IDs in the `beep.{query|create|update|execute|delegate}.{specific}` format.

Forward-compatible Horizon 2 intents that may be authored:

| Candidate Intent ID | Category | Sample Utterance (admin Operator persona) | Routes To |
|---|---|---|---|
| `beep.query.fraud_signals` | Query | "Show flagged captains" / "Show flagged trips from last 7 days" | Candidate Capability #1 |
| `beep.query.zone_surge_suggestions` | Query | "What zones might need pricing adjustments today?" | Candidate Capability #2 |
| `beep.query.captain_anomalies` | Query | "Which captains have unusual trip patterns?" | Candidate Capability #1 |

### 3.2 Intent Disambiguation Rules

**DEFERRED TO FULL.** Standard 5-rule disambiguation pattern from the Sub-Agent PRD template will apply.

### 3.3 Versioning & Deprecation

**Deprecated Intents Table:** *(empty — no intents to deprecate at Stub)*

| Deprecated Intent ID | Replaced By | Deprecation Date | Sunset Date | Reason |
|---|---|---|---|---|

---

## §4 Conversational Flows

**DEFERRED TO FULL VERSION.** No conversational flows at Stub.

---

## §5 Inline Features

**DEFERRED TO FULL VERSION.** Per Charter §4.1, Beep has 0 active AI features at v1 / v2. The inline feature mapping table will be authored when Horizon 2 candidates are promoted to Charter §4.1 active rows.

Charter §4.1 Horizon 2 candidates (not active) for future inline mapping reference:

| Charter §4.1 # (future) | Feature | Likely Surface | Capability | UX Pattern |
|---|---|---|---|---|
| H2-1 | Fraud Detection | Dashboard → Needs Action (new tab: "Flagged Items") | Candidate Capability #1 | Inline review queue with confidence scores + dismiss/escalate actions |
| H2-2 | Surge Pricing Suggestions | Zones → Zone Detail → Pricing tab (header ✨ icon) | Candidate Capability #2 | Inline suggestion chip with "Apply" / "Dismiss" actions; auto-fills proposed rate into edit form |
| H2-3 | Captain-Match Optimizer | Operations → Live Rooms (per-room ✨ icon) | Candidate Capability #3 | Inline ordered list of suggested captains for a Room with rationale |

---

## §6 Cross-App Delegation

**DEFERRED TO FULL VERSION.** No active delegation edges at v1 — Beep is the only TORCH app in the Beep ecosystem at v1; no other-app agents exist to delegate to / from.

If multi-app ecosystem develops (e.g., Beep Delivery sub-vertical per Charter §11 Horizon 3), inbound delegation from `beep-delivery.agent` to this agent may be authored.

### 6.1 Outbound Delegation

*(empty at Stub)*

### 6.2 Inbound Delegation

*(empty at Stub)*

### 6.3 Delegation Rules

**DEFERRED TO FULL.** Standard rules from Sub-Agent PRD template will apply.

### 6.4 Provisional Edges

*(empty at Stub)*

---

## §7 Prompts & Guardrails

**DEFERRED TO FULL VERSION.** No system prompt anchors, refusal patterns, tone, or do/don't list authored at Stub because the agent takes no calls.

When promoted to Full, the prompt anchors will include:

- **Identity anchor:** "You are the AI Beep Assistant…"
- **Capability anchor:** enumerated list of §2.1 active capabilities (currently empty)
- **RBAC anchor:** "You operate within the calling admin's effective permissions (super-admin / operator / finance read-only)…"
- **State-machine anchor:** "Trip, Room, Captain state machines are user-driven; agent surfaces signals, never transitions…"
- **Audit anchor:** "Every agent-surfaced signal writes an AuditLog row with `actor_role = 'ai_agent'`…"

---

## §8 Graceful Degradation & Lifecycle

### 8.1 Registration & Deregistration

Even at Stub, Beep registers `beep.agent` with the AI Orchestrator at app activation (M1 release). The registration declares:

- Sub-Agent ID: `beep.agent`
- Active capabilities: 0
- Available capabilities: 0 (no exposed surfaces)
- ✨ panel visibility: hidden

This **forward-compatible registration** ensures that when Horizon 2 capabilities are added, the orchestrator integration is already in place — no platform-level deployment needed, only Sub-Agent PRD content updates.

### 8.2 Capability Refresh (Orchestrator-Mediated)

The Sub-Agent does **not** subscribe to platform events directly. The AI Orchestrator subscribes on its behalf and forwards `capability_refresh` signals. At Stub with 0 capabilities, refreshes are no-ops; the contract is preserved for Full promotion.

### 8.3 Subscription Lapse Behavior

When AI Orchestrator subscription lapses: no visible effect on Beep at Stub (✨ panel already hidden, no inline AI buttons exist). When promoted to Full, the standard subscription-lapse behavior from the template applies — ✨ panel suppresses, inline AI buttons disable with placeholder, ICTP-style system-initiated paths (none at v1) continue.

### 8.4 Migration / Agent Version Bumps

The first major version bump for this Sub-Agent PRD will be the Stub → Full promotion at the Horizon 2 milestone. That bump will be a **minor version** (V1.0.0 → V1.1.0) because it adds capabilities without renaming or removing any (there are none to rename or remove).

### 8.5 Mid-Flow Role Change Behavior

**Not applicable at Stub** — no flows exist. Forward-compatible declaration: when Full activates, the standard `role_change_abort` pattern from the template will apply.

---

## §9 Evaluation Plan

**DEFERRED TO FULL VERSION.** No eval sets at Stub because no capabilities to evaluate.

When promoted to Full, eval sets will be authored per the standard structure (precision / recall / state-machine compliance / tool call success).

### 9.4 Out-of-Scope for this PRD

- Eval harness implementation
- Labeled-data management process
- Prompt content (lives versioned in the eval harness)

---

## §10 Glossary Additions

| Term | Definition |
|---|---|
| **Forward-compatible registration** | The pattern by which the Beep Sub-Agent registers with the AI Orchestrator at app activation even with 0 active capabilities. Preserves the integration contract so Horizon 2 capabilities can be added via PRD update only, without platform redeployment |
| **Stub-only Sub-Agent** | A Sub-Agent PRD where §0–§2 are populated for contract preservation but the agent has no active capabilities, intents, flows, or inline features. Beep ships in this mode at v1 / v2 because the AI / Intelligence Layer milestone is on Horizon 2, not on the v1 / v2 critical path |
| **Horizon 2 candidate capability** | A capability documented in this PRD for forward reference (in §2.1 sub-table + §5 sub-table) but not registered as active. Not callable; not visible in ✨ panel; included only for Full-promotion authoring guidance |

---

**End of Beep Sub-Agent PRD V1.0.0 (Stub)**
