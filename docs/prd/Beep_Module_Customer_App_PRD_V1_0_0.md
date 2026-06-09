# Beep — Customer App PRD V1.0.0

**Conforms to:** Module PRD Standard V1.4.1+ · **Mobile Client Surface Standard** (Charter §4.15) — flows, not list pages

---

## §0 Document History

| Version | Date | Summary |
|---|---|---|
| V1.0.0 | 2026-05-19 | Base version — initial release. 7 mobile flows. |

**Status:** **Approved** (V1.0.0 — 2026-05-19). Compatible with Charter V1.0.0+. **Milestone:** M1 (Foundation).

---

## §1 Module Overview

### 1.1 Purpose

The Customer App is Beep's **rider-facing mobile client surface**. Built on Flutter (Android-first per Iraq market), it provides the rider's end-to-end experience: phone-OTP onboarding · home screen with two trip-type CTAs (Regular · Abriyah) · booking flows with map-based pickup/destination · waiting / live trip / completion + rating. It is a flow-driven surface (not a list-page module) — see Charter §4.15.

### 1.2 Flow Inventory (replaces sub-modules)

Per Charter §3.4 + §4.15:

| # | Flow | Entry | Exit |
|---|---|---|---|
| 1 | Onboarding | First app open | Home (gender optional, required for women-only Abriyah) |
| 2 | Home | App open after onboarding | Booking flow OR Profile/History sub-screen |
| 3 | Regular Booking | Tap "Regular" on Home | Live Trip on captain accept; Cancel returns to Home |
| 4 | Abriyah Booking | Tap "عبريه" on Home | Waiting Room on Join Room; Cancel returns to Home |
| 5 | Waiting Room | After Join Room | Live Trip on dispatch; Cancel returns to Home |
| 6 | Live Trip | Captain accepted (Regular) OR Room dispatched (Abriyah) | Trip Complete & Rate on drop-off |
| 7 | Trip Complete & Rate | Drop-off complete | Home |

### 1.3 Package

**Core**. Free-Core package; Online Payments add-on activates Wallet flow at M3.

### 1.4 Primary Personas

- **Sara** (Rider — primary persona) — quick neighborhood Abriyah trips
- Any female rider — women-only Abriyah eligible
- New customers — onboarding flow

### 1.5 Acceptance Criteria

1. Given a first-time user opens the app, when they complete the OTP step, then they land on Home with both Regular and Abriyah CTAs visible.
2. Given a female-registered user taps Abriyah, when the zone supports women-only (`allow_women_only=true`), then a "Women-only" toggle is visible above the booking action.
3. Given a male user (or unset gender) opens Abriyah booking, then the women-only toggle is suppressed.
4. Given a user is in an OPEN Abriyah room, when 3 more riders join in the same zone+room_type, then the room status broadcast updates within ≤2s and the trip transitions to ACCEPTED with captain assigned.
5. Given a Live Trip is active, then the rider sees real-time captain location, ETA, in-app chat, native Call + WhatsApp buttons (Call opens phone dialer; WhatsApp opens wa.me with pre-filled trip ID).
6. Given a trip completes, when the rider rates 4 stars with no comment, then `Rating` row is written, `beep.trip.rated` fires, and rider returns to Home.
7. Given the device is offline mid-trip, when network restores, the trip status syncs from backend and the screen updates without manual refresh.

---

## §2 Charter References

### 2.1 Entities Used

| Entity | Role | Charter Reference |
|---|---|---|
| `User` | **Primary identity entity** — created at onboarding | §6.5 |
| `Trip` | Created on booking submit; read throughout flow | §6.1 |
| `Room` | Created/joined on Abriyah booking; read in Waiting Room | §6.2 |
| `Zone` | Read for Abriyah zone detection + pricing display | §6.3 |
| `Captain` | Read (name, phone, photo, plate) on Live Trip | §6.4 |
| `Rating` | Created on Trip Complete | §6.7 |

### 2.2 Events Published

