import { TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Icon } from '@/components/ui/icon'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Spacing } from '@/constants/Spacing'

export interface RecenterButtonProps {
  onPress: () => void
  /** Clears bottom chrome (e.g. the address card). Defaults to safe-area inset + lg. */
  bottomOffset?: number
}

export function RecenterButton({ onPress, bottomOffset }: RecenterButtonProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('booking.recenter')}
      style={{
        position: 'absolute',
        bottom: bottomOffset ?? insets.bottom + Spacing.lg,
        // Trailing physical edge: right in LTR, left in RTL.
        ...(I18nManager.isRTL ? { left: Spacing.lg } : { right: Spacing.lg }),
        width: 48,
        height: 48,
        borderRadius: 24,
        borderCurve: 'continuous',
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0px 2px 10px rgba(0,0,0,0.18)',
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name="locate" size={22} color={colors.tint} />
    </TouchableOpacity>
  )
}
