import { View, Text, I18nManager } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

const isRTL = I18nManager.isRTL

/** Inline API-error banner shown above a form's submit button. */
export function FormError({ message }: { message?: string | null }) {
  const colors = useThemeColors()
  if (!message) return null
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          backgroundColor: `${colors.destructive}14`,
          borderRadius: 12,
          borderCurve: 'continuous',
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <Icon name="alert-circle" size={18} color={colors.destructive} />
        <Text
          style={{
            ...Typography['caption-sm'],
            color: colors.destructive,
            flex: 1,
            fontStyle: 'normal',
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}
