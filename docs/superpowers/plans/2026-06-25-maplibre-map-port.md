# MapLibre Map Port (beeb → beeb-caption) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace beeb-caption's `react-native-maps` map with beeb's MapLibre map (CARTO basemaps + full POI overlay) so the captain app's map matches beeb's.

**Architecture:** Port beeb's map subsystem into beeb-caption: add the missing modules + glyph assets, overwrite the divergent files verbatim, swap the dependency. Beeb's `TripMap` preserved the old prop API, so the only live consumer (`app/(trip)/[id].tsx`) needs no change. Files are added leaf-first so the project type-checks clean after every task; the dependency is removed and the native build regenerated only at the end.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, Expo Router 6, `@maplibre/maplibre-react-native` 11, TanStack Query, axios, Zustand, react-i18next, expo-location.

## Global Constraints

- **Source repo (SRC):** `c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb`
- **Dest repo (DST):** `c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption`
- **Branch:** all work on `feat/maplibre-map-port` in DST (already created; the spec is committed there).
- **Imports need no rewriting:** both repos use the identical `@/*` path alias and TS strict config — beeb's files compile unchanged in caption.
- **Versions (exact):** `@maplibre/maplibre-react-native@^11.3.4`, `@maplibre/maplibre-gl-style-spec@24.8.5`, `expo-dev-client@~6.0.0`. Remove `react-native-maps`.
- **No Jest in caption.** Per the approved spec, beeb's `.test.ts` files are NOT ported. The per-task verification cycle is **`npx tsc --noEmit`** (catches the dominant risk — unresolved imports) plus targeted greps; the final task adds a native build + manual smoke. Do not add a test harness.
- **Theming:** ported components read `useThemeColors()`; markers/POI adopt caption's violet palette automatically. Do not hardcode colors.
- **`lib/api.ts` is NOT touched** — the ported services reuse caption's existing `@/lib/api` (its interceptor already attaches the captain bearer token; `/api/places/nearby` is public anyway).
- **Reference the spec:** `docs/superpowers/specs/2026-06-25-maplibre-map-port-design.md`.

---

## File Structure

**Add (copy verbatim from SRC):**
- `lib/map-style.ts` — CARTO basemap URLs + coord/bbox helpers + POI zoom constants.
- `lib/poi-categories.ts` — category→tier/glyph/color, `buildTierOpacityExpression`, `POI_GLYPH_NAMES`.
- `lib/poi-glyph-images.ts` — glyph-name→PNG `require()` map.
- `assets/poi-glyphs/*.png` — 17 glyph icons.
- `services/places-nearby.ts` — `GET /api/places/nearby` client (`getNearbyPois`, `getRadiusPois`, `poiLabel`, `Poi`).
- `hooks/use-pois.ts` — `useViewportPois`, `useCityPois`, `useNearbyPois`.
- `services/zones.ts` — zones service (parity; not wired into trip-detail).
- `components/trip/poi-feature-collection.ts` — `Poi[]`→GeoJSON builder.
- `components/trip/poi-overlay.tsx` — MapLibre POI layers.
- `components/trip/recenter-button.tsx` — recenter FAB.

**Overwrite (DST's divergent file → SRC's version):**
- `hooks/use-current-location.ts` — beeb's superset (adds `lastFix` fast path; same public API).
- `services/places.ts` — beeb's geocoding/search superset.
- `components/trip/trip-map.tsx` — MapLibre rewrite (prop API unchanged).
- `components/trip/location-picker.tsx` — MapLibre rewrite.

**Edit by hand:**
- `package.json` — deps.
- `app.json` — plugin.
- `i18n/en.json`, `i18n/ar.json` — add `booking.recenter`.
- `BACKEND_ISSUES.md` — log the undocumented endpoint.

**Leave untouched (already present, identical/compatible):** `services/routing.ts`, `lib/point-in-polygon.ts`, `lib/wkt.ts`, `lib/api.ts`, `hooks/use-theme-colors.ts`, `hooks/use-distance.ts`, `store/theme-store.ts`, `store/auth-store.ts`, `constants/{Colors,places,Typography,Spacing}.ts`, `components/ui/{icon,button}.tsx`.

---

### Task 1: Dependencies & native config

**Files:**
- Modify: `package.json`
- Modify: `app.json`

