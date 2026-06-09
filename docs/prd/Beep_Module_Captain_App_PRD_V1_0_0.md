# Beep — Captain App PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · **Mobile Client Surface Standard** (Charter §4.15)

---

## §0 Document History

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release. 7 mobile flows. |

**Status:** **Approved** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+. **Milestone:** M1 (Foundation).

---

## §1 Module Overview

### 1.1 Purpose

The Captain App is Beep's **driver-facing mobile client surface**. Flutter (Android-first). Covers the captain's full lifecycle: registration · approval pending · daily activation · online toggle · trip + room queue · live trip · earnings. Implements the Daily Activation Gate (Charter §4.11) and the gender-driven women-only Abriyah eligibility (Charter §4.13).

### 1.2 Flow Inventory

Per Charter §3.4 + §4.15:

| # | Flow | Entry | Exit |
|---|---|---|---|
| 1 | Onboarding | First app open | Approval Pending screen (post-submit) |
| 2 | Approval Pending | After registration submit | Activate Today on approval push (or rejected screen) |
| 3 | Activate Today | First open of day after approval | Online Toggle enabled |
| 4 | Online Toggle | After Activate Today | Trip Queue (when online) |
| 5 | Trip Queue | While online | Live Trip on accept (or remains in queue) |
| 6 | Live Trip | Accept on trip / room | Earnings update on complete |
| 7 | Earnings | Earnings tab | (read-only summary surface) |

### 1.3 Package

**Core**. Free-Core; Online Payments at M3 changes Activate Today behavior (real charge).

### 1.4 Primary Personas

- **Karim** (Captain — primary) — daily driver, accepts both Regular and Abriyah trips
- **Layla** (Female Captain) — serves women-only Abriyah rooms; mixed rooms too

### 1.5 Acceptance Criteria

1. Given a new captain submits registration with all 3 required documents, then `Captain` record is created with status PENDING and the app transitions to Approval Pending screen.
2. Given admin approves the captain, then push notification arrives within ≤5s; app transitions to Activate Today screen on next open.
3. Given an APPROVED captain opens the app for the first time today, then "Activate Today" CTA shows the 2,000 IQD fee notice and `[تفعيل / Activate]` button.
4. Given the captain taps Activate, then `CaptainDailyActivation` row is created (status=pending at v1; v2 attempts charge), `beep.captain.activated_today` fires, and Online toggle becomes enabled.
5. Given the captain toggles Online, then they begin receiving trip + room queue items via WebSocket.
6. Given a female captain is online, when an OPEN women-only room exists in her current zone, then the room appears in her queue.
7. Given a male captain is online, when only women-only rooms exist in zone, then his queue is empty.
8. Given the captain accepts a Regular trip, then `beep.trip.accepted` fires, and the app transitions to Live Trip with navigation guidance to pickup.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `Captain` | **Primary identity entity** — created at onboarding | §6.4 |
| `CaptainDailyActivation` | Created on Activate Today | §6.6 |
| `Trip` | Read in queue; updated on accept / start / complete | §6.1 |
| `Room` | Read in queue (Abriyah); status changes via accept | §6.2 |
| `Zone` | Read for in-zone trip filtering | §6.3 |
| `User` | Read (rider name, phone) on Live Trip | §6.5 |
| `Rating` | Created on Trip Complete (captain rates rider) | §6.7 |

### 2.2 Events Published

| Event | Trigger Flow |
|---|---|
| `beep.captain.registered` | Submit registration |
| `beep.captain.activated_today` | Tap Activate Today |
| `beep.trip.accepted` | Tap Accept on trip queue item |
| `beep.trip.started` | Tap "Start trip" at pickup |
| `beep.trip.completed` | Tap "Complete" at drop-off |
| `beep.trip.cancelled` | Captain-initiated cancel |
| `beep.trip.rated` | Rate rider on Trip Complete |
| `beep.room.locked` | Captain accepts partial room |
| `beep.room.dispatched` | Captain confirms locked room (or room fills + captain assigned) |

