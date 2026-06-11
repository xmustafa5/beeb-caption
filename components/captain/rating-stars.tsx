// components/captain/rating-stars.tsx
import { View, TouchableOpacity, I18nManager } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

const isRTL = I18nManager.isRTL

interface RatingStarsProps {
  value: number
  onChange: (stars: number) => void
}

export function RatingStars({ value, onChange }: RatingStarsProps) {
  const colors = useThemeColors()
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={6}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={32} color={colors.tint} />
        </TouchableOpacity>
      ))}
    </View>
  )
}