| Event | Trigger Flow |
|---|---|
| `beep.trip.requested` | Booking submit (both Regular and Abriyah) |
| `beep.trip.cancelled` | Rider-initiated cancel from Booking / Waiting Room / Live Trip |
| `beep.trip.rated` | Rate action on Trip Complete |
| `beep.room.joined` | Joining an existing OPEN room (Abriyah) |
| `beep.room.opened` | Creating a new room when no OPEN room matches (Abriyah) |

### 2.3 Events Consumed (push notification triggered UI updates)

| Event | UI Update |
|---|---|
| `beep.trip.accepted` | Push notification "Captain accepted" → transition to Live Trip |
| `beep.trip.started` | UI update: "Captain has started the trip" |
| `beep.trip.completed` | Transition to Trip Complete & Rate flow |
| `beep.trip.cancelled` | Push: "Trip cancelled" + reason → return to Home |
| `beep.room.dispatched` | Push: "Room dispatched" → transition to Live Trip |
| `beep.room.expired` | Push: "No captain available — please try again" → return to Home |
| `beep.zone.updated` | Invalidate zone-pricing cache (silent) |

### 2.4 Cross-Module Flows This Module Participates In

| Flow | Role | Charter Reference |
|---|---|---|
| **Abriyah Room Matching Engine** | **Origin** — rider's Join Room is the entry point | §8.1 |
| **Trip Cancellation Cascade** | **Origin** — rider-initiated cancel triggers cascade | §8.3 |
| **Zone Pricing Update Propagation** | **Consumer** — receives cache invalidation push | §8.4 |

### 2.5 Roles Referenced

| Role | Usage |
|---|---|
| Rider (Customer) | All flows |

### 2.6 Patterns Applied

| Pattern | Usage | Charter Reference |
|---|---|---|
| **Mobile Client Surface Standard** | Flow-driven; native gesture; push-driven state updates; offline action queue | §4.15 |
| Trip State Machine | Status drives screen transitions | §4.3 |
| Room State Machine | Waiting Room subscribes to room status | §4.4 |
| Women-Only Eligibility | Predicate `user.gender == 'female'` gates women-only toggle visibility | §4.13 |
| Per-Rider Fare Independence | Fare estimate displays per-rider for the current user | §4.12 |
| Cancellation Pattern | Allowed states + reason capture per §4.14 | §4.14 |
| Cross-Surface Boundary Rules | API + push only — no direct DB access | §4.9 |

### 2.7 Import Specs Used

None.

### 2.8 Sub-Agent Intents Used

None active at v1.

---

## §3 Flow Specifications

### 3.1 Flow — Onboarding

**Trigger:** First app open (no User record exists for device)

**Screens:**

```
Welcome (logo + "ابدأ" / "Start")
     ↓
Phone Entry ("+964 7XX XXX XXXX")
     ↓
OTP Verification (6-digit code)
     ↓
Gender Selection (Male · Female · "أكمل لاحقاً" / "Complete later")
     ↓
Name (optional at this step; can complete in Profile later)
     ↓
Home
```

**State transitions:**
- OTP success → `User` record created (status active; gender=unset if "Complete later")
- AuditLog: registration entry written

**Push events emitted:** None at v1 (no platform-level user creation event needed).

**Offline behavior:** Onboarding requires network for OTP. Offline → "Connect to internet to verify phone."

---

### 3.2 Flow — Home

**Trigger:** App open with active User session

**Screens:**

```
Home — 2 big CTAs stacked:
  ┌──────────────────────────────┐
  │   عادي (Regular)              │
  │   Standard ride               │
  └──────────────────────────────┘
  ┌──────────────────────────────┐
  │   عبريه (Abriyah)             │
  │   Shared trip · cheaper       │
  └──────────────────────────────┘

  Bottom nav: [Home] [History] [Profile]
```

**Profile sub-screen:** Name · Phone · Gender · `[Edit]` per field · Logout

**History sub-screen:** Embedded list of completed trips with date, fare, captain, rating

---

### 3.3 Flow — Regular Booking

**Trigger:** Tap "Regular" on Home

