import { useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { PeriodTabs } from '@/components/captain/period-tabs'
import { EarningsSummary } from '@/components/captain/earnings-summary'
import { useEarnings } from '@/hooks/use-earnings'
import { formatIqd } from '@/lib/format-currency'
import type { EarningsPeriod } from '@/services/earnings'

const isRTL = I18nManager.isRTL

export default function EarningsScreen() {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const [period, setPeriod] = useState<EarningsPeriod>('today')
  const { earnings, history, isLoading, isRefetching, refetch } = useEarnings(period)

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.earnings.title')}
      </Text>

      <PeriodTabs value={period} onChange={setPeriod} />

      {isLoading ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl * 2 }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : earnings ? (
        <EarningsSummary earnings={earnings} />
      ) : (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.earnings.loadFailed')}
        </Text>
      )}

      {!isLoading && earnings && (
        <>
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.earnings.history')}
          </Text>

          {history.length === 0 ? (
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.earnings.historyEmpty')}
            </Text>
          ) : (
            history.map((item) => (
              <View
                key={item.tripId}
                style={{
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  borderCurve: 'continuous',
                  paddingVertical: Spacing.md,
                  paddingHorizontal: Spacing.lg,
                }}
              >
                <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start', gap: 2 }}>
                  <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
                    {t(item.tripType === 'abriyah' ? 'captain.earnings.tripAbriyah' : 'captain.earnings.tripRegular')}
                  </Text>
                  <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
                    {new Date(item.completedAt).toLocaleDateString(i18n.language === 'ar' ? 'ar-IQ' : 'en-GB')}
                  </Text>
                </View>
                <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
                  {formatIqd(item.fareIqd)}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>
  )
}
