// components/captain/period-tabs.tsx
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import type { EarningsPeriod } from '@/services/earnings'

// Stable for the session — forceRTL changes require a restart anyway
const isRTL = I18nManager.isRTL
const PERIODS: EarningsPeriod[] = ['today', 'week', 'month']

interface PeriodTabsProps {
  value: EarningsPeriod
  onChange: (period: EarningsPeriod) => void
}

export function PeriodTabs({ value, onChange }: PeriodTabsProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <View
      style={{
        flexDirection: isRTL ? 'row-reverse' : 'row',
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 4,
        gap: 4,
      }}
    >
      {PERIODS.map((p) => {
        const active = value === p
        return (
          <TouchableOpacity
            key={p}
            onPress={() => onChange(p)}
            activeOpacity={0.85}
            style={{
              flex: 1,
              paddingVertical: Spacing.sm + 2,
              borderRadius: 11,
              borderCurve: 'continuous',
              backgroundColor: active ? colors.card : 'transparent',
              alignItems: 'center',
              ...(active ? { boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.08)' } : {}),
            }}
          >
            <Text
              style={{
                ...Typography['caption-sm'],
                color: active ? colors.text : colors.subtle,
                fontStyle: 'normal',
                fontFamily: active ? 'Poppins_600SemiBold' : undefined,
              }}
            >
              {t(`captain.earnings.${p}`)}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
