import { View, type ViewStyle } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'

interface BannerProps {
  height?: number
  rounded?: boolean
  style?: ViewStyle
}

export function Banner({ height = 320, rounded = true, style }: BannerProps) {
  const colors = useThemeColors()
  return (
    <View
      style={{
        height,
        borderRadius: rounded ? 24 : 0,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.tint,
        ...style,
      }}
    />
  )
}