**Screens:**

```
Map (centered on current GPS)
     ↓
Place Pickup Pin (draggable; default = GPS)
     ↓
Place Destination Pin (search-as-type address OR drop on map)
     ↓
Fare Estimate display: "Regular trip · X.X km · ~Y,YYY IQD"
     ↓
[طلب / Request] button
     ↓
Searching for captain… (waiting screen with cancel)
     ↓
On captain accept → Live Trip flow
On no captain in 90s → "No captains available. Please try again."
On user cancel → return to Home; emit beep.trip.cancelled
```

**State transitions:**
- Submit creates `Trip` with type=REGULAR, status=REQUESTED, emits `beep.trip.requested`
- Backend broadcasts to captains in area; first-accept-wins
- Accept → status=ACCEPTED, push to rider

**Push events emitted:** `beep.trip.requested` on submit · `beep.trip.cancelled` on user cancel

---

### 3.4 Flow — Abriyah Booking

**Trigger:** Tap "عبريه" on Home

**Screens:**

```
Zone Detection (GPS lookup against Zone.polygon via ST_Contains)
     │
     ├── In zone (abriyah_enabled) →
     │       Show "You are in Zone {name} · per-km rate {N} IQD"
     │       ↓
     │       Pickup Pin (draggable inside zone; rejection if dragged outside)
     │       ↓
     │       Destination Pin (search OR drop; must be inside same zone)
     │       ↓
     │       Room Type selection:
     │         · Mixed (default)
     │         · Women-only [visible only if user.gender==female AND zone.allow_women_only==true]
     │       ↓
     │       Fare Estimate: "Your fare: X.X km × {N} IQD = ~Y,YYY IQD"
     │       (per-rider independence note: "Each rider pays their own fare separately")
     │       ↓
     │       [انضم لغرفة / Join Room] button
     │       ↓
     │       → Waiting Room flow
     │
     └── Not in zone OR zone is regular_only →
             "عبريه غير متوفرة في هذه المنطقة"
             ("Abriyah is not available in this area")
             [↩ Back to Home]
```

**State transitions:**
- Pickup or destination dragged outside zone polygon → in-line error + auto-snap back
- Submit → backend Room Matching Engine (Charter §8.1) → either JOIN existing room or CREATE new
- Emits `beep.room.joined` or `beep.room.opened` + `beep.trip.requested` (status=MATCHED)

**Push events emitted:** `beep.trip.requested` · `beep.room.joined` OR `beep.room.opened`

**Error handling:** Distance computation failure → falls back to haversine; warning indicator on estimate.

---

### 3.5 Flow — Waiting Room

**Trigger:** Successful Join Room

**Screens:**

```
Waiting Room screen:
  ┌────────────────────────────────────┐
  │ Zone: Al-Karada · Mixed Room        │
  │                                     │
  │ Riders: 2 of 4                      │
  │ ▮▮▯▯                                │
  │                                     │
  │ Waiting for captain...               │
  │ ⏱ 2:13 / 5:00                       │
  │                                     │
  │ [إلغاء / Cancel]                     │
  └────────────────────────────────────┘
```

**Live updates (Firebase RTDB subscription on Room state):**
- Rider count chip updates as others join
- Captain assignment notification when LOCKED or DISPATCHED
- Wait time progress bar

**State transitions:**
- Room → DISPATCHED → transition to Live Trip
- Room → EXPIRED → "No captain available" screen → return to Home
- User cancel → exit room (slot reopens), trip → CANCELLED, return to Home

**Push events emitted:** `beep.trip.cancelled` on user cancel.

---

### 3.6 Flow — Live Trip

**Trigger:** Trip status → ACCEPTED (Regular) OR Room DISPATCHED (Abriyah)

**Screens:**

```
Live Trip screen:
  ┌────────────────────────────────────┐
  │ Captain: Karim H. (4.8★)            │
  │ Car: Toyota Corolla · Plate 12345   │
  │ ETA: 4 min                          │
  │                                     │
  │      [Map with captain pin →        │
  │       moving toward pickup]         │
  │                                     │
  │ [📞 Call] [💬 WhatsApp] [💬 Chat]   │
  │                                     │
  │ [إلغاء / Cancel]                     │
  └────────────────────────────────────┘
```

