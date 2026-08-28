// components/captain/abriyah-access-card.tsx
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { useAbriyahAccess } from '@/hooks/use-abriyah-access'

/**
 * Abriyah (shared-ride) access — read-only.
 *
 * There is deliberately no action here. The scope is chosen by an admin when
 * the captain is approved and changed from the dashboard afterwards, so the
 * card's whole job is to explain why the captain does or does not receive
 * shared-ride offers. It used to carry a "Request access" button; that request
 * queue no longer exists, and a button that silently does nothing is worse than
 * no button.
 */
export function AbriyahAccessCard() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { enabled } = useAbriyahAccess()

  const tone = enabled ? colors.success : colors.subtle

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        padding: Spacing.lg,
        gap: Spacing.md,
      }}
    >
      {/* Header row: icon + title + status pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <View
          style={{
            width: 40, height: 40, borderRadius: 10, borderCurve: 'continuous',
            backgroundColor: colors.tint + '1A',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="people" size={20} color={colors.tint} />
        </View>
        <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1, textAlign: 'left' }}>
          {t('abriyahAccess.title')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone + '1A', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: tone }} />
          <Text style={{ ...Typography['caption-sm'], color: tone, fontStyle: 'normal' }}>
            {t(enabled ? 'abriyahAccess.enabled' : 'abriyahAccess.notEnabled')}
          </Text>
        </View>
      </View>

      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
        {t(enabled ? 'abriyahAccess.descEnabled' : 'abriyahAccess.descNotEnabled')}
      </Text>
    </View>
  )
}