### 2.3 Events Consumed (push-driven UI updates)

| Event | UI Update |
|---|---|
| `beep.captain.approved` | Push "You are approved" → transition to Activate Today |
| `beep.captain.rejected` | Push "Registration rejected" + reason → Rejected screen |
| `beep.captain.blocked` | Push "Account blocked" → force-logout |
| `beep.trip.requested` | Add to trip queue (filtered by online + in-zone) |
| `beep.room.opened` | Add to room queue (Abriyah; filtered by women-only eligibility) |
| `beep.room.joined` | Update rider count on existing room queue card |
| `beep.room.expired` | Remove from queue (if not yet accepted) |
| `beep.trip.cancelled` | Remove from queue OR (if accepted) push notification + UI update on Live Trip |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Captain Daily Activation Gate** | **Origin** — captain action triggers gate evaluation | §4.11, §8.2 |
| **Captain Approval Workflow** | **Origin** — captain registration submit | §4.10, §5.1 |
| **Abriyah Room Matching Engine** | Consumer — captain accept transitions room state | §8.1 |
| **Trip Cancellation Cascade** | Origin (when captain-initiated) | §8.3 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Captain | All flows |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| **Mobile Client Surface Standard** | Flow-driven; push-driven state; offline location ping queue | §4.15 |
| Captain Lifecycle State Machine | PENDING / APPROVED / REJECTED / BLOCKED gating | §4.5 |
| Captain Approval Pattern | Approval Pending screen reflects state | §4.10 |
| Daily Activation Gating Pattern | Activate Today flow + Online toggle dependency | §4.11 |
| Trip State Machine | Drives accept / start / complete actions | §4.3 |
| Room State Machine | Accept partial room → LOCKED → DISPATCHED | §4.4 |
| Women-Only Eligibility | `Captain.gender == 'female'` gates women-only room visibility | §4.13 |
| Cancellation Pattern | Captain cancel only allowed in ACCEPTED state | §4.14 |

### 2.7 Import Specs Used

None (captain registration is self-service via onboarding; bulk captain import lives in admin Captains module).

### 2.8 Sub-Agent Intents Used

None active at v1.

---

## §3 Flow Specifications

### 3.1 Flow — Onboarding (Registration)

**Trigger:** First app open

**Screens:**

```
Welcome → "ابدأ التسجيل / Start Registration"
     ↓
Phone OTP (same as Customer App)
     ↓
Personal Info: Name (AR + EN) · Gender (m / f — REQUIRED and LOCKED post-submit) · National ID
     ↓
Vehicle Info: Make · Model · Color · Plate
     ↓
Document Upload (3 required):
  · Driver License (JPG/PNG/PDF)
  · Car Registration (JPG/PNG/PDF)
  · Selfie with car (JPG/PNG)
     ↓
Review & Submit
     ↓
Transition to Approval Pending screen
```

**State transitions:**
- Submit → `Captain` record created (status=PENDING) + 3 Document records + `beep.captain.registered` emitted

**Push events emitted:** `beep.captain.registered`

**Validation:**
- Phone uniqueness (Charter §6.4 global key)
- Plate uniqueness
- Gender required (m/f — locked post-submit per Charter §4.13)
- All 3 documents required

---

### 3.2 Flow — Approval Pending

**Trigger:** Captain registered but status=PENDING

**Screens:**

```
Approval Pending screen:
  ┌────────────────────────────────────┐
  │ في انتظار الموافقة                  │
  │ (Waiting for approval)              │
  │                                     │
  │ Submitted: 2 hours ago              │
  │ Expected: within 24 hours           │
  │                                     │
  │ We'll notify you when approved.    │
  │                                     │
  │ [Contact Support]                   │
  └────────────────────────────────────┘
```

**Background subscription:** Push from `beep.captain.approved` OR `beep.captain.rejected`.

