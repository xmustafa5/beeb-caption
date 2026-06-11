# Captain Online Toggle / Location / Real-time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An activated captain can toggle online — the app marks them online server-side, streams GPS every ~10s (queuing across drops, flushing on reconnect), holds a `/ws/captain` WebSocket, and shows connection health — all owned by a `CaptainPresenceProvider` that exposes parsed frames for Areas 4/5.

**Architecture:** `services/captain-location.ts` wraps the online/location REST endpoints. `services/captain-socket.ts` is a framework-agnostic WS client (keep-alive, reconnect, frame parsing). `providers/captain-presence.tsx` (React context, mounted in the tabs layout) owns online state + the GPS ping loop + offline queue + the socket + connection health, and exposes `lastOffer`/`lastTripUpdate`. The Area 2 activated card gains an online `<Switch>` + health pill.

**Tech Stack:** Expo Router, TanStack Query (not needed here — presence is imperative state), Zustand auth store, `expo-location` (foreground watch), native `WebSocket`, `WS_BASE_URL` from `lib/api.ts`.

> **No unit-test runner** (per `CLAUDE.md`). Verification gate per task: `npx tsc --noEmit` + `npx expo lint` clean, plus live `curl` against `https://beeb.madebyhaithem.com` where exercisable. Overrides the writing-plans TDD default (user instructions win).

> **Test captain (staging bypass):** `9647000000098` / `16001600` — approved + **activated today**, so `PUT /api/captain/online {online:true}` returns 200 (verified live 2026-06-11). REST endpoints all verified: online 200, location 200/400(out-of-range), GET location 200.

> **RTL:** Tasks touching layout (5) must follow CLAUDE.md RTL rules (flexDirection ternary, module-scope isRTL, no marginStart/marginEnd). Invoke the `react-native-rtl-positioning` skill if available; else fall back to CLAUDE.md + the existing `components/captain/document-row.tsx` pattern.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `services/captain-location.ts` | online toggle + location ping/flush/read + mapper | Create |
| `services/captain-socket.ts` | framework-agnostic /ws/captain client (keep-alive, reconnect, frame parse) | Create |
| `providers/captain-presence.tsx` | context: online state, GPS loop, offline queue, socket, health, exposed frames | Create |
| `app/(tabs)/_layout.tsx` | wrap pager tree in CaptainPresenceProvider | Modify |
| `app/(tabs)/index.tsx` | swap the activated-card placeholder line for the online toggle + health pill | Modify |
| `i18n/en.json`, `i18n/ar.json` | `captain.online.*` strings | Modify |

Reused: `lib/api.ts` (`api`, `parseApiError`, `WS_BASE_URL`), `store/auth-store.ts` (`token`), `expo-location`, `constants/*`, `components/ui/icon.tsx`.

---

## Task 1: Location service (`services/captain-location.ts`)

**Files:**
- Create: `services/captain-location.ts`

- [ ] **Step 1: Create the service**