**Interfaces:**
- Produces: the `@maplibre/maplibre-react-native` and `@maplibre/maplibre-gl-style-spec` packages that every later task's imports resolve against.

- [ ] **Step 1: Add the MapLibre + dev-client packages**

Run (resolves SDK-compatible versions and writes them to `package.json`):

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx expo install @maplibre/maplibre-react-native expo-dev-client && npm install --save-exact @maplibre/maplibre-gl-style-spec@24.8.5
```

Expected: installs succeed; `package.json` now lists `@maplibre/maplibre-react-native`, `expo-dev-client`, and `@maplibre/maplibre-gl-style-spec`. **Do NOT remove `react-native-maps` yet** (the existing `trip-map.tsx`/`location-picker.tsx` still import it).

- [ ] **Step 2: Append the config plugin to `app.json`**

In `app.json`, add `"@maplibre/maplibre-react-native"` as the last entry of `expo.plugins`:

```jsonc
    "plugins": [
      "expo-router",
      [ "expo-splash-screen", { /* ...unchanged... */ } ],
      "@react-native-community/datetimepicker",
      [ "expo-image-picker", { /* ...unchanged... */ } ],
      "expo-font",
      "@maplibre/maplibre-react-native"
    ],
```

Do not change `newArchEnabled`, `experiments.reactCompiler`, or the existing `android.permissions` / `ios.infoPlist` location entries — they already match beeb.

- [ ] **Step 3: Verify the project still type-checks**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0, no errors (no code changed yet; the new packages are just available).

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add package.json package-lock.json app.json && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "build(map): add maplibre deps + config plugin (keep react-native-maps for now)"
```

---

### Task 2: POI foundation libs + glyph assets

**Files:**
- Create: `lib/map-style.ts`, `lib/poi-categories.ts`, `lib/poi-glyph-images.ts`
- Create: `assets/poi-glyphs/*.png` (17 files)

**Interfaces:**
- Consumes: `@/hooks/use-current-location` (`LatLng`), `@/constants/Colors` — both already present.
- Produces: `mapStyleFor`, `toLngLat`, `toPolygonFeature`, `toLineFeature`, `deltaToZoom`, `boundsFor`, `bboxFromBounds`, `Bbox`, POI zoom constants (`map-style`); `categoryStyle`, `buildTierOpacityExpression`, `TIER_MIN_ZOOM`, `POI_GLYPH_NAMES` (`poi-categories`); `POI_GLYPH_IMAGES` (`poi-glyph-images`).

- [ ] **Step 1: Copy the three lib files**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/lib/map-style.ts" "$DST/lib/map-style.ts" && cp "$SRC/lib/poi-categories.ts" "$DST/lib/poi-categories.ts" && cp "$SRC/lib/poi-glyph-images.ts" "$DST/lib/poi-glyph-images.ts"
```

- [ ] **Step 2: Copy the glyph assets directory (17 PNGs)**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp -r "$SRC/assets/poi-glyphs" "$DST/assets/poi-glyphs"
```

- [ ] **Step 3: Verify all 17 glyphs landed and keys are in sync**

```bash
ls "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption/assets/poi-glyphs" | wc -l
```

Expected: `17`. (The names must match `POI_GLYPH_NAMES` in `lib/poi-categories.ts` — they are copied verbatim from the same source, so they match by construction.)

- [ ] **Step 4: Verify type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0. (`map-style`/`poi-categories` only import already-present modules; `poi-glyph-images` uses runtime `require()` so PNG presence isn't a compile concern but is verified in Step 3.)

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add lib/map-style.ts lib/poi-categories.ts lib/poi-glyph-images.ts assets/poi-glyphs && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): add POI foundation libs + glyph assets"
```

---

### Task 3: POI data layer (services + query hooks)

**Files:**
- Create: `services/places-nearby.ts`, `services/zones.ts`
- Create: `hooks/use-pois.ts`

**Interfaces:**
- Consumes: `@/lib/api` (caption's axios instance — present), `@/hooks/use-current-location`, `@/lib/map-style`, `@/lib/wkt`, `@/lib/point-in-polygon` — all present or from Task 2.
- Produces: `getNearbyPois`, `getRadiusPois`, `poiLabel`, `Poi`, `PoiCategory` (`places-nearby`); `useViewportPois`, `useCityPois`, `useNearbyPois` (`use-pois`); `getZones`, `findContainingAbriyahZone`, `validatePins`, `Zone` (`zones`).

- [ ] **Step 1: Copy the data-layer files**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/services/places-nearby.ts" "$DST/services/places-nearby.ts" && cp "$SRC/services/zones.ts" "$DST/services/zones.ts" && cp "$SRC/hooks/use-pois.ts" "$DST/hooks/use-pois.ts"
```