**On push approved:** Transition to Activate Today on next open.

**On push rejected:** Show Rejected screen with reason + "Contact Support" button.

---

### 3.3 Flow — Activate Today

**Trigger:** First open of day (Asia/Baghdad date rollover) for APPROVED captain with no `CaptainDailyActivation` for today

**Screens:**

```
Activate Today:
  ┌────────────────────────────────────┐
  │ تفعيل اليوم                          │
  │ (Activate Today)                    │
  │                                     │
  │ Daily activation fee: 2,000 IQD     │
  │                                     │
  │ At v1: "Fee recorded — collected   │
  │  with your weekly payout"           │
  │                                     │
  │ At v2: "Fee will be charged to      │
  │  your wallet"                       │
  │                                     │
  │ [تفعيل / Activate]                   │
  └────────────────────────────────────┘
```

**State transitions:**
- Tap Activate:
  - v1: Create `CaptainDailyActivation` row with status=pending → emit `beep.captain.activated_today` → enable Online toggle
  - v2: Attempt wallet/card charge → success: status=paid → enable Online toggle; failure: keep CTA visible with error

**Push events emitted:** `beep.captain.activated_today`

---

### 3.4 Flow — Online Toggle

**Trigger:** Successful Activate Today

**Screens:**

```
Online Toggle (status bar at top of app):
  ┌────────────────────────────────────┐
  │ Online   [●━━━]   Offline           │
  │                                     │
  │ When Online:                        │
  │  · Receive trip requests             │
  │  · Receive Abriyah room requests     │
  │  · GPS location pinged every 10s    │
  │                                     │
  │ Today's Activation: ✓ Paid 2000 IQD │
  └────────────────────────────────────┘
```

**Behavior:**
- Toggle Online → WebSocket subscription opens; GPS pinging starts
- Toggle Offline → unsubscribe; pinging stops

**Idle timeout:** No location ping for 5 min while marked online → auto-toggle Offline + alert.

---

### 3.5 Flow — Trip Queue

**Trigger:** Captain Online; incoming trip OR room requests

**Screens:**

```
Trip Queue (feed of incoming requests):

  ┌────────────────────────────────────┐
  │ NEW · Regular trip                   │
  │ Pickup: Al-Mansour, 1.2 km away     │
  │ Destination: Al-Karada, 5.3 km       │
  │ Est. fare: 4,000 IQD                │
  │ [Accept] [Decline]    ⏱ 15s         │
  └────────────────────────────────────┘

  ┌────────────────────────────────────┐
  │ NEW · Abriyah Room (Mixed)          │
  │ Zone: Al-Karada                     │
  │ Riders: 2 of 4 (filling)            │
  │ Wait: 1:30 of 5:00                  │
  │ Per-rider rates visible              │
  │ [Accept Room] [Wait for full]       │
  └────────────────────────────────────┘
```

**Accept actions:**
- Regular trip Accept → `beep.trip.accepted` → Live Trip flow
- Room Accept (partial) → `beep.room.locked` → Room enters LOCKED state; new joiners blocked; captain waits for confirm OR room fills
- Room Confirm (after locked) → `beep.room.dispatched` → Live Trip flow
- "Wait for full" → no state change; captain remains eligible until room fills or expires

**Filtering:**
- Trips outside captain's current zone (if captain has zone preference set) filtered out
- Women-only rooms filtered out for male captains (Charter §4.13)

**Decline:** No state change on trip; trip remains visible for other captains.

**Auto-timeout per item:** 15s for Regular trip; until room state changes for Abriyah.

**Push events emitted:** `beep.trip.accepted` · `beep.room.locked` · `beep.room.dispatched`

---

### 3.6 Flow — Live Trip

**Trigger:** Trip ACCEPTED OR Room DISPATCHED

**Screens:**