```ts
// services/captain-location.ts
import { api } from '@/lib/api'

export interface CaptainLocation {
  captainId: string
  longitude: number
  latitude: number
  lastPingAt: string
  online: boolean
}

export interface PingCoords {
  longitude: number
  latitude: number
}

interface BackendLocation {
  captain_id: string
  longitude: number
  latitude: number
  last_ping_at: string
  online: boolean
}

function toCaptainLocation(b: BackendLocation): CaptainLocation {
  return {
    captainId: b.captain_id,
    longitude: b.longitude,
    latitude: b.latitude,
    lastPingAt: b.last_ping_at,
    online: b.online,
  }
}

/** Toggle online. Going online enforces today's activation gate (403 if not activated). */
export async function setOnline(online: boolean): Promise<void> {
  await api.put('/api/captain/online', { online })
}

/** Single GPS ping. Sets the captain online (presence). Out-of-range coords → 400. */
export async function pingLocation(coords: PingCoords): Promise<CaptainLocation> {
  const { data } = await api.post<BackendLocation>('/api/captain/location', coords)
  return toCaptainLocation(data)
}

/** Flush queued pings on reconnect (backend keeps only the last). Empty list → 400. */
export async function flushPings(pings: PingCoords[]): Promise<CaptainLocation> {
  const { data } = await api.post<BackendLocation>('/api/captain/location/flush', { pings })
  return toCaptainLocation(data)
}

/** Read own last-known location. Never-pinged → null (404 mapped). */
export async function getLocation(): Promise<CaptainLocation | null> {
  try {
    const { data } = await api.get<BackendLocation>('/api/captain/location')
    return toCaptainLocation(data)
  } catch (err) {
    const { parseApiError } = await import('@/lib/api')
    if (parseApiError(err).status === 404) return null
    throw err
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/captain-location"` → EMPTY.
Run: `npx expo lint 2>&1 | grep "captain-location"` → clean. (If lint flags the dynamic `await import('@/lib/api')`, change to a top-level `import { api, parseApiError } from '@/lib/api'` and use `parseApiError` directly — that's cleaner; do that and re-verify.)

- [ ] **Step 3: Live probe**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -o /dev/null -w "online true [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"online":true}'
curl -s -o /dev/null -w "location [%{http_code}]\n" -X POST $BASE/api/captain/location -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"longitude":44.40,"latitude":33.31}'
curl -s -o /dev/null -w "get location [%{http_code}]\n" $BASE/api/captain/location -H "Authorization: Bearer $TOKEN"
```
Expected: `online true [200]`, `location [200]`, `get location [200]`. (Confirms the shapes the service maps.) Leave the captain online — Task 5 toggles it.

- [ ] **Step 4: Commit**

```bash
git add services/captain-location.ts
git commit -m "feat(captain): online toggle + location service"
```

---

## Task 2: WebSocket client (`services/captain-socket.ts`)

**Files:**
- Create: `services/captain-socket.ts`

- [ ] **Step 1: Create the client**

```ts
// services/captain-socket.ts
import { WS_BASE_URL } from '@/lib/api'

export type CaptainSocketState = 'connecting' | 'open' | 'closed'

export interface LocationEcho {
  longitude: number
  latitude: number
  lastPingAt?: string
  online?: boolean
}

export interface TripFrame {
  id: string
  status: string
  [k: string]: unknown
}

export interface OfferFrame {
  tripId: string
  [k: string]: unknown
}

export interface CaptainSocketHandlers {
  onLocationEcho?: (loc: LocationEcho) => void
  onTripUpdate?: (trip: TripFrame) => void
  onOffer?: (offer: OfferFrame) => void
  onState?: (state: CaptainSocketState) => void
}

const KEEPALIVE_MS = 25_000
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

/**
 * Read-only /ws/captain client. Opens with the JWT as a query param, keeps the
 * connection warm with a 25s frame, reconnects with exponential backoff, and
 * routes frames by their additive `event` field (falling back to field-sniffing).
 * The backend ignores client→server frames; this never sends commands.
 */
export class CaptainSocket {
  private ws: WebSocket | null = null
  private keepAlive: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private backoff = RECONNECT_MIN_MS
  private closedByUs = false

  constructor(
    private readonly token: string,
    private readonly handlers: CaptainSocketHandlers,
  ) {}

  connect(): void {
    this.closedByUs = false
    this.open()
  }

  close(): void {
    this.closedByUs = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.stopKeepAlive()
    this.ws?.close()
    this.ws = null
    this.handlers.onState?.('closed')
  }

