import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Alert, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/forms/input'
import { FormError } from '@/components/forms/form-error'
import { formatIqd } from '@/lib/format-currency'
import { toAsciiDigits } from '@/lib/digits'
import { parseApiError } from '@/lib/api'
import { getWallet, listTransactions, topUp, type Transaction } from '@/services/wallet'
import { useQiCardCheckout } from '@/hooks/use-qicard-checkout'

const isRTL = I18nManager.isRTL
const PRESETS = [5000, 10000, 25000]
const CASH = 'cash'
const QICARD = 'qicard'
// Transaction types that reduce the balance (shown with a minus + destructive tone).
const DEBIT_TYPES: Transaction['txType'][] = ['trip_fare', 'daily_fee', 'cancellation_penalty']

export default function WalletScreen() {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const [topUpOpen, setTopUpOpen] = useState(false)

  const wallet = useQuery({ queryKey: ['wallet'], queryFn: getWallet })
  const txns = useQuery({ queryKey: ['transactions'], queryFn: () => listTransactions(50, 0) })

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
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ ...Typography['heading-sm'], color: colors.text }}>{t('wallet.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        {/* Balance card */}
        <View
          style={{
            backgroundColor: colors.tint,
            borderRadius: 20,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            gap: Spacing.sm,
          }}
        >
          <Text style={{ ...Typography['caption-sm'], color: colors.onTint, fontStyle: 'normal', opacity: 0.85, textAlign: 'left' }}>
            {t('wallet.balance')}
          </Text>
          {wallet.isLoading ? (
            <ActivityIndicator color={colors.onTint} />
          ) : wallet.isError ? (
            <Text style={{ ...Typography['body-md'], color: colors.onTint, textAlign: 'left' }}>{t('wallet.loadFailed')}</Text>
          ) : (
            <Text style={{ ...Typography['heading-lg'], fontSize: 32, color: colors.onTint, writingDirection: 'ltr', fontVariant: ['tabular-nums'], textAlign: 'left' }}>
              {formatIqd(wallet.data?.balanceIqd ?? 0, isAr ? 'ar' : 'en')}
            </Text>
          )}
          <TouchableOpacity
            onPress={() => setTopUpOpen(true)}
            activeOpacity={0.85}
            style={{
              marginTop: Spacing.sm,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.sm,
              backgroundColor: colors.onTint + '26',
              borderRadius: 12,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
            }}
          >
            <Icon name="add-circle" size={18} color={colors.onTint} />
            <Text style={{ ...Typography['body-md'], color: colors.onTint }}>{t('wallet.topUp')}</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions */}
        <Text style={{ ...Typography['input-label'], color: colors.subtle, fontStyle: 'normal', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.6, textAlign: 'left' }}>
          {t('wallet.transactions')}
        </Text>
        {txns.isLoading ? (
          <ActivityIndicator color={colors.tint} />
        ) : (txns.data ?? []).length === 0 ? (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
            {t('wallet.noTransactions')}
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
            {(txns.data ?? []).map((tx, i) => (
              <TransactionRow key={tx.id} tx={tx} isFirst={i === 0} isAr={isAr} colors={colors} />
            ))}
          </View>
        )}
      </ScrollView>

      <TopUpSheet visible={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </View>
  )
}

interface TransactionRowProps {
  tx: Transaction
  isFirst: boolean
  isAr: boolean
  colors: ReturnType<typeof useThemeColors>
}

function TransactionRow({ tx, isFirst, isAr, colors }: TransactionRowProps) {
  const { t } = useTranslation()
  const isDebit = DEBIT_TYPES.includes(tx.txType)
  const failed = tx.status === 'failed' || tx.status === 'reversed'
  const amountColor = failed ? colors.subtle : isDebit ? colors.destructive : colors.success
  const sign = isDebit ? '−' : '+'
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
      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }}>
          {t(`wallet.tx.${tx.txType}`)}
        </Text>
        <Text style={{ ...Typography['caption-sm'], color: failed ? colors.destructive : colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
          {t(`wallet.status.${tx.status}`)}
        </Text>
      </View>
      {/* Amount is western numeric — lock LTR + tabular figures under native forceRTL */}
      <Text style={{ ...Typography['body-md'], color: amountColor, writingDirection: 'ltr', fontVariant: ['tabular-nums'], textDecorationLine: failed ? 'line-through' : 'none' }}>
        {sign}{formatIqd(tx.amountIqd, isAr ? 'ar' : 'en')}
      </Text>
    </View>
  )
}

function TopUpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const qc = useQueryClient()
  const { checkout } = useQiCardCheckout()

  const [amount, setAmount] = useState<number>(PRESETS[1])
  const [custom, setCustom] = useState('')
  const [source, setSource] = useState<string>(QICARD)
  const [error, setError] = useState<string | null>(null)

  const effectiveAmount = custom.trim() ? Number(custom) : amount
  const valid = Number.isFinite(effectiveAmount) && effectiveAmount > 0

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['wallet'] })
    qc.invalidateQueries({ queryKey: ['transactions'] })
  }

  function close() {
    setCustom('')
    setAmount(PRESETS[1])
    setError(null)
    onClose()
  }

  const cashTopUp = useMutation({
    mutationFn: () => topUp(effectiveAmount),
    onMutate: () => setError(null),
    onSuccess: () => { invalidate(); close() },
    onError: (err) => {
      const info = parseApiError(err)
      setError(info.status === 400 ? t('wallet.amountInvalid') : t('wallet.topUpFailed'))
    },
  })

  const cardTopUp = useMutation({
    mutationFn: () => checkout('wallet_topup', effectiveAmount),
    onMutate: () => setError(null),
    onSuccess: (outcome) => {
      switch (outcome.kind) {
        case 'paid':
          invalidate()
          Alert.alert(t('wallet.topUpSuccess'))
          close()
          break
        case 'pending':
          invalidate()
          close()
          break
        case 'cancelled':
          setError(null)
          break
        case 'failed':
          setError(outcome.reason ?? t('wallet.topUpFailed'))
          break
      }
    },
    onError: (err) => {
      const info = parseApiError(err)
      setError(info.status === 400 ? t('wallet.amountInvalid') : t('wallet.topUpFailed'))
    },
  })

  const submitting = cashTopUp.isPending || cardTopUp.isPending
  const onSubmit = () => (source === QICARD ? cardTopUp.mutate() : cashTopUp.mutate())

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderCurve: 'continuous',
            padding: Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            gap: Spacing.lg,
          }}
        >
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'left' }}>{t('wallet.topUpTitle')}</Text>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {PRESETS.map((p) => {
              const active = !custom.trim() && amount === p
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { setAmount(p); setCustom('') }}
                  activeOpacity={0.85}
                  style={{
                    flex: 1, paddingVertical: Spacing.md, borderRadius: 14, borderCurve: 'continuous',
                    backgroundColor: active ? colors.tint : colors.surface,
                    borderWidth: 1.5, borderColor: active ? colors.tint : colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ ...Typography['caption-sm'], color: active ? colors.onTint : colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
                    {formatIqd(p, isAr ? 'ar' : 'en')}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Input
            label={t('wallet.amount')}
            value={custom}
            onChangeText={(v) => setCustom(toAsciiDigits(v).replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
          />

          <View style={{ gap: Spacing.sm }}>
            <SourceRow active={source === QICARD} label={t('wallet.payByCard')} icon="card-outline" colors={colors} onPress={() => setSource(QICARD)} />
            <SourceRow active={source === CASH} label={t('wallet.cash')} icon="cash-outline" colors={colors} onPress={() => setSource(CASH)} />
          </View>

          <FormError message={error} />

          <Button
            label={`${t('wallet.confirmTopUp')} ${formatIqd(valid ? effectiveAmount : 0, isAr ? 'ar' : 'en')}`}
            loading={submitting}
            disabled={!valid}
            onPress={onSubmit}
          />
        </View>
      </View>
    </Modal>
  )
}

interface SourceRowProps {
  active: boolean
  label: string
  icon: 'card-outline' | 'cash-outline'
  colors: ReturnType<typeof useThemeColors>
  onPress: () => void
}

function SourceRow({ active, label, icon, colors, onPress }: SourceRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        padding: Spacing.lg,
        borderRadius: 14,
        borderCurve: 'continuous',
        borderWidth: 2,
        borderColor: active ? colors.tint : 'transparent',
        backgroundColor: active ? colors.tint + '22' : colors.surface,
      }}
    >
      <Icon name={icon} size={22} color={colors.text} />
      <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1, textAlign: 'left' }}>{label}</Text>
      {active && <Icon name="checkmark-circle" size={22} color={colors.tint} />}
    </TouchableOpacity>
  )
}
