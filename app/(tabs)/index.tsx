import { useState } from 'react'
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { TopUpSheet } from '@/components/captain/top-up-sheet'
import { useActivation } from '@/hooks/use-activation'
import { DEFAULT_DAILY_FEE_IQD } from '@/services/activation'
import { getWallet } from '@/services/wallet'
import { formatIqd } from '@/lib/format-currency'
import { parseApiError, apiErrorKey } from '@/lib/api'

const isRTL = I18nManager.isRTL

export default function HomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { query, activate } = useActivation()

  const [error, setError] = useState<string | null>(null)
  const [showTopUp, setShowTopUp] = useState(false)
  const [insufficient, setInsufficient] = useState(false)
  const [balanceIqd, setBalanceIqd] = useState(0)

  const activation = query.data?.activation ?? null
  const feeIqd = activation?.feeAmountIqd ?? DEFAULT_DAILY_FEE_IQD

  async function runActivate() {
    setError(null)
    try {
      await activate.mutateAsync()
      setInsufficient(false)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 402) {
        // Fetch balance so the insufficient-funds card + sheet can show it.
        try {
          const w = await getWallet()
          setBalanceIqd(w.balanceIqd)
        } catch {
          setBalanceIqd(0)
        }
        setInsufficient(true)
      } else {
        setError(t(apiErrorKey(err, 'captain.activate.activateFailed')))
      }
    }
  }

  // Loading
  if (query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.tint} />
      </View>
    )
  }

  // Initial load failed (network / 403) — don't render a misleading activate card.
  if (query.isError && !query.data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: Spacing.xl, gap: Spacing.lg }}>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
          {t('common.networkError')}
        </Text>
        <Button label={t('common.retry')} variant="secondary" onPress={() => query.refetch()} />
      </View>
    )
  }

  const activated = query.data?.activated === true

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}
    >
      <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal' }}>
        {t('captain.activate.homeTitle')}
      </Text>

      {activated ? (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.md,
            alignItems: 'center',
            boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
          }}
        >
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
            {t('captain.activate.activatedTitle')}
          </Text>
          <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
            {t('captain.activate.activatedBody', { fee: formatIqd(feeIqd) })}
          </Text>
          {/* Area 3 (online toggle) mounts here. */}
          <Text style={{ ...Typography['caption-sm'], color: colors.muted, textAlign: 'center', fontStyle: 'normal' }}>
            {t('captain.activate.onlineComingSoon')}
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.lg,
            boxShadow: '0px 8px 24px rgba(13, 24, 42, 0.08)',
          }}
        >
          <View style={{ gap: Spacing.sm, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-md'], color: colors.text }}>
              {t('captain.activate.notActivatedTitle')}
            </Text>
            <Text style={{ ...Typography.body, color: colors.subtle, fontStyle: 'normal' }}>
              {insufficient
                ? t('captain.activate.insufficientBody', { balance: formatIqd(balanceIqd), fee: formatIqd(feeIqd) })
                : t('captain.activate.feeNotice', { fee: formatIqd(feeIqd) })}
            </Text>
          </View>

          <FormError message={error} />

          {insufficient ? (
            <Button
              label={t('captain.activate.topUpAndActivate')}
              onPress={() => setShowTopUp(true)}
              leading={<Icon name="wallet-outline" size={18} color={colors.onTint} />}
            />
          ) : (
            <Button
              label={t('captain.activate.activateCta')}
              loading={activate.isPending}
              onPress={runActivate}
            />
          )}
        </View>
      )}

      <TopUpSheet
        visible={showTopUp}
        balanceIqd={balanceIqd}
        feeIqd={feeIqd}
        onClose={() => setShowTopUp(false)}
        onToppedUp={() => {
          setShowTopUp(false)
          runActivate()
        }}
      />
    </ScrollView>
  )
}