  private open(): void {
    this.handlers.onState?.('connecting')
    const url = `${WS_BASE_URL}/ws/captain?token=${encodeURIComponent(this.token)}`
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = RECONNECT_MIN_MS
      this.handlers.onState?.('open')
      this.startKeepAlive()
    }
    ws.onmessage = (e) => this.handleMessage(e.data)
    ws.onerror = () => { /* surfaced via onclose */ }
    ws.onclose = () => {
      this.stopKeepAlive()
      if (this.closedByUs) return
      this.handlers.onState?.('connecting')
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => this.open(), this.backoff)
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS)
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAlive = setInterval(() => {
      // The server ignores client frames; this no-op text frame keeps intermediaries from idling us.
      try { this.ws?.send('ping') } catch { /* ignore */ }
    }, KEEPALIVE_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAlive) { clearInterval(this.keepAlive); this.keepAlive = null }
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let frame: Record<string, unknown>
    try {
      frame = JSON.parse(raw)
    } catch {
      return // ignore non-JSON
    }
    const event = frame.event as string | undefined

    // Prefer the additive `event`; else field-sniff.
    if (event === 'captain_location' || (frame.longitude !== undefined && frame.latitude !== undefined && frame.status === undefined)) {
      this.handlers.onLocationEcho?.({
        longitude: Number(frame.longitude),
        latitude: Number(frame.latitude),
        lastPingAt: frame.last_ping_at as string | undefined,
        online: frame.online as boolean | undefined,
      })
      return
    }
    if (frame.trip_id !== undefined && frame.pickup_lat !== undefined) {
      this.handlers.onOffer?.({ tripId: String(frame.trip_id), ...frame })
      return
    }
    if (event === 'trip_update' || (frame.id !== undefined && frame.status !== undefined)) {
      this.handlers.onTripUpdate?.({ id: String(frame.id), status: String(frame.status), ...frame })
      return
    }
    // Unknown frame — ignore.
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "services/captain-socket"` → EMPTY. (`WebSocket` is a RN global; `WS_BASE_URL` is exported from `lib/api.ts`.)
Run: `npx expo lint 2>&1 | grep "captain-socket"` → clean.

- [ ] **Step 3: Commit**

```bash
git add services/captain-socket.ts
git commit -m "feat(captain): /ws/captain socket client"
```

---

## Task 3: i18n strings (`captain.online.*`)

**Files:**
- Modify: `i18n/en.json` (add `online` inside the `captain` object)
- Modify: `i18n/ar.json` (matching block)

- [ ] **Step 1: Add to `i18n/en.json`'s `captain` object** (place after the `activate` block; valid JSON):

```json
    "online": {
      "toggleLabel": "Go online",
      "online": "Online",
      "offline": "Offline",
      "connecting": "Connecting…",
      "live": "Live",
      "stale": "Reconnecting…",
      "gpsHint": "Your location is shared every few seconds while online.",
      "permissionNeeded": "Location permission is required to go online.",
      "notActivated": "Activate today before going online.",
      "onlineFailed": "Couldn't change your status. Please try again."
    },
```

- [ ] **Step 2: Add to `i18n/ar.json`'s `captain` object:**

```json
    "online": {
      "toggleLabel": "ابدأ الاتصال",
      "online": "متصل",
      "offline": "غير متصل",
      "connecting": "جارٍ الاتصال…",
      "live": "مباشر",
      "stale": "إعادة الاتصال…",
      "gpsHint": "تتم مشاركة موقعك كل بضع ثوانٍ أثناء الاتصال.",
      "permissionNeeded": "إذن الموقع مطلوب للاتصال.",
      "notActivated": "فعّل اليوم قبل الاتصال.",
      "onlineFailed": "تعذّر تغيير حالتك. حاول مرة أخرى."
    },
```

- [ ] **Step 3: Validate + parity + typecheck**

Run: `node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')"` → `json ok`.
Run: `node -e "const en=require('./i18n/en.json').captain,ar=require('./i18n/ar.json').captain;const keys=o=>Object.entries(o).flatMap(([k,v])=>typeof v==='object'&&v?Object.keys(v).map(kk=>k+'.'+kk):[k]).sort();const ek=keys(en),ak=keys(ar);console.log('en-only:',ek.filter(k=>!ak.includes(k)));console.log('ar-only:',ak.filter(k=>!ek.includes(k)))"` → both arrays EMPTY.
Run: `npx tsc --noEmit 2>&1 | grep -i "i18n"` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add i18n/en.json i18n/ar.json
git commit -m "feat(captain): EN/AR strings for online presence"
```

---

## Task 4: Presence provider (`providers/captain-presence.tsx`)

**Files:**
- Create: `providers/captain-presence.tsx`

- [ ] **Step 1: Create the provider**

```tsx
// providers/captain-presence.tsx
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import * as Location from 'expo-location'
import { useAuthStore } from '@/store/auth-store'
import { parseApiError } from '@/lib/api'
import {
  setOnline as apiSetOnline,
  pingLocation,
  flushPings,
  getLocation,
  type PingCoords,
} from '@/services/captain-location'
import { CaptainSocket, type CaptainSocketState } from '@/services/captain-socket'

export type ConnectionHealth = 'offline' | 'connecting' | 'live' | 'stale'

export interface TripUpdate { id: string; status: string }
export interface Offer { tripId: string }

interface CaptainPresence {
  online: boolean
  connection: ConnectionHealth
  goingOnline: boolean
  error: string | null
  setOnline: (online: boolean) => Promise<void>
  lastTripUpdate: TripUpdate | null
  lastOffer: Offer | null
}

const PING_INTERVAL_MS = 10_000
const STALE_AFTER_MS = 60_000
const RESUME_WINDOW_MS = 5 * 60_000

