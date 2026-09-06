import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  I18nManager,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { PeriodTabs } from '@/components/captain/period-tabs'
import { EarningsSummary } from '@/components/captain/earnings-summary'
import { useEarnings } from '@/hooks/use-earnings'
import { formatIqd } from '@/lib/format-currency'
import type { EarningsPeriod, EarningsHistoryItem } from '@/services/earnings'

// Stable for the session — forceRTL flips require a restart anyway.
const isRTL = I18nManager.isRTL

/**
 * Earnings, moved off the profile tab onto its own screen (reached from the
 * Earnings row in the profile). Splitting it out is also what finally renders
 * `useEarnings().history`: the hook has always issued the trip-history query
 * alongside the summary, but the profile only ever read `earnings` and threw the
 * history away. The `captain.earnings.history*` strings were already translated
 * in both locales, waiting for a screen with room for them.
 */
export default function EarningsScreen() {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const isAr = i18n.language === 'ar'
  const [period, setPeriod] = useState<EarningsPeriod>('today')
  const { earnings, history, isLoading, isRefetching, refetch } = useEarnings(period)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: Spacing.md,
          paddingHorizontal: Spacing.md,
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Back glyph: icons don't auto-flip, so swap it in AR. */}
          <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ ...Typography['heading-sm'], color: colors.text }}>
          {t('captain.earnings.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          gap: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          // `earnings.loadFailed` tells the captain to pull to refresh — so the
          // gesture has to exist. It refetches the summary AND the history.
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.tint} />
        }
      >
        <PeriodTabs value={period} onChange={setPeriod} />

        {isLoading ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xl * 2 }}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : earnings ? (
          <EarningsSummary earnings={earnings} />
        ) : (
          <Text
            style={{
              ...Typography['caption-sm'],
              color: colors.destructive,
              fontStyle: 'normal',
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {t('captain.earnings.loadFailed')}
          </Text>
        )}

        {/* ── Trip history for the selected period ── */}
        {!isLoading && (
          <View style={{ gap: Spacing.md }}>
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
              {t('captain.earnings.history')}
            </Text>

            {history.length === 0 ? (
              <Text
                style={{
                  ...Typography['caption-sm'],
                  color: colors.subtle,
                  fontStyle: 'normal',
                  textAlign: isRTL ? 'right' : 'left',
                }}
              >
                {t('captain.earnings.historyEmpty')}
              </Text>
            ) : (
              <View
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 16,
                  borderCurve: 'continuous',
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
              >
                {history.map((item, i) => (
                  <HistoryRow
                    key={item.tripId}
                    item={item}
                    isFirst={i === 0}
                    isAr={isAr}
                    colors={colors}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

interface HistoryRowProps {
  item: EarningsHistoryItem
  isFirst: boolean
  isAr: boolean
  colors: ReturnType<typeof useThemeColors>
}

function HistoryRow({ item, isFirst, isAr, colors }: HistoryRowProps) {
  const { t } = useTranslation()
  const date = new Date(item.completedAt)
  // A malformed timestamp must not render "Invalid Date" next to a real fare.
  const label = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(isAr ? 'ar' : undefined)

  return (
    <View
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        padding: Spacing.md + 2,
        borderTopWidth: isFirst ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={item.tripType === 'abriyah' ? 'people-outline' : 'car-outline'}
          size={18}
          color={colors.text}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }} numberOfLines={1}>
          {t(item.tripType === 'abriyah' ? 'captain.earnings.tripAbriyah' : 'captain.earnings.tripRegular')}
        </Text>
        <Text
          style={{
            ...Typography['caption-sm'],
            color: colors.subtle,
            fontStyle: 'normal',
            // Locale-aware date — aligns to the reading start so the line reads correctly in AR.
            textAlign: 'left',
          }}
        >
          {label}
        </Text>
      </View>

      {/* Fare is a Western/AR-grouped number — lock LTR + tabular figures under native forceRTL */}
      <Text
        style={{
          ...Typography['body-md'],
          color: colors.text,
          writingDirection: 'ltr',
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatIqd(item.fareIqd, isAr ? 'ar' : 'en')}
      </Text>
    </View>
  )
}
