// Beep Captain brand palette — Burgundy edition (2026-10 identity, shared with the Beep rider app).
// Burgundy #76033E (primary, matches the app icon), Rose #B8336A (accent),
// warm-neutral greys, true-black dark mode (no burgundy bg), white light mode,
// Success Green #22C55E, Danger Red #FF5A5F.
//
// Keep field names stable so consumers don't need to change.

export const Colors = {
  light: {
    text: '#120B0F',
    background: '#FFFFFF',
    tint: '#76033E',
    tintDark: '#4A0026',
    tintBright: '#9E1A5E',
    tabIconDefault: '#A39AA0',
    tabIconSelected: '#76033E',
    card: '#FFFFFF',
    border: '#EDE6EA',
    secondary: '#3D353A',
    subtle: '#756B71',
    surface: '#F7F3F5',
    cardElevated: '#FCFAFB',
    destructive: '#FF5A5F',
    muted: '#D6CCD2',
    onTint: '#FFFFFF',
    accent: '#B8336A',
    success: '#22C55E',
    info: '#D47FA6',
    // Full-screen photo viewer: photos read best on black in either theme.
    mediaBackdrop: '#000000',
    onMediaBackdrop: '#FFFFFF',
  },
  dark: {
    text: '#F7F3F5',
    background: '#000000',
    tint: '#E07AAA',
    tintDark: '#9E1A5E',
    tintBright: '#F2A9CB',
    tabIconDefault: '#756B71',
    tabIconSelected: '#E07AAA',
    card: '#120B0F',
    border: '#2A1F25',
    secondary: '#EAE3E7',
    subtle: '#A0959B',
    surface: '#1B1218',
    cardElevated: '#22171E',
    destructive: '#FF6B70',
    muted: '#40333A',
    onTint: '#1A0610',
    accent: '#E07AAA',
    success: '#4ADE80',
    info: '#F2A9CB',
    mediaBackdrop: '#000000',
    onMediaBackdrop: '#FFFFFF',
  },
} as const

export type ThemeColors = typeof Colors.light | typeof Colors.dark