const Ctx = createContext<CaptainPresence | null>(null)

export function useCaptainPresence(): CaptainPresence {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCaptainPresence must be used within CaptainPresenceProvider')
  return ctx
}

export function CaptainPresenceProvider({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)

  const [online, setOnlineState] = useState(false)
  const [connection, setConnection] = useState<ConnectionHealth>('offline')
  const [goingOnline, setGoingOnline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTripUpdate, setLastTripUpdate] = useState<TripUpdate | null>(null)
  const [lastOffer, setLastOffer] = useState<Offer | null>(null)

  const sub = useRef<Location.LocationSubscription | null>(null)
  const lastCoords = useRef<PingCoords | null>(null)
  const queue = useRef<PingCoords[]>([])
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socket = useRef<CaptainSocket | null>(null)

  const markFreshEcho = useCallback(() => {
    setConnection('live')
    if (staleTimer.current) clearTimeout(staleTimer.current)
    staleTimer.current = setTimeout(() => setConnection('stale'), STALE_AFTER_MS)
  }, [])

  const stopSession = useCallback(() => {
    if (pingTimer.current) { clearInterval(pingTimer.current); pingTimer.current = null }
    if (staleTimer.current) { clearTimeout(staleTimer.current); staleTimer.current = null }
    sub.current?.remove(); sub.current = null
    socket.current?.close(); socket.current = null
    queue.current = []
    lastCoords.current = null
  }, [])

  const startSession = useCallback(async () => {
    // Foreground location watch feeds lastCoords.
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
      (pos) => { lastCoords.current = { longitude: pos.coords.longitude, latitude: pos.coords.latitude } },
    )

    // Open the socket.
    if (token) {
      socket.current = new CaptainSocket(token, {
        onState: (s: CaptainSocketState) => {
          if (s === 'open') markFreshEcho()
          else if (s === 'connecting') setConnection((c) => (c === 'offline' ? 'connecting' : c))
        },
        onLocationEcho: () => markFreshEcho(),
        onTripUpdate: (t) => setLastTripUpdate({ id: t.id, status: t.status }),
        onOffer: (o) => setLastOffer({ tripId: o.tripId }),
      })
      socket.current.connect()
    }

    // Ping loop: post the latest coords; queue + flush on failure.
    pingTimer.current = setInterval(async () => {
      const c = lastCoords.current
      if (!c) return
      try {
        if (queue.current.length > 0) {
          const batch = [...queue.current, c]
          queue.current = []
          await flushPings(batch)
        } else {
          await pingLocation(c)
        }
      } catch (err) {
        // 400 (bad coords) → drop this ping, keep going. Else queue for flush.
        if (parseApiError(err).status !== 400) queue.current.push(c)
      }
    }, PING_INTERVAL_MS)
  }, [token, markFreshEcho])

  const setOnline = useCallback(async (next: boolean) => {
    setError(null)
    if (next) {
      setGoingOnline(true)
      try {
        const perm = await Location.requestForegroundPermissionsAsync()
        if (perm.status !== 'granted') { setError('permissionNeeded'); return }
        await apiSetOnline(true)
        await startSession()
        setOnlineState(true)
        setConnection('connecting')
      } catch (err) {
        setError(parseApiError(err).status === 403 ? 'notActivated' : 'onlineFailed')
        stopSession()
        setOnlineState(false)
        setConnection('offline')
      } finally {
        setGoingOnline(false)
      }
    } else {
      stopSession()
      setOnlineState(false)
      setConnection('offline')
      try { await apiSetOnline(false) } catch { /* best-effort */ }
    }
  }, [startSession, stopSession])

  // On launch: resume if recently online.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const loc = await getLocation()
        if (cancelled || !loc?.online) return
        const age = Date.now() - new Date(loc.lastPingAt).getTime()
        if (age < RESUME_WINDOW_MS) {
          await startSession()
          setOnlineState(true)
          setConnection('connecting')
        }
      } catch { /* start offline */ }
    })()
    return () => { cancelled = true }
  }, [token, startSession])

  // Cleanup on unmount.
  useEffect(() => () => stopSession(), [stopSession])

  return (
    <Ctx.Provider value={{ online, connection, goingOnline, error, setOnline, lastTripUpdate, lastOffer }}>
      {children}
    </Ctx.Provider>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep "captain-presence"` → EMPTY. If `Date.now()` / `new Date()` are fine in app code (they are — the no-Date rule is only for workflow scripts, not the app). If exhaustive-deps lint warns on a `useCallback`/`useEffect`, match the existing codebase tolerance (the template already has a few such warnings); only fix if it's a real missing dep that changes behavior.
Run: `npx expo lint 2>&1 | grep "captain-presence"` → report any warnings; acceptable if they match the template's existing exhaustive-deps style, but no errors.

- [ ] **Step 3: Commit**

```bash
git add providers/captain-presence.tsx
git commit -m "feat(captain): presence provider (online + GPS loop + socket)"
```

---

## Task 5: Mount provider + online toggle UI

**Files:**
- Modify: `app/(tabs)/_layout.tsx` (wrap the tree)
- Modify: `app/(tabs)/index.tsx` (swap placeholder for toggle)

This task touches RTL layout. **First invoke the `react-native-rtl-positioning` skill** (or fall back to CLAUDE.md rules if unavailable).

- [ ] **Step 1: Wrap the tabs layout in the provider**

In `app/(tabs)/_layout.tsx`, add the import:
```tsx
import { CaptainPresenceProvider } from '@/providers/captain-presence'
```
Wrap the returned tree. The current return is:
```tsx
  return (
    <View style={{ flex: 1 }}>
      <PagerView ...>...</PagerView>
      <CustomTabBar activeIndex={activeIndex} onTabPress={goToTab} />
    </View>
  )
```
Change it to wrap the `<View>` in `<CaptainPresenceProvider>`:
```tsx
  return (
    <CaptainPresenceProvider>
      <View style={{ flex: 1 }}>
        <PagerView ...>...</PagerView>
        <CustomTabBar activeIndex={activeIndex} onTabPress={goToTab} />
      </View>
    </CaptainPresenceProvider>
  )
```
(Keep the PagerView/CustomTabBar contents exactly as they are — only add the wrapper.)

- [ ] **Step 2: Replace the activated-card placeholder with the online toggle in `app/(tabs)/index.tsx`**

Add these imports at the top (alongside the existing imports):
```tsx
import { Switch } from 'react-native'
import { useCaptainPresence, type ConnectionHealth } from '@/providers/captain-presence'
```
(`Switch` joins the existing `react-native` import — either add to that import list or add a separate `import { Switch } from 'react-native'`. `I18nManager` is already imported; `isRTL` is already a module-scope const in this file.)

Find this block (the Area-2 placeholder, currently the last child of the activated card):
```tsx
          {/* Area 3 (online toggle) mounts here. */}
          <Text style={{ ...Typography['caption-sm'], color: colors.muted, textAlign: 'center', fontStyle: 'normal' }}>
            {t('captain.activate.onlineComingSoon')}
          </Text>
```
Replace it with:
```tsx
          <OnlineToggle />
```

Then add this component at the BOTTOM of the file (after `HomeScreen`):
```tsx
const HEALTH_COLORS: Record<ConnectionHealth, 'muted' | 'success' | 'tint' | 'destructive'> = {
  offline: 'muted',
  connecting: 'tint',
  live: 'success',
  stale: 'destructive',
}

function OnlineToggle() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { online, connection, goingOnline, error, setOnline } = useCaptainPresence()

  const healthColor = colors[HEALTH_COLORS[connection]]
  const healthLabel =
    connection === 'live' ? t('captain.online.live')
    : connection === 'connecting' ? t('captain.online.connecting')
    : connection === 'stale' ? t('captain.online.stale')
    : online ? t('captain.online.online') : t('captain.online.offline')

  return (
    <View style={{ alignSelf: 'stretch', gap: Spacing.md, marginTop: Spacing.sm }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
          {online ? t('captain.online.online') : t('captain.online.toggleLabel')}
        </Text>
        <Switch
          value={online}
          onValueChange={(v) => setOnline(v)}
          disabled={goingOnline}
          trackColor={{ true: colors.tint }}
        />
      </View>

      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: healthColor }} />
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
          {healthLabel}
        </Text>
      </View>

      <Text style={{ ...Typography['caption-sm'], color: error ? colors.destructive : colors.subtle, textAlign: isRTL ? 'right' : 'left', fontStyle: 'normal' }}>
        {error ? t(`captain.online.${error}`) : t('captain.online.gpsHint')}
      </Text>
    </View>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "captain-presence|\(tabs\)/(index|_layout)"` → EMPTY. (Confirm `colors.muted/success/tint/destructive` exist — they do. The `error` is a key suffix into `captain.online.*` — `permissionNeeded`/`notActivated`/`onlineFailed` all exist.)
Run: `npx expo lint 2>&1 | grep -E "\(tabs\)/(index|_layout)"` → clean (no NEW warnings).

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/_layout.tsx" "app/(tabs)/index.tsx"
git commit -m "feat(captain): online toggle + connection health on home"
```

---

## Task 6: Full-area verification

**Files:** none (verification only)

- [ ] **Step 1: Clean typecheck + lint across the app**

Run: `npx tsc --noEmit && npx expo lint`
Expected: tsc exit 0; lint 0 errors (the 4 pre-existing template warnings in `location-picker.tsx` etc. are acceptable; confirm no NEW warnings from Area 3 except possibly an exhaustive-deps note in `captain-presence.tsx` consistent with the template style).

- [ ] **Step 2: Live REST re-confirm + leave the captain offline**

Run:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -o /dev/null -w "online true [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"online":true}'
curl -s -o /dev/null -w "ping [%{http_code}]\n" -X POST $BASE/api/captain/location -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"longitude":44.41,"latitude":33.32}'
curl -s -o /dev/null -w "flush [%{http_code}]\n" -X POST $BASE/api/captain/location/flush -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"pings":[{"longitude":44.42,"latitude":33.33}]}'
curl -s -o /dev/null -w "online false [%{http_code}]\n" -X PUT $BASE/api/captain/online -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"online":false}'
```
Expected: all `[200]`. Confirms online/ping/flush/offline. (Leaves the captain offline — clean state for later areas.)

- [ ] **Step 3: Best-effort live WS smoke (skip if rate-limited)**

Run a raw HTTP/1.1 WS handshake to confirm a 101 upgrade (not 401/403). If it returns 429, note "rate-limited, skipped" — do NOT treat as failure:
```bash
BASE=https://beeb.madebyhaithem.com
TOKEN=$(curl -s -X POST $BASE/api/auth/captain/otp/verify -H 'Content-Type: application/json' -d '{"phone":"9647000000098","code":"16001600"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
TOKEN="$TOKEN" python3 - <<'PY'
import os, ssl, socket, base64
t=os.environ["TOKEN"]; host="beeb.madebyhaithem.com"
ctx=ssl.create_default_context()
s=ctx.wrap_socket(socket.create_connection((host,443),timeout=8), server_hostname=host)
key=base64.b64encode(b"0123456789abcdef").decode()
s.send((f"GET /ws/captain?token={t} HTTP/1.1\r\nHost: {host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n\r\n").encode())
print(s.recv(256).split(b"\r\n")[0].decode(errors="replace"))
s.close()
PY
```
Expected: `HTTP/1.1 101 Switching Protocols` (socket works) OR `HTTP/1.1 429 ...` (rate-limited → note & skip). A 401/403 would indicate an auth problem — investigate if seen.

- [ ] **Step 4: Manual smoke (Expo Go), best-effort**

Start `npx expo start`; log in as the test captain; on the activated home, flip the Switch → location permission prompt → online; watch the dev network log for `POST /api/captain/location` every ~10s and the health pill turning live; flip off → offline. Record results; don't block on simulator GPS quirks.

- [ ] **Step 5: Final commit (only if smoke fixes were needed)**

```bash
git add -A && git commit -m "chore(captain): online presence verification fixes" || echo "nothing to commit"
```

---

## Self-review notes (for the executor)

- **Online ≠ socket health:** `online` follows the REST PUT + ping loop; a socket failure shows as `connecting`/`stale` but never flips the captain offline. Don't couple them.
- **Date APIs are fine in app code** — the no-`Date.now()` rule applies only to workflow scripts, not RN app code. The provider uses `Date.now()`/`new Date()` for the resume-window check; that's correct.
- **Foreground-only GPS** — `watchPositionAsync` (foreground). No background TaskManager. The backend's 5-min staleness sweep handles a backgrounded captain.
- **`getLocation` 404 → null** is the never-pinged case, not an error.
- **Frames exposed, not rendered** — `lastOffer`/`lastTripUpdate` are the Areas 4/5 seam; this area renders only the toggle + health pill.
- **WS live verification** may be blocked by the edge 429 rate limit; the socket is built to the documented contract — a skipped WS smoke is acceptable, a 401/403 is not.