- [ ] **Step 2: Verify type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0. `places-nearby.ts` imports `@/lib/api` → resolves to caption's existing api instance (intentional — do not change the import).

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add services/places-nearby.ts services/zones.ts hooks/use-pois.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): add POI/zones data layer + query hooks"
```

---

### Task 4: POI overlay components

**Files:**
- Create: `components/trip/poi-feature-collection.ts`, `components/trip/poi-overlay.tsx`

**Interfaces:**
- Consumes: `@/lib/poi-categories`, `@/lib/poi-glyph-images`, `@/lib/map-style`, `@/constants/Colors`, `@/services/places-nearby`, `@/hooks/use-theme-colors`, `@/store/theme-store`, `@maplibre/maplibre-react-native`, `@maplibre/maplibre-gl-style-spec` — all present or from Tasks 1–3.
- Produces: `buildPoiFeatureCollection` (`poi-feature-collection`); `PoiOverlay` (`poi-overlay`).

- [ ] **Step 1: Copy the overlay files**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/components/trip/poi-feature-collection.ts" "$DST/components/trip/poi-feature-collection.ts" && cp "$SRC/components/trip/poi-overlay.tsx" "$DST/components/trip/poi-overlay.tsx"
```

- [ ] **Step 2: Verify type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0. (Confirms the `@maplibre/maplibre-gl-style-spec` type import resolves.)

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/trip/poi-feature-collection.ts components/trip/poi-overlay.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): add POI overlay components"
```

---

### Task 5: Recenter button + `booking.recenter` i18n key

**Files:**
- Create: `components/trip/recenter-button.tsx`
- Modify: `i18n/en.json`, `i18n/ar.json`

**Interfaces:**
- Consumes: `@/components/ui/icon`, `@/hooks/use-theme-colors`, `@/constants/Spacing` (present); the `booking.recenter` translation key (added here).
- Produces: `RecenterButton` (used by `location-picker` in Task 9).

- [ ] **Step 1: Copy the recenter button**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/components/trip/recenter-button.tsx" "$DST/components/trip/recenter-button.tsx"
```

- [ ] **Step 2: Add the EN key** (it is missing; `recenter-button` uses it as an a11y label)

In `i18n/en.json`, inside the `booking` object, add `"recenter"` after `"locating"`:

```json
    "locating": "Finding your location…",
    "recenter": "My location",
```

- [ ] **Step 3: Add the AR key**

In `i18n/ar.json`, inside the `booking` object, add `"recenter"` after `"locating"`:

```json
    "locating": "نحدد موقعك…",
    "recenter": "موقعي",
```

- [ ] **Step 4: Verify type-check + valid JSON**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && node -e "JSON.parse(require('fs').readFileSync('i18n/en.json','utf8'));JSON.parse(require('fs').readFileSync('i18n/ar.json','utf8'));console.log('json ok')" && npx tsc --noEmit
```

Expected: `json ok` then tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/trip/recenter-button.tsx i18n/en.json i18n/ar.json && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): add recenter button + booking.recenter i18n key"
```

---

### Task 6: Location hook parity (superset overwrite)

**Files:**
- Modify (overwrite): `hooks/use-current-location.ts`

**Interfaces:**
- Produces: unchanged public API — `useCurrentLocation()` returning `{ location, permissionGranted, error, loading, fallback }` and the `LatLng` interface. The only addition is a module-level `lastFix` cache + `getLastKnownPositionAsync()` fast path (instant recenter). Caption's other consumers (`use-active-trip`, `use-live-trip`, etc.) are unaffected — same shape, additive behavior.

- [ ] **Step 1: Overwrite with beeb's version**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/hooks/use-current-location.ts" "$DST/hooks/use-current-location.ts"
```

- [ ] **Step 2: Verify type-check (existing captain consumers must still compile)**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0. The `LatLng` interface and return shape are byte-identical to caption's prior version, so no consumer breaks.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add hooks/use-current-location.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): add last-known-position fast path to use-current-location"
```

