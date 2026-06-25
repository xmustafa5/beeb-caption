# MapLibre Map Port: beeb → beeb-caption

**Date:** 2026-06-25
**Status:** Design (approved in brainstorming; pending spec review)
**Target repo:** `beeb-caption` (captain app)
**Source repo:** `beeb-original/Beeb` (rider app)

## Goal

Replace beeb-caption's `react-native-maps`-based map with beeb's MapLibre map so the
captain app's map looks and behaves **the same as beeb's** — CARTO vector basemaps
(light/dark), markers, route line, zone polygon, and the full **POI overlay** (tiered
landmark pins: hospitals, cafés, shops, … that fade in by zoom).

This is a **library migration**, not a file copy: beeb-caption uses
`react-native-maps@1.20.1`; beeb uses `@maplibre/maplibre-react-native@11.3.4`. The two
have incompatible APIs. We port beeb's map subsystem wholesale and swap the dependency.

## Non-goals

- Wiring `LocationPicker` into a screen. It is ported for 1:1 parity but stays
  unused (it is already dead code in caption — no captain screen picks a pin today).
- Porting the rider-only booking / abriyah / scheduled flows.
- Porting `lib/active-trip-route.ts` and `store/trip-store.ts` — **verified** not imported
  by any map component; the captain app has its own trip handling.
- Overwriting caption's `lib/api.ts` or `store/auth-store.ts` — caption has its own
  auth-wired versions; the ported services reuse them via `@/lib/api`.
- Setting up a Jest harness. Caption has none today; beeb's `.test.ts` files are **not**
  ported in this migration (see "Tests").

## Approach

**Faithful wholesale port + reconcile.** Add the missing map modules + assets, overwrite
the three divergent files with beeb's versions, swap the dependency, and reuse caption's
existing shared modules where they are identical/compatible. Because beeb's `TripMap`
deliberately preserved the old prop API (`MapRegion`, `TripMapHandle`,
`pickup/dropoff/driver/routeCoords/showsUserLocation`), the only live consumer —
`app/(trip)/[id].tsx` — needs **no changes** once the dependency stack is in place.

Rejected alternatives: coexist-under-new-names then cut over (leaves temporary duplication
for no benefit given the clean API match); extract a shared map package for both apps
(much larger lift; the apps have intentionally different brand palettes).

## Verification basis

The file lists below were produced by a transitive import-closure analysis of beeb's map
subsystem plus a cross-repo SHA256 diff, then re-checked by a completeness critic. Where a
claim is inferred rather than confirmed, it is flagged.

## Dependencies

**Add to `beeb-caption/package.json`:**

