import { useState } from 'react'
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, I18nManager, Switch, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useCaptainPresence, type ConnectionHealth } from '@/providers/captain-presence'
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
import { useActiveTrip } from '@/hooks/use-active-trip'
import { DEFAULT_DAILY_FEE_IQD, getTodayActivation } from '@/services/activation'
import { getWallet } from '@/services/wallet'
import { useQiCardCheckout } from '@/hooks/use-qicard-checkout'
import { formatIqd } from '@/lib/format-currency'
import { parseApiError, apiErrorKey } from '@/lib/api'

export default function HomeScreen() {
  const { t, i18n } = useTranslation()
  // Drive layout off the active language, not I18nManager.isRTL: in dev the native
  // RTL flag can lag a forceRTL restart, leaving isRTL=false while the UI is Arabic.
  const isRTL = i18n.language === 'ar' || I18nManager.isRTL
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { query, activate } = useActivation()
  const { checkout } = useQiCardCheckout()

  const [error, setError] = useState<string | null>(null)
  const [showTopUp, setShowTopUp] = useState(false)
  const [insufficient, setInsufficient] = useState(false)
  const [balanceIqd, setBalanceIqd] = useState(0)
  const [payingCard, setPayingCard] = useState(false)

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

  // Pay the daily activation fee directly by card (QiCard), skipping the wallet.
  // daily_fee checkout needs the activation id as target_id and the exact fee as
  // the amount — both server-enforced. The activate POST is idempotent and returns
  // the row even when the wallet charge failed (402), so we use it to resolve the id.
  async function payDailyFeeByCard() {
    setError(null)
    setPayingCard(true)
    try {
      let target = activation
      if (!target) {
        // No row yet (or stale): create/fetch it. A 402 still yields a row to pay.
        try {
          target = await activate.mutateAsync()
        } catch {
          target = (await getTodayActivation()).activation
        }
      }
      if (!target) {
        setError(t('captain.activate.activateFailed'))
        return
      }
      const outcome = await checkout('daily_fee', target.feeAmountIqd, target.id)
      if (outcome.kind === 'paid') {
        // Settling flips the activation to paid server-side; refetch the gate.
        setInsufficient(false)
        await query.refetch()
      } else if (outcome.kind === 'failed') {
        setError(t('captain.activate.cardPaymentFailed'))
      } else if (outcome.kind === 'pending') {
        // Live mode, not settled yet — tell the captain to check back.
        setError(t('captain.activate.cardPaymentPending'))
        query.refetch()
      }
      // 'cancelled' → silent; the captain dismissed the form.
    } catch (err) {
      setError(t(apiErrorKey(err, 'captain.activate.cardPaymentFailed')))
    } finally {
      setPayingCard(false)
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
      refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => { setInsufficient(false); setError(null); query.refetch() }}
          />
        }
    >
      <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.activate.homeTitle')}
      </Text>

      <ActiveTripBanner />

      {activated ? (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.md,
            alignItems: isRTL ? 'flex-end' : 'flex-start',
            boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.08)',
          }}
        >
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success + '22', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="checkmark-circle" size={40} color={colors.success} />
          </View>
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.activate.activatedTitle')}
          </Text>
          <Text style={{ ...Typography.body, color: colors.subtle, textAlign: isRTL ? 'right' : 'left', fontStyle: 'normal' }}>
            {t('captain.activate.activatedBody', { fee: formatIqd(feeIqd, isRTL ? 'ar' : 'en') })}
          </Text>
          <OnlineToggle />
        </View>
      ) : (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: 22,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.lg,
            boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.08)',
          }}
        >
          <View style={{ gap: Spacing.sm, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
            <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
              {insufficient ? t('captain.activate.insufficientTitle') : t('captain.activate.notActivatedTitle')}
            </Text>
            <Text style={{ ...Typography.body, color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
              {insufficient
                ? t('captain.activate.insufficientBody', { balance: formatIqd(balanceIqd, isRTL ? 'ar' : 'en'), fee: formatIqd(feeIqd, isRTL ? 'ar' : 'en') })
                : t('captain.activate.feeNotice', { fee: formatIqd(feeIqd, isRTL ? 'ar' : 'en') })}
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

          {/* Pay the daily fee directly by card (QiCard hosted form) — works
              whether or not the wallet has funds. */}
          <Button
            label={t('captain.activate.payByCard', { fee: formatIqd(feeIqd, isRTL ? 'ar' : 'en') })}
            variant="secondary"
            loading={payingCard}
            onPress={payDailyFeeByCard}
            leading={<Icon name="card-outline" size={18} color={colors.text} />}
          />
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

// Persistent "you have a trip in progress" banner. Visible on the home screen
// whenever the captain has an active trip, so they can return to the live-trip
// screen after navigating away. Clears itself when the trip ends (the query polls).
function ActiveTripBanner() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar' || I18nManager.isRTL
  const colors = useThemeColors()
  const router = useRouter()
  const { data: trip } = useActiveTrip()

  if (!trip) return null

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(trip.tripType === 'abriyah' && trip.roomId ? `/(trip)/room/${trip.roomId}` : `/(trip)/${trip.id}`)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        backgroundColor: colors.tint,
        borderRadius: 18,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.12)',
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff22', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="navigate" size={20} color={colors.onTint} />
      </View>
      <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        <Text style={{ ...Typography['body-md'], color: colors.onTint, textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.live.resumeTitle')}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.onTint, opacity: 0.85, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
          {t('captain.live.resumeSubtitle')}
        </Text>
      </View>
      <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.onTint} />
    </TouchableOpacity>
  )
}

const HEALTH_COLORS: Record<ConnectionHealth, 'muted' | 'success' | 'tint' | 'destructive'> = {
  offline: 'muted',
  connecting: 'tint',
  live: 'success',
  stale: 'destructive',
}

function OnlineToggle() {
  const { t, i18n } = useTranslation()
  const isRTL = i18n.language === 'ar' || I18nManager.isRTL
  const colors = useThemeColors()
  const { online, connection, goingOnline, error, setOnline } = useCaptainPresence()

  const healthColor = colors[HEALTH_COLORS[connection]]
  const healthLabel =
    connection === 'live' ? t('captain.online.live')
    : connection === 'connecting' ? t('captain.online.connecting')
    : connection === 'stale' ? t('captain.online.stale')
    : online ? t('captain.online.online') : t('captain.online.offline')

  return (
    <View style={{ alignSelf: 'stretch', gap: Spacing.md, marginTop: Spacing.sm }}>
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
          {online ? t('captain.online.online') : t('captain.online.toggleLabel')}
        </Text>
        <Switch
          value={online}
          onValueChange={(v) => setOnline(v)}
          disabled={goingOnline}
          trackColor={{ true: colors.tint }}
          // RN's Switch doesn't auto-mirror in RTL — the knob always slides to the
          // visual right when "on". Mirror it in RTL so the knob travels the natural
          // way for an Arabic reader. (scaleX on a symmetric control, not a directional icon.)
          style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
        />
      </View>

      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: healthColor }} />
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
          {healthLabel}
        </Text>
      </View>

      <Text style={{ ...Typography['caption-sm'], color: error ? colors.destructive : colors.subtle, textAlign: isRTL ? 'right' : 'left', fontStyle: 'normal' }}>
        {error ? t(`captain.online.${error}`) : t('captain.online.gpsHint')}
      </Text>
    </View>
  )
}
