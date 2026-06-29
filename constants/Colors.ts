// Beeb Captain brand palette — Royal Navy edition (shared with the Beeb rider app).
// Navy #1F3A6D (primary), Steel Blue #4F77C4 (accent),
// true-black dark mode (no navy bg), white light mode,
// Success Green #22C55E, Danger Red #FF5A5F.
//
// Keep field names stable so consumers don't need to change.

export const Colors = {
  light: {
    text: '#0B0F16',
    background: '#FFFFFF',
    tint: '#1F3A6D',
    tintDark: '#142A52',
    tintBright: '#2E5499',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#1F3A6D',
    card: '#FFFFFF',
    border: '#E6EAF1',
    secondary: '#363A45',
    subtle: '#6B7280',
    surface: '#F4F6FA',
    cardElevated: '#FAFBFD',
    destructive: '#FF5A5F',
    muted: '#C7CDD9',
    onTint: '#FFFFFF',
    accent: '#4F77C4',
    success: '#22C55E',
    info: '#7BA0DD',
  },
  dark: {
    text: '#F4F6FA',
    background: '#000000',
    tint: '#7BA0DD',
    tintDark: '#2E5499',
    tintBright: '#A9C2EC',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#7BA0DD',
    card: '#0C1018',
    border: '#1F2530',
    secondary: '#E2E6EE',
    subtle: '#929AA8',
    surface: '#141A24',
    cardElevated: '#1A2230',
    destructive: '#FF6B70',
    muted: '#363E4C',
    onTint: '#08111F',
    accent: '#7BA0DD',
    success: '#4ADE80',
    info: '#A9C2EC',
  },
} as const

export type ThemeColors = typeof Colors.light | typeof Colors.dark