**Sub-states within Live Trip:**
1. Captain en route to pickup (ACCEPTED)
2. Captain arrived at pickup ("Captain is here" banner)
3. Trip in progress (IN_PROGRESS — captain marked started)
4. Approaching drop-off

**Live updates:** Captain pin position via WebSocket; trip status changes via push.

**Actions:**
- `[📞 Call]` → native phone dialer (Captain.phone visible at v1; masked at v2 with Online Payments)
- `[💬 WhatsApp]` → `wa.me/{captain_phone}?text={trip_id}`
- `[💬 Chat]` → in-app chat (rider↔captain only; Abriyah 1-to-N chat deferred to Horizon 2)
- `[Cancel]` → only allowed if status ∈ {ACCEPTED} (per Charter §4.14); reason dialog

**State transitions:**
- Status → COMPLETED → transition to Trip Complete & Rate flow

**Push events emitted:** `beep.trip.cancelled` on user cancel.

---

### 3.7 Flow — Trip Complete & Rate

**Trigger:** Trip status → COMPLETED

**Screens:**

```
Trip Complete:
  ┌────────────────────────────────────┐
  │ Trip Complete                        │
  │                                     │
  │ Captain: Karim H.                   │
  │ Distance: 4.2 km                    │
  │ Your Fare: 4,200 IQD (cash)         │
  │                                     │
  │ Rate your captain:                  │
  │ [★ ★ ★ ★ ★]                          │
  │                                     │
  │ Comment (optional):                 │
  │ [text field]                        │
  │                                     │
  │ [إرسال / Submit] [تخطي / Skip]       │
  └────────────────────────────────────┘
```

**State transitions:**
- Submit → `Rating` row written + `beep.trip.rated` emitted → return to Home
- Skip → return to Home (rating editable later from History up to 7 days)

**Push events emitted:** `beep.trip.rated` on submit.

---

## §4 Module-Scoped Business Rules

### 4.1 Zone Containment Enforced At Pin Drop

- **Applies to:** Abriyah Booking — pickup and destination pin placement
- **Rule:** Both pickup and destination pins must lie inside `Zone.polygon` (verified via backend `ST_Contains` on every drag-stop). Outside-zone drops snap back with vibration + toast "Pin must be inside the zone."
- **Rationale:** Hard enforcement at the UX layer prevents invalid trips reaching the backend.

### 4.2 Women-Only Toggle Visibility Predicate

- **Applies to:** Abriyah Booking
- **Rule:** Women-only toggle visible iff `User.gender == 'female' AND Zone.allow_women_only == true`. For male or gender-unset users, the toggle is suppressed (not just disabled). For gender-unset female users, the booking screen prompts: "Set your gender to access women-only Abriyah."
- **Rationale:** Charter §4.13 predicate enforcement; reduces visual clutter for non-eligible users.

### 4.3 Fare Estimate Is Indicative

- **Applies to:** Booking flows
- **Rule:** Fare estimate displayed before request is indicative — actual fare is recomputed at trip completion using actual distance traveled. Disclaimer: "Final fare may vary based on actual route."
- **Rationale:** Routing engine variance + traffic detours.

### 4.4 Cancellation Allowed States

- **Applies to:** All flows
- **Rule:** Rider cancel allowed when `Trip.status ∈ {REQUESTED, MATCHED, ACCEPTED}` (not IN_PROGRESS). Per Charter §4.14. Cancel reason captured as enum.
- **Rationale:** Mid-trip cancel would strand captain mid-route.

### 4.5 Offline Action Queue

- **Applies to:** All flows
- **Rule:** When offline, user actions (Rate, Cancel) are queued locally and flushed on reconnect. Live Trip continues passively (last-known state cached).
- **Rationale:** Iraqi 3G reliability — mobile-first resilience.