```
Live Trip:
  ┌────────────────────────────────────┐
  │ Trip TRIP-1234 · Abriyah · 4 riders │
  │                                     │
  │ [Map with route to pickup]           │
  │ Navigate via [Google Maps] [Waze]    │
  │                                     │
  │ Rider 1: Sara A.  📞 💬              │
  │ Rider 2: Layla M. 📞 💬              │
  │ Rider 3: ...                        │
  │ Rider 4: ...                        │
  │                                     │
  │ Status: En route to pickup 1         │
  │                                     │
  │ [Arrived at Pickup] [Cancel Trip]    │
  └────────────────────────────────────┘
```

**Sub-states + actions:**
1. En route to pickup → `[Arrived at Pickup]` → mark presence at pickup point
2. Boarding (per-rider check-in for Abriyah) → `[All Riders Boarded]`
3. In progress (driving to drop-offs) → `[Started Trip]` → emits `beep.trip.started`; status=IN_PROGRESS
4. Drop-off (per-rider for Abriyah) → `[Drop-off Complete]` per rider
5. Last drop-off → `[Complete Trip]` → emits `beep.trip.completed`; transition to Trip Complete

**Navigation:** Deep-link out to Google Maps or Waze with destination coordinates.

**Cancel:** Allowed in status=ACCEPTED only (before Start). Reason required. Charter §4.14.

**Push events emitted:** `beep.trip.started` · `beep.trip.completed` · `beep.trip.cancelled`

---

### 3.7 Flow — Earnings

**Trigger:** Tap Earnings tab in bottom nav (when online OR offline)

**Screens:**

```
Earnings:
  ┌────────────────────────────────────┐
  │ Today                                │
  │  Gross: 24,000 IQD                  │
  │  Minus Activation Fee: -2,000 IQD   │
  │  Net: 22,000 IQD                    │
  │                                     │
  │ This Week                            │
  │  Gross: 168,000 IQD                 │
  │  Activation Fees: -14,000 IQD       │
  │  Net: 154,000 IQD                   │
  │                                     │
  │ This Month                           │
  │  ...                                 │
  │                                     │
  │ Trip History →                       │
  └────────────────────────────────────┘
```

**Behavior:**
- Read-only summary
- Tap "Trip History →" → embedded list of completed trips with per-trip earnings
- At v1: gross = sum of cash collected; activation fees accrued (not really deducted since not collected); net is the "what cash you keep after weekly settlement"
- At v2: includes real wallet flow with proper accounting

---

## §4 Module-Scoped Business Rules

### 4.1 Daily Activation Gates Online Toggle

- **Applies to:** Online Toggle
- **Rule:** Online toggle is disabled (grayed out) until `CaptainDailyActivation` exists for today. Charter §4.11 enforced at UX level.
- **Rationale:** Hard gate enforced visibly.

### 4.2 Women-Only Room Visibility

- **Applies to:** Trip Queue
- **Rule:** Male captains never see women-only rooms in queue. Predicate: `room.room_type == 'mixed' OR captain.gender == 'female'`.
- **Rationale:** Charter §4.13 — gender-driven visibility filter.

### 4.3 Locked Room Blocks New Joiners

- **Applies to:** Room Accept action
- **Rule:** Accepting a partial room transitions it to LOCKED — no new riders can join. Captain has a configurable confirmation window (default 60s) to either confirm DISPATCHED or release back to OPEN.
- **Rationale:** Charter §4.4 — Room state machine.

### 4.4 Captain Cancel Restricted

- **Applies to:** Live Trip → Cancel
- **Rule:** Captain cancel only allowed in `Trip.status == ACCEPTED` (before Start). Once IN_PROGRESS, cancel is disabled — captain must complete or contact support.
- **Rationale:** Charter §4.14 — prevents mid-trip stranding.

### 4.5 Idle Online Timeout

- **Applies to:** Online state
- **Rule:** No location ping for 5 min while online → auto-Offline + alert. If captain was on an active trip, admin Needs Action queue gets a "Stuck Items" row.
- **Rationale:** Detect dropped sessions; protect rider experience.

