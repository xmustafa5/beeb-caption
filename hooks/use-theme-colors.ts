import { useColorScheme } from 'react-native'
import { Colors, type ThemeColors } from '@/constants/Colors'

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme() ?? 'light'
  return Colors[scheme]
}