### 4.6 Per-Rider Fare Display

- **Applies to:** Abriyah Booking · Trip Complete
- **Rule:** Fare displayed is the user's own fare (their distance × zone rate + base fare). Per Charter §4.12 — no split / shared total visible. Disclaimer on first Abriyah use: "Each rider pays their own fare based on their own distance."
- **Rationale:** Per-rider fare independence is the Abriyah pricing contract.

---

## §5 Module Scope Boundaries

### 5.1 In Scope

- 7 mobile flows per §1.2
- Phone OTP onboarding
- Map-based pickup/destination
- Zone detection + women-only eligibility
- Real-time waiting room via Firebase RTDB
- Live trip with WebSocket captain location
- Native Call + WhatsApp deep links + in-app chat
- 1-5 star rating
- Bilingual UI (Arabic primary, RTL; English secondary)
- Offline action queue

### 5.2 Out of Scope

| Item | Owner | Rationale |
|---|---|---|
| Captain dispatching | Backend Trip + Room Service | Backend logic |
| Trip approval / admin actions | Admin Dashboard (Operations / Captains) | Admin-only |
| Captain CRUD | Captains module (admin) | |
| Zone CRUD | Zones module (admin) | |
| Reports | Reports module (admin) | |
| Wallet / Payment | Customer App at M3 (Online Payments add-on) | Out of scope at v1 |
| Group chat for Abriyah room riders | Horizon 2 | |

### 5.3 Out of Scope (Future)

- **Wallet + Card payment** (M3) — adds Wallet tab to Profile + "Pay with Wallet" toggle on booking
- **Promo codes** (M2) — adds promo input field on booking
- **Referral program** (M2)
- **Multi-stop regular trips** (M3) — up to 3 destinations
- **Scheduled trips** (M3) — book up to 7 days ahead
- **Masked phone numbers** (M3) — `Captain.phone` no longer visible directly
- **ID-verified gender** (M2 with potential earlier escalation)
- **Group chat for Abriyah riders** (Horizon 2)

---

## §6 Glossary Additions

| Term | Definition | Status |
|---|---|---|
| **Zone Detection** | The GPS-lookup-against-Zone-polygon step on Abriyah Booking entry. Determines whether the user is in an Abriyah-enabled zone. | Pending merge |
| **Waiting Room Screen** | The Customer App screen shown during room matching, showing live rider-count + wait-time progress. | Pending merge |
| **Live Trip Screen** | The Customer App screen during ACCEPTED + IN_PROGRESS states showing captain location, ETA, communication actions. | Pending merge |
| **Per-Rider Fare Display** | The Customer App pattern of showing only the current user's fare (not the room total), reinforcing per-rider independence (Charter §4.12). | Pending merge |
| **Offline Action Queue** | The pattern where Customer App actions taken while offline are stored locally and flushed on network restore. | Pending merge |

---

## Appendix A — CRI

| Reference | Charter section | Verified |
|---|---|---|
| §2.1 Entities | §6.1, §6.2, §6.3, §6.4, §6.5, §6.7 | ✓ |
| §2.2 Events trip.requested/cancelled/rated, room.joined/opened | §5.5.1 | ✓ |
| §2.3 Events consumed | §5.5.1 + §5.5.3 | ✓ |
| §2.4 Abriyah Room Matching | §8.1 | ✓ |
| §2.4 Trip Cancellation Cascade | §8.3 | ✓ |
| §2.4 Zone Pricing Update Propagation | §8.4 | ✓ |
| §2.6 Mobile Client Surface Standard | §4.15 | ✓ |
| §2.6 Trip State Machine | §4.3 | ✓ |
| §2.6 Room State Machine | §4.4 | ✓ |
| §2.6 Women-Only Eligibility | §4.13 | ✓ |
| §2.6 Per-Rider Fare Independence | §4.12 | ✓ |
| §2.6 Cancellation Pattern | §4.14 | ✓ |

**Verdict:** PASS

---

**End of Beep Customer App PRD V1.0.0**
