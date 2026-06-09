// Beeb brand palette — Sky-Blue/Navy edition (per the v2 brand reference).
// Sky Blue #3A86FF (primary), Indigo #6C5CE7, Soft Orange #FFBC42 (motion accent),
// Deep Navy #0D182A, Light Gray #F2FAF7, Off White #FAFAFC, Dark Gray #333A45,
// Success Green #22C55E, Danger Red #FF5A5F.
//
// Keep field names stable so consumers don't need to change.

export const Colors = {
  light: {
    text: '#0D182A',
    background: '#FFFFFF',
    tint: '#3A86FF',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#3A86FF',
    card: '#FFFFFF',
    border: '#E5E7EB',
    secondary: '#333A45',
    subtle: '#6B7280',
    surface: '#F2FAF7',
    cardElevated: '#FAFAFC',
    destructive: '#FF5A5F',
    muted: '#BDBDBD',
    onTint: '#FFFFFF',
    accent: '#FFBC42',
    success: '#22C55E',
    info: '#6C5CE7',
  },
  dark: {
    text: '#FAFAFC',
    background: '#0D182A',
    tint: '#3A86FF',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#3A86FF',
    card: '#15233A',
    border: '#26334B',
    secondary: '#E5E7EB',
    subtle: '#9CA3AF',
    surface: '#15223A',
    cardElevated: '#1A2A45',
    destructive: '#FF6B70',
    muted: '#3F3F45',
    onTint: '#FFFFFF',
    accent: '#FFBC42',
    success: '#4ADE80',
    info: '#9D8DFF',
  },
} as const

export type ThemeColors = typeof Colors.light | typeof Colors.dark
