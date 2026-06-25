/**
 * Maps a backend POI `category` (open vocabulary from /api/places/nearby) to a display tier,
 * an Ionicon glyph name, and a theme color key. Pure & dependency-free → unit-testable. The
 * backend has no importance field, so "important POIs always show" is approximated by tier here.
 */
import type { ThemeColors } from '@/constants/Colors'
export type PoiTier = 1 | 2 | 3
export type PoiColorKey = 'destructive' | 'accent' | 'success' | 'subtle'
export interface PoiStyle {
  tier: PoiTier
  icon: string
  colorKey: PoiColorKey
}

/**
 * Min zoom each tier starts appearing — the zoom at which a tier's pins begin to FADE IN (they reach
 * full opacity ~`TIER_FADE_SPAN` levels later; see `TIER_FADE`). Tier 1 = landmarks, visible from the
 * early gate; tier 2 = notable places, mid-zoom; tier 3 = fine detail, only when zoomed right in.
 * Widened from the old {12,13.5,15.5} because the dataset is dense (~285k POIs) — at the picker's
 * default ~z14 the old thresholds let tier-1+2 (which was nearly everything) flood the screen.
 */
export const TIER_MIN_ZOOM: Record<PoiTier, number> = { 1: 12, 2: 15, 3: 16.5 }

/** Zoom range (levels) over which a tier ramps from invisible to fully visible (and back, zooming out). */
export const TIER_FADE_SPAN = 1

/**
 * Per-tier fade band `[fadeInStart, fullyVisibleAt]`. A pin is invisible at/below `fadeInStart`,
 * fully opaque at/above `fullyVisibleAt`, and linearly interpolated between — so zooming in fades
 * each tier IN and zooming out fades it OUT, the standard map behavior. Derived from `TIER_MIN_ZOOM`
 * so that table stays the single source of truth.
 */
export const TIER_FADE: Record<PoiTier, readonly [number, number]> = {
  1: [TIER_MIN_ZOOM[1], TIER_MIN_ZOOM[1] + TIER_FADE_SPAN],
  2: [TIER_MIN_ZOOM[2], TIER_MIN_ZOOM[2] + TIER_FADE_SPAN],
  3: [TIER_MIN_ZOOM[3], TIER_MIN_ZOOM[3] + TIER_FADE_SPAN],
}

const TIERS: readonly PoiTier[] = [1, 2, 3]

/** A feature of `tier`'s opacity at `zoom`: 0 below its fade band, 1 above, linear within. */
function tierOpacityAt(tier: PoiTier, zoom: number): number {
  const [from, to] = TIER_FADE[tier]
  if (zoom <= from) return 0
  if (zoom >= to) return 1
  return (zoom - from) / (to - from)
}

/**
 * A MapLibre paint expression for per-tier zoom fade, returned as a plain JSON array so the renderer
 * (poi-overlay) doesn't depend on the style-spec types and this stays unit-testable.
 *
 * CRITICAL: MapLibre allows only ONE zoom-based `interpolate`/`step` PER expression — a `case`/`match`
 * that branches into a separate zoom curve per tier is rejected at runtime ("Only one zoom-based ...
 * subexpression may be used"). So we build a SINGLE `interpolate` over `['zoom']` whose value at each
 * breakpoint is a data-driven `match` on `['get','tier']` giving that tier's opacity at that zoom. The
 * breakpoints are the sorted-unique union of every tier's fade-band edges. One zoom curve, tier
 * branching folded into its stops → legal and equivalent to "fade each tier in over its own band".
 */
export function buildTierOpacityExpression(): unknown[] {
  const edges = [...new Set(TIERS.flatMap((t) => [...TIER_FADE[t]]))].sort((a, b) => a - b)
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']]
  for (const z of edges) {
    // ['match', ['get','tier'], 1, op1, 2, op2, op3-default]
    const match: unknown[] = ['match', ['get', 'tier']]
    match.push(1, tierOpacityAt(1, z))
    match.push(2, tierOpacityAt(2, z))
    match.push(tierOpacityAt(3, z)) // tier 3 (and any unknown tier) is the default arm
    expr.push(z, match)
  }
  return expr
}