### 4.6 Gender Locked Post-Registration

- **Applies to:** Captain Profile (any future edit surface)
- **Rule:** `Captain.gender` is read-only after registration submit. Changes require admin escalation (Charter §4.13 + Captains Module §4.5).
- **Rationale:** Women-only eligibility depends on gender consistency.

### 4.7 Offline Location Ping Queue

- **Applies to:** Online state with network drop
- **Rule:** Location pings queued locally during network drops; flushed on reconnect. Last commit position cached so backend can interpolate.
- **Rationale:** Iraqi 3G reliability; trip continuity.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- 7 mobile flows per §1.2
- Registration with document upload (3 required types)
- Approval Pending observability
- Daily Activation gating
- Online/Offline toggle + GPS pinging
- Trip + Room queue with auto-filtering
- Live Trip with navigation deep-links
- Earnings summary
- Captain → rider rating
- Native Call + WhatsApp + in-app chat with rider
- Bilingual UI (AR primary RTL; EN secondary)

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Admin captain approval | Captains module (admin) | Admin-driven |
| Daily Activation Fee setting | Setup module (admin) | Configuration is admin |
| Trip CRUD | Backend Trip Service | |
| Room creation | Backend Room Matching Engine | |
| Zone polygon definition | Zones module (admin) | |
| Earnings payout mechanism | Out at v1 (cash settlement weekly via WhatsApp ops); M3+ with Online Payments adds wallet flow | |

### 5.3 Out of Scope (Future)

- **Real fee collection** (M3) — Activate Today flow attempts wallet charge
- **Wallet tab** (M3) — view balance + history
- **Masked rider phone numbers** (M3)
- **Per-trip incentive notifications** (Horizon 2) — bonus for filled Abriyah rooms
- **Earnings analytics + trend graphs** (Horizon 2)
- **Self-service zone preference / availability** (Horizon 2)
- **AI-suggested optimal queue routing** (Horizon 2 via Sub-Agent)

---

## §6 Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Trip Queue** | The Captain App feed of incoming Regular trip requests and Abriyah room requests visible to the captain while online. Filtered by location + gender (women-only filter). | Pending merge |
| **Activate Today Screen** | The first-of-day screen requiring captain confirmation of the 2,000 IQD daily activation fee before Online toggle is enabled. | Pending merge |
| **Online Toggle** | The Captain App switch enabling trip queue subscription. Gated by Daily Activation. | Pending merge |
| **Locked Room Confirmation** | The 60s window after a captain accepts a partial Abriyah room during which they confirm DISPATCHED or release back to OPEN. | Pending merge |
| **Offline Location Ping Queue** | The pattern of caching GPS pings during network drops and flushing on reconnect. | Pending merge |

---

## Appendix A — CRI

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entities | §6.1-§6.7 | ✓ |
| §2.2 Events (9 published) | §5.5.1 | ✓ |
| §2.3 Events consumed | §5.5.1 + §5.5.3 | ✓ |
| §2.4 Captain Daily Activation Gate | §4.11, §8.2 | ✓ |
| §2.4 Captain Approval Workflow | §4.10, §5.1 | ✓ |
| §2.4 Abriyah Room Matching | §8.1 | ✓ |
| §2.4 Trip Cancellation Cascade | §8.3 | ✓ |
| §2.6 Mobile Client Surface Standard | §4.15 | ✓ |
| §2.6 Captain Lifecycle State Machine | §4.5 | ✓ |
| §2.6 Captain Approval Pattern | §4.10 | ✓ |
| §2.6 Daily Activation Gating | §4.11 | ✓ |
| §2.6 Trip State Machine | §4.3 | ✓ |
| §2.6 Room State Machine | §4.4 | ✓ |
| §2.6 Women-Only Eligibility | §4.13 | ✓ |
| §2.6 Cancellation Pattern | §4.14 | ✓ |

**Verdict:** PASS

---

**End of Beep Captain App PRD V1.0.0**