---

### Task 7: Places service superset overwrite

**Files:**
- Modify (overwrite): `services/places.ts`

**Interfaces:**
- Consumes: `@/constants/places` (`BAGHDAD_PLACES`), `@/hooks/use-distance` (`haversineKm`), `@/hooks/use-current-location`, `@/services/places-nearby` (`Poi` — from Task 3) — all present.
- Produces: `PlaceResult` (`source: 'curated' | 'geocoded' | 'poi'`), `getPopularPlaces(here, lang, limit=8)`, `searchPlaces(query, lang, nearbyPois?, center?)`, `reverseGeocode(coord, lang='ar')`, `searchLoadedPois(...)`. The still-present old `location-picker.tsx` calls `getPopularPlaces(initialCenter, lang, 8)`, `reverseGeocode(center)`, `searchPlaces(query, lang)` — all backward-compatible (extra args optional), and its `place.source === 'curated'` check still narrows fine.

- [ ] **Step 1: Overwrite with beeb's version**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/services/places.ts" "$DST/services/places.ts"
```

- [ ] **Step 2: Verify type-check (old location-picker must still compile against the new signatures)**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add services/places.ts && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): replace places service with geocoding/POI-search superset"
```

---

### Task 8: TripMap → MapLibre

**Files:**
- Modify (overwrite): `components/trip/trip-map.tsx`

**Interfaces:**
- Consumes: `@/hooks/use-current-location`, `@/hooks/use-theme-colors`, `@/store/theme-store`, `@/lib/map-style`, `@/hooks/use-pois`, `@/components/trip/poi-overlay`, `@maplibre/maplibre-react-native` — all present.
- Produces: `TripMap` with prop API `{ initialRegion?, showsUserLocation?, pickup?, pickups?, stops?, dropoff?, driver?, zonePolygon?, routeCoords?, fitToCoords?, onRegionChangeComplete?, showPois?, onPress?, scrollEnabled?, zoomEnabled?, pointerEvents?, children? }` and ref handle `TripMapHandle { animateToRegion }`. The live consumer `app/(trip)/[id].tsx` passes only `driver`, `pickup`, `dropoff`, `routeCoords`, `showsUserLocation` — all present in this API with identical types, and attaches no ref → no consumer change required.

- [ ] **Step 1: Overwrite with beeb's MapLibre version**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/components/trip/trip-map.tsx" "$DST/components/trip/trip-map.tsx"
```

- [ ] **Step 2: Verify type-check (incl. the trip-detail consumer)**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0 — confirms `app/(trip)/[id].tsx` still compiles against the new `TripMap` props.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/trip/trip-map.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): rewrite TripMap on MapLibre"
```

---

### Task 9: LocationPicker → MapLibre

**Files:**
- Modify (overwrite): `components/trip/location-picker.tsx`

**Interfaces:**
- Consumes: `@/hooks/use-theme-colors`, `@/store/theme-store`, `@/lib/map-style`, `@/hooks/use-pois`, `@/components/trip/poi-overlay`, `@/services/places-nearby`, `@/constants/Typography`, `@/constants/Spacing`, `@/components/ui/icon`, `@/components/ui/button`, `@/hooks/use-current-location`, `@/components/trip/recenter-button`, `@/services/places`, `@/lib/point-in-polygon`, `@maplibre/maplibre-react-native` — all present after Tasks 1–8.
- Produces: `LocationPicker`, `LocationPickerResult` (no external consumer in caption — remains unused, ported for parity).

- [ ] **Step 1: Overwrite with beeb's MapLibre version**

```bash
SRC="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-original/Beeb"; DST="c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption"; cp "$SRC/components/trip/location-picker.tsx" "$DST/components/trip/location-picker.tsx"
```

- [ ] **Step 2: Verify type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Confirm no source file imports `react-native-maps` anymore**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && grep -rn "react-native-maps" --include="*.ts" --include="*.tsx" . ; echo "exit=$?"
```

Expected: no matches (grep prints nothing, `exit=1`). Any match other than a markdown doc means a file still references the old library.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add components/trip/location-picker.tsx && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "feat(map): rewrite LocationPicker on MapLibre"
```

---

### Task 10: Remove `react-native-maps`, regenerate native build, verify end-to-end

