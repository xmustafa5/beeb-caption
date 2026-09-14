import { View } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'

/** Round preview of a real-world color (e.g. car paint), outlined so white still shows on a white card. */
export function ColorSwatch({ color, size = 18 }: { color: string; size?: number }) {
  const colors = useThemeColors()
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, borderWidth: 1, borderColor: colors.border }}
    />
  )
}
