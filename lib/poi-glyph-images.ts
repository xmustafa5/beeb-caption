import type { ImageRequireSource } from 'react-native'

/**
 * Glyph-name → bundled PNG, registered with the map via <Images> so the POI symbol layer
 * can reference each by name through `icon-image`. Keys MUST match POI_GLYPH_NAMES (asserted
 * in the test). Metro needs literal require paths, so this is written out explicitly; re-run
 * scripts/gen-poi-glyphs.py and add a line here when poi-categories adds a new glyph.
 */
export const POI_GLYPH_IMAGES: Record<string, ImageRequireSource> = {
  medical: require('@/assets/poi-glyphs/medical.png'),
  star: require('@/assets/poi-glyphs/star.png'),
  business: require('@/assets/poi-glyphs/business.png'),
  school: require('@/assets/poi-glyphs/school.png'),
  library: require('@/assets/poi-glyphs/library.png'),
  restaurant: require('@/assets/poi-glyphs/restaurant.png'),
  cafe: require('@/assets/poi-glyphs/cafe.png'),
  card: require('@/assets/poi-glyphs/card.png'),
  'bag-handle': require('@/assets/poi-glyphs/bag-handle.png'),
  bed: require('@/assets/poi-glyphs/bed.png'),
  leaf: require('@/assets/poi-glyphs/leaf.png'),
  construct: require('@/assets/poi-glyphs/construct.png'),
  car: require('@/assets/poi-glyphs/car.png'),
  wine: require('@/assets/poi-glyphs/wine.png'),
  cut: require('@/assets/poi-glyphs/cut.png'),
  camera: require('@/assets/poi-glyphs/camera.png'),
  ellipse: require('@/assets/poi-glyphs/ellipse.png'),
}