**Files:**
- Modify: `package.json`
- Create: `BACKEND_ISSUES.md`

**Interfaces:**
- Consumes: a clean codebase where nothing imports `react-native-maps` (verified in Task 9, Step 3).

- [ ] **Step 1: Remove the old map library**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npm uninstall react-native-maps
```

Expected: `react-native-maps` removed from `package.json` and `node_modules`.

- [ ] **Step 2: Log the undocumented backend endpoint**

Create (or append to) `BACKEND_ISSUES.md` in DST root:

```markdown
# Backend Issues

## `/api/places/nearby` is undocumented in the OpenAPI spec

`services/places-nearby.ts` depends on `GET /api/places/nearby`, but the endpoint
is absent from both the committed `docs/openapi.json` and the live spec at
`https://beeb.madebyhaithem.com/api-docs/openapi.json` (verified 2026-06-25).

Reverse-engineered contract:
- `bbox` mode: `?bbox=minLng,minLat,maxLng,maxLat&per_page=100&page=N[&category=...]`
- `radius` mode: `?lat=&lng=&radius_m=<=50000&per_page=100&page=N`
- Response: `{ items: BackendPlace[], total, page, per_page }`, `total` capped ~1000/viewport.
- Auth: assumed public (no token) — inferred from the public sibling `/api/zones`; not confirmed.

Action: ask backend to add this path to the OpenAPI spec and confirm the auth tier.
```

- [ ] **Step 3: Regenerate the native projects with the MapLibre plugin**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx expo prebuild --clean
```

Expected: prebuild completes; the MapLibre config plugin wires the Android Maven repo / iOS pod. (This step is mandatory — skipping it after adding the plugin is the most common failure mode.)

- [ ] **Step 4: Final type-check**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Build & launch a dev build, then smoke-test the map**

```bash
cd "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" && npx expo run:android
```

(iOS requires a Mac/EAS; on Windows use Android or an EAS build.) Then manually verify on the trip-detail screen (`app/(trip)/[id].tsx`):
- The CARTO basemap renders and follows light/dark theme.
- Pickup / dropoff / driver markers and the route line draw correctly.
- POI pins fade in by zoom tier (zoom in past ~12 → landmarks, further → cafés/shops) — matching beeb.
- Recenter behaves; no raw `booking.recenter` text appears.

- [ ] **Step 6: Commit**

```bash
git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" add -A && git -C "c:/Users/mshmsh/Documents/coding/my project/lilium/beeb-caption" commit -m "build(map): remove react-native-maps, regenerate native build, log backend issue"
```

---

## Self-Review

**1. Spec coverage** — every spec item maps to a task:
- Deps add/remove + `@maplibre/maplibre-gl-style-spec` explicit + plugin → Task 1 (remove) Task 10. ✓
- 9 ADD modules + 17 assets → Tasks 2–5. ✓
- 3 OVERWRITE files → Tasks 7 (places), 8 (trip-map), 9 (location-picker). ✓
- `use-current-location` lastFix adaptation → Task 6 (verbatim, since beeb's is a superset). ✓
- `booking.recenter` i18n → Task 5. ✓
- Reuse caption's `api.ts`/`auth-store` (don't port) → enforced by leaving imports as `@/lib/api`; Global Constraints. ✓
- `api.ts` logger NOT changed → not a task (per the spec update). ✓
- Drop `active-trip-route`/`trip-store` → not in any task (correctly excluded). ✓
- Undocumented endpoint → `BACKEND_ISSUES.md` in Task 10. ✓
- prebuild --clean + build/smoke verification → Task 10. ✓
- Tests out of scope (no Jest) → Global Constraints. ✓

**2. Placeholder scan** — no TBD/TODO; every step is a concrete command or exact JSON. ✓

**3. Type consistency** — symbol names (`mapStyleFor`, `useViewportPois`, `getNearbyPois`, `PoiOverlay`, `RecenterButton`, `TripMapHandle`, `getPopularPlaces`, `searchLoadedPois`) are used consistently across the Interfaces blocks and match the verified beeb exports. ✓

**Ordering invariant:** the project type-checks clean after every task because new modules are added leaf-first, the divergent overwrites preserve backward-compatible signatures, and `react-native-maps` is removed only after Task 9, Step 3 confirms nothing imports it.
