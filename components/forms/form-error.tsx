import { View, Text } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

/** Inline API-error banner shown above a form's submit button. */
export function FormError({ message }: { message?: string | null }) {
  const colors = useThemeColors()
  if (!message) return null
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut}>
      <View
        style={{
          flexDirection: 'row', // native forceRTL mirrors this row in AR — no manual flip
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
            // Reading-start, so the message hugs its icon. RN swaps left/right on
            // <Text> under RTL, so 'left' resolves to visual right in AR; an
            // isRTL ternary here would pin the Arabic to visual LEFT and tear it
            // away from the icon (iOS RCTAttributedTextUtils swaps Right→Left;
            // Android maps 'right' to ALIGN_OPPOSITE).
            textAlign: 'left',
          }}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  )
}
