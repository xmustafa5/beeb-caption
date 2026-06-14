// components/captain/wizard-progress.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

const isRTL = I18nManager.isRTL // Stable for the session — forceRTL changes require a restart anyway

interface WizardProgressProps {
  current: number // 1-based
  total: number
}

export function WizardProgress({ current, total }: WizardProgressProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const segments = Array.from({ length: total })

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.xs + 2 }}>
        {segments.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              backgroundColor: i < current ? colors.tint : colors.surface,
            }}
          />
        ))}
      </View>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.register.step', { current, total })}
      </Text>
    </View>
  )
}
