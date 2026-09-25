// components/captain/box-summary-row.tsx
import { View, Text, Pressable, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { BoxDetails } from '@/services/box'

interface BoxSummaryRowProps {
  details: BoxDetails | undefined
  /** Tapping the summary jumps to the full parcel card further down. */
  onPress: () => void
  onCallRecipient: () => void
}

/**
 * One line above the step button on a Box trip: what's being carried and a
 * one-tap call to the recipient. The full parcel card (photos, name, number)
 * sits BELOW the step buttons so the primary action stays above the fold on
 * small phones. Always rendered for a Box — a placeholder while loading — so
 * the step button doesn't jump down when the details arrive.
 */
export function BoxSummaryRow({ details, onPress, onCallRecipient }: BoxSummaryRowProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const canCall = !!details?.recipientPhone

  return (
    // native forceRTL mirrors this row in AR — no manual flip
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderCurve: 'continuous',
        paddingVertical: Spacing.sm,
        paddingLeft: Spacing.md,
        paddingRight: Spacing.sm,
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('captain.box.title')}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}
      >
        <Icon name="cube" size={18} color={colors.tint} />
        <Text
          numberOfLines={1}
          style={{ ...Typography['body-md'], fontSize: 14, color: colors.text, textAlign: 'left', flex: 1 }}
        >
          {details?.description ?? '…'}
        </Text>
      </Pressable>
      <TouchableOpacity
        onPress={onCallRecipient}
        disabled={!canCall}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('captain.box.callRecipient')}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: colors.tint,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: canCall ? 1 : 0.5,
        }}
      >
        <Icon name="call" size={18} color={colors.onTint} />
      </TouchableOpacity>
    </View>
  )
}