| Package | Version | Why |
| --- | --- | --- |
| `@maplibre/maplibre-react-native` | `^11.3.4` | Native MapLibre renderer (matches beeb's resolved 11.3.4). Peer deps (expo ≥54, react ≥19.1, react-native ≥0.80, @types/react ≥19.1) all satisfied by caption's identical versions. |
| `@maplibre/maplibre-gl-style-spec` | `24.8.5` | **Required** (not optional): `components/trip/poi-overlay.tsx` imports `type { ExpressionSpecification }` from it. Pin to the version `maplibre-react-native` resolves transitively to avoid a duplicate copy. |
| `expo-dev-client` | `~6.0.0` | DX only — dev launcher for the custom build. beeb has it; caption doesn't. Optional but recommended. Not a blocker. |

**Remove:** `react-native-maps` (only two code consumers, both overwritten by this work).

Install with `npx expo install` so SDK-compatible versions resolve.

## Native config (`app.json`)

- **Append** `"@maplibre/maplibre-react-native"` (bare string, as in beeb) to
  `expo.plugins`. This is the only required change.
- **No permission changes** — caption already has `ACCESS_FINE_LOCATION`,
  `ACCESS_COARSE_LOCATION`, and `NSLocationWhenInUseUsageDescription` (identical to beeb).
- **No change** to `newArchEnabled: true` or `experiments.reactCompiler: true` (both
  already match beeb; beeb runs MapLibre under both, so the config is proven, not
  speculative).
- After editing deps + plugin, run **`npx expo prebuild --clean`** then reinstall pods/gradle.
  Skipping prebuild after adding the plugin is the most common failure mode (the native
  MapLibre SDK / Android Maven repo / iOS pod won't be wired).

MapLibre is a native module → requires a custom dev build (not Expo Go). **This is not a
new constraint:** caption already ships `react-native-maps`, `@react-native-community/datetimepicker`,
and `react-native-worklets`, so it already requires a dev build today.

## Files

### ADD — copy verbatim from beeb (currently missing in caption)

| File | Role |
| --- | --- |
| `lib/map-style.ts` | CARTO basemap style URLs (`mapStyleFor`), coord conversions, bbox helpers, POI zoom constants. |
| `lib/poi-categories.ts` | Category → tier/glyph/color mapping, `buildTierOpacityExpression`, `TIER_MIN_ZOOM`, `POI_GLYPH_NAMES`. |
| `lib/poi-glyph-images.ts` | Glyph-name → bundled PNG map (`require()` of the 17 assets). |
| `hooks/use-pois.ts` | TanStack Query hooks: `useViewportPois`, `useCityPois`, `useNearbyPois`. |
| `services/places-nearby.ts` | POI service against `GET /api/places/nearby` (`getNearbyPois`, `getRadiusPois`, `poiLabel`, `Poi`/`PoiCategory`). |
| `services/zones.ts` | Zones service (`getZones`, `findContainingAbriyahZone`, `validatePins`, …). |
| `components/trip/poi-overlay.tsx` | MapLibre GeoJSON source + chip/glyph/label layers with per-tier zoom-fade + tap. |
| `components/trip/poi-feature-collection.ts` | Pure builder: `Poi[]` → GeoJSON FeatureCollection. |
| `components/trip/recenter-button.tsx` | Floating recenter FAB (RTL-aware). |
| `assets/poi-glyphs/*.png` | **17 PNGs** (medical, star, business, school, library, restaurant, cafe, card, bag-handle, bed, leaf, construct, car, wine, cut, camera, ellipse). Runtime `require()`s — won't surface as import errors; glyphs silently fail to render if missing. Keys must stay in sync with `POI_GLYPH_NAMES`. |

### OVERWRITE — caption's divergent file → beeb's version

| File | Why / compatibility |
| --- | --- |
| `components/trip/trip-map.tsx` | MapLibre rewrite. Prop API matches what `app/(trip)/[id].tsx` already passes (`driver`, `pickup`, `dropoff`, `routeCoords`, `showsUserLocation`) — **consumer unchanged**. Ref handle changes from `MapView` to `TripMapHandle{animateToRegion}`; no caller attaches a ref, so no breakage. |
| `components/trip/location-picker.tsx` | MapLibre rewrite. Dead code today (no external importer), so safe. Pulls in beeb's `places.ts` API (`searchPlaces(query, lang, cityPois, center)`, `reverseGeocode(coord, lang)`), `recenter-button`, `poi-overlay`, `use-pois`, `places-nearby` — all landed by this work. |
| `services/places.ts` | Beeb's version is a **superset** of caption's: adds Photon + Nominatim geocoding, viewport-POI search (`searchLoadedPois`), `'poi'` source value, lang-aware `reverseGeocode`. Imports `Poi` from `@/services/places-nearby` (added) and `haversineKm` from `@/hooks/use-distance` (already present). Still consumes `BAGHDAD_PLACES` (curated places are merged, not replaced). |

### ADAPT — small targeted edits to caption files (do NOT overwrite)

| File | Change |
| --- | --- |
| `hooks/use-current-location.ts` | `LatLng` type is byte-identical, so type-safe as-is. Beeb's version adds a `lastFix` cache + `getLastKnownPositionAsync()` fast path that makes recenter feel instant. **Port that additive enhancement** into caption's hook for recenter parity. Without it, recenter UX is degraded but functional. |
| `i18n/en.json` + `i18n/ar.json` | Add `booking.recenter` (confirmed missing; used by `recenter-button`). Other keys used by the ported components (`booking.searchPlaceholder/popularPlaces/locating/fromLabel/toLabel/noResults/searchResults`, `abriyah.pinOutsideZone`, `common.back/error/networkError/rateLimited`) are confirmed present. Verify the full set during implementation and add any other gaps surfaced. |
| `lib/api.ts` | **Optional, dev-only.** Beeb's `api.ts` collapses large arrays in its request/response logger specifically because `/api/places/nearby` returns hundreds of POIs per page and floods Metro. Caption's older `api.ts` lacks this. Either port just the log-summarization, or accept console noise in dev. Do **not** overwrite (auth wiring + `auth-store` differ). Recommended: port the log summarizer; low effort, dev-only. |

### LEAVE — already present in caption, identical or compatible (do nothing)

`services/routing.ts` (byte-identical), `lib/point-in-polygon.ts` (identical),
`lib/wkt.ts` (identical), `hooks/use-theme-colors.ts` (identical),
`store/theme-store.ts` (identical; exposes `scheme` for `mapStyleFor`),
`constants/places.ts` (identical; `BAGHDAD_PLACES` still consumed),
`constants/Typography.ts`, `constants/Spacing.ts`, `constants/Colors.ts`
(values differ — Violet vs Navy — but all map-used field names present in both),
`components/ui/icon.tsx`, `components/ui/button.tsx`, `hooks/use-distance.ts`.

## Data layer

The ported `services/places-nearby.ts` and `services/zones.ts` import `@/lib/api`.
Caption already has its own `@/lib/api` (axios instance + bearer-token interceptor wired to
the captain auth store). **Reuse caption's `@/lib/api` as-is** — do not port beeb's
`api.ts`/`auth-store.ts`. The import path `@/lib/api` resolves to caption's version
automatically, so no edit to the ported service files is needed for this.

**Backend endpoint contract** (`GET /api/places/nearby`):
- `bbox` mode (`getNearbyPois`): `bbox` (WGS84 **lng-first** `[minLng,minLat,maxLng,maxLat]`),
  `per_page=100`, `page` (default 4 pages), optional `category`.
- `radius` mode (`getRadiusPois`): `lat`, `lng`, `radius_m` (≤50000), `per_page`, `page`.
- Response envelope: `{ items, total, page, per_page }`, `total` capped at ~1000 per
  viewport (dataset ~285k POIs nationwide) → hence bbox paging.
- **Auth: public** (no token required) — *inferred* from the public sibling `/api/zones`
  and the client code contract; could not be confirmed from the OpenAPI spec because the
  endpoint is **undocumented**. Both apps share the same `EXPO_PUBLIC_API_URL`, so the
  captain token (even though unused for this endpoint) poses no access problem.

## Theming

The ported map reads colors via `useThemeColors()`, and both apps share the same `Colors`
field names. Markers / route / POI chips will **automatically adopt beeb-caption's violet
palette**, while the CARTO Positron / Dark-Matter basemap is identical to beeb. Net:
structurally the same map, tinted to the captain app's own brand. (Approved in brainstorming.)

## Tests

Caption has **no Jest** (no `jest` dep, no test script, zero test files). Beeb's six map
`.test.ts` files (`map-style`, `poi-categories`, `poi-glyph-images`,
`poi-feature-collection`, `places-nearby`, `places`) are **not ported** in this migration to
keep it focused. They protect real invariants worth knowing:
- POI bbox query order is **lng-first** (axis swap → silent empty result).
- `POI_GLYPH_IMAGES` keys stay in sync with `POI_GLYPH_NAMES`.
- per-tier opacity expression shape.

**Follow-up (out of scope):** add `jest-expo` + these tests. Flagged so the invariants
aren't silently lost.

## Risks & mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Overwriting the 3 targets before the new modules (ADD table) + maplibre dep land → `app/(trip)/[id].tsx` fails to build. | High | Strict sequencing (below): deps + modules + assets **before** overwrites. |
| Forgetting `npx expo prebuild --clean` after adding the plugin. | Medium | Hard step in sequencing, not a note. |
| `/api/places/nearby` undocumented in OpenAPI → contract could drift; public-auth assumption unconfirmed. | Medium | Log to `BACKEND_ISSUES.md`; document the reverse-engineered contract here. |
| Missing `booking.recenter` → raw key shown. | Low | Added in i18n step. |
| POI viewport fetch floods Metro console on caption's older `api.ts` logger. | Low (dev-only) | Port beeb's log-summarization (optional ADAPT). |
| `use-current-location` lacks `lastFix` → recenter not instant. | Low | Port the additive `lastFix` fast path (ADAPT). |
| 17 glyph PNGs are runtime `require()`s → silent no-render if missed. | Low | Explicit asset-copy checklist item; keys synced to `POI_GLYPH_NAMES`. |

## Sequencing

1. **Deps & config:** add the 3 packages, remove `react-native-maps`, append the app.json
   plugin, `npx expo install`.
2. **Add new modules** (the ADD table) + **copy the 17 glyph assets** + **add `booking.recenter`** i18n keys.
3. **ADAPT** caption's `use-current-location.ts` (lastFix) and optionally `api.ts` (logger).
4. **Overwrite** the 3 targets (`trip-map.tsx`, `location-picker.tsx`, `places.ts`).
5. **`npx expo prebuild --clean`** + reinstall native deps.
6. **Verify** (below).
7. Log the undocumented endpoint in `BACKEND_ISSUES.md`.

## Verification

- `npx tsc --noEmit` is clean (no unresolved imports — the dominant risk).
- App builds via dev build (`npx expo run:android` / `run:ios`).
- Manual smoke on the trip-detail screen (`app/(trip)/[id].tsx`): CARTO basemap renders
  styled (light/dark follows theme), pickup/dropoff/driver markers + route line draw, and
  **POI pins fade in by zoom tier** as in beeb.
- `react-native-maps` no longer imported anywhere (grep returns only the historical plan doc).
- Confirm `GET /api/places/nearby` returns POIs from the captain app (public endpoint).
