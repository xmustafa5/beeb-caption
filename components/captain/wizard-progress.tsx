// components/captain/wizard-progress.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

const isRTL = I18nManager.isRTL

interface WizardProgressProps {
  current: number // 1-based
  total: number
}

export function WizardProgress({ current, total }: WizardProgressProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const dots = Array.from({ length: total })

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.xs + 2 }}>
        {dots.map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 3,
              backgroundColor: i < current ? colors.onTint : 'rgba(255,255,255,0.35)',
            }}
          />
        ))}
      </View>
      <Text style={{ ...Typography['caption-sm'], color: colors.onTint, opacity: 0.85, fontStyle: 'normal' }}>
        {t('captain.register.step', { current, total })}
      </Text>
    </View>
  )
}