/**
 * Category → tier/glyph/color. TIERING (the rider navigates by landmarks, not corner shops):
 *  - Tier 1 (landmarks, sparse, shown zoomed out): hospitals, universities, big attractions,
 *    government/civic, libraries.
 *  - Tier 2 (notable, mid-zoom): restaurants, cafés, banks, hotels, parks, schools, companies,
 *    pharmacies — useful and moderately dense.
 *  - Tier 3 (fine detail, only when zoomed right in): shops (the single biggest flood — ~70k
 *    nationwide), car repair/wash, salons, photo, off-licence, labs, confectioners, and the default.
 */
const MAP: Record<string, PoiStyle> = {
  // ── Tier 1 — landmarks ──
  hospital: { tier: 1, icon: 'medical', colorKey: 'destructive' },
  clinic: { tier: 1, icon: 'medical', colorKey: 'destructive' },
  attraction: { tier: 1, icon: 'star', colorKey: 'accent' },
  government: { tier: 1, icon: 'business', colorKey: 'subtle' },
  town_hall: { tier: 1, icon: 'business', colorKey: 'subtle' },
  embassy: { tier: 1, icon: 'business', colorKey: 'subtle' },
  university: { tier: 1, icon: 'school', colorKey: 'subtle' },
  library: { tier: 1, icon: 'library', colorKey: 'subtle' },

  // ── Tier 2 — notable ──
  restaurant: { tier: 2, icon: 'restaurant', colorKey: 'subtle' },
  cafe: { tier: 2, icon: 'cafe', colorKey: 'subtle' },
  bank: { tier: 2, icon: 'card', colorKey: 'subtle' },
  lodging: { tier: 2, icon: 'bed', colorKey: 'subtle' },
  park: { tier: 2, icon: 'leaf', colorKey: 'success' },
  garden: { tier: 2, icon: 'leaf', colorKey: 'success' },
  school: { tier: 2, icon: 'school', colorKey: 'subtle' },
  company: { tier: 2, icon: 'business', colorKey: 'subtle' },
  pharmacy: { tier: 2, icon: 'medical', colorKey: 'destructive' },

  // ── Tier 3 — fine detail ──
  shop: { tier: 3, icon: 'bag-handle', colorKey: 'subtle' },
  confectionery: { tier: 3, icon: 'restaurant', colorKey: 'subtle' },
  laboratory: { tier: 3, icon: 'medical', colorKey: 'destructive' },
  car_repair: { tier: 3, icon: 'construct', colorKey: 'subtle' },
  car: { tier: 3, icon: 'car', colorKey: 'subtle' },
  car_wash: { tier: 3, icon: 'car', colorKey: 'subtle' },
  alcohol: { tier: 3, icon: 'wine', colorKey: 'subtle' },
  beauty: { tier: 3, icon: 'cut', colorKey: 'subtle' },
  photo: { tier: 3, icon: 'camera', colorKey: 'subtle' },
}

const DEFAULT: PoiStyle = { tier: 3, icon: 'ellipse', colorKey: 'subtle' }

export function categoryStyle(category: string): PoiStyle {
  return MAP[category] ?? DEFAULT
}

/** Resolve a POI color key to the concrete theme hex (MapLibre paint needs a literal color). */
export function poiCircleColor(colorKey: PoiColorKey, colors: ThemeColors): string {
  return colors[colorKey]
}

/** Distinct Ionicon names categoryStyle can return (MAP values + the default), deduped. */
export const POI_GLYPH_NAMES: readonly string[] = Array.from(
  new Set([...Object.values(MAP).map((s) => s.icon), DEFAULT.icon]),
)
