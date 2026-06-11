// components/captain/earnings-summary.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { formatIqd } from '@/lib/format-currency'
import type { Earnings } from '@/services/earnings'

const isRTL = I18nManager.isRTL

interface EarningsSummaryProps {
  earnings: Earnings
}

export function EarningsSummary({ earnings }: EarningsSummaryProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 22,
        borderCurve: 'continuous',
        padding: Spacing.xl,
        gap: Spacing.md,
        boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
      }}
    >
      <Row label={t('captain.earnings.gross')} value={formatIqd(earnings.grossIqd)} colors={colors} />
      <Row label={t('captain.earnings.activationFee')} value={`- ${formatIqd(earnings.activationFeeIqd)}`} colors={colors} muted />
      <View style={{ height: 1, backgroundColor: colors.border }} />
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{t('captain.earnings.net')}</Text>
        <Text style={{ ...Typography['heading-md'], color: colors.text, fontVariant: ['tabular-nums'] }}>{formatIqd(earnings.netIqd)}</Text>
      </View>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.earnings.tripCount', { count: earnings.tripCount })}
      </Text>
    </View>
  )
}

interface RowProps {
  label: string
  value: string
  colors: ReturnType<typeof useThemeColors>
  muted?: boolean
}

function Row({ label, value, colors, muted }: RowProps) {
  return (
    <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>{label}</Text>
      <Text style={{ ...Typography['body-md'], color: muted ? colors.subtle : colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}
