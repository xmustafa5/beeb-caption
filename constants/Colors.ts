// Beeb Captain brand palette — Royal Violet edition.
// Violet #7C3AED (primary), Soft Amber #FFBC42 (accent),
// true-black dark mode (no navy), white light mode,
// Success Green #22C55E, Danger Red #FF5A5F.
//
// Keep field names stable so consumers don't need to change.

export const Colors = {
  light: {
    text: '#0B0B0F',
    background: '#FFFFFF',
    tint: '#7C3AED',
    tabIconDefault: '#9CA3AF',
    tabIconSelected: '#7C3AED',
    card: '#FFFFFF',
    border: '#ECECF1',
    secondary: '#3A3A42',
    subtle: '#6B7280',
    surface: '#F5F4F8',
    cardElevated: '#FAFAFC',
    destructive: '#FF5A5F',
    muted: '#C9C9D2',
    onTint: '#FFFFFF',
    accent: '#FFBC42',
    success: '#22C55E',
    info: '#A78BFA',
  },
  dark: {
    text: '#F5F5F7',
    background: '#000000',
    tint: '#A78BFA',
    tabIconDefault: '#6B7280',
    tabIconSelected: '#A78BFA',
    card: '#0E0E12',
    border: '#23232B',
    secondary: '#E5E7EB',
    subtle: '#9296A1',
    surface: '#16161C',
    cardElevated: '#1C1C24',
    destructive: '#FF6B70',
    muted: '#3A3A44',
    onTint: '#15071F',
    accent: '#FFBC42',
    success: '#4ADE80',
    info: '#C4B5FD',
  },
} as const

export type ThemeColors = typeof Colors.light | typeof Colors.dark
