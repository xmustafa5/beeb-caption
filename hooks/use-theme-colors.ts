import { Colors, type ThemeColors } from '@/constants/Colors'
import { useThemeStore } from '@/store/theme-store'

export function useThemeColors(): ThemeColors {
  const scheme = useThemeStore((s) => s.scheme)
  return Colors[scheme]
}
