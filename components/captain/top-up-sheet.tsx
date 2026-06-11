// components/captain/top-up-sheet.tsx
import { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/forms/form-error'
import { formatIqd } from '@/lib/format-currency'
import { topUp } from '@/services/wallet'
import { parseApiError } from '@/lib/api'

const isRTL = I18nManager.isRTL
const PRESETS = [2000, 5000, 10000]

interface TopUpSheetProps {
  visible: boolean
  balanceIqd: number
  feeIqd: number
  onClose: () => void
  onToppedUp: () => void
}

export function TopUpSheet({ visible, balanceIqd, feeIqd, onClose, onToppedUp }: TopUpSheetProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [preset, setPreset] = useState<number | null>(PRESETS[0])
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)

  const amount = custom ? parseInt(custom.replace(/\D/g, ''), 10) || 0 : (preset ?? 0)

  const mutation = useMutation({
    mutationFn: () => topUp(amount),
    onMutate: () => setError(null),
    onSuccess: () => onToppedUp(),
    onError: (err) => {
      const info = parseApiError(err)
      const key = info.isNetwork
        ? 'common.networkError'
        : info.status === 400
          ? 'captain.activate.amountInvalid'
          : 'captain.activate.topUpFailed'
      setError(t(key))
    },
  })

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
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
          <Text style={{ ...Typography['heading-md'], color: colors.text }}>
            {t('captain.activate.topUpTitle')}
          </Text>

          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: Spacing.sm }}>
            {PRESETS.map((p) => {
              const active = !custom && preset === p
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { setPreset(p); setCustom(''); setError(null) }}
                  activeOpacity={0.85}
                  style={{
                    flex: 1,
                    paddingVertical: Spacing.md,
                    borderRadius: 14,
                    borderCurve: 'continuous',
                    backgroundColor: active ? colors.tint : colors.surface,
                    borderWidth: 1.5,
                    borderColor: active ? colors.tint : colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      ...Typography['caption-sm'],
                      color: active ? colors.onTint : colors.text,
                      fontStyle: 'normal',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {formatIqd(p)}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Input
            label={t('captain.activate.customAmount')}
            value={custom}
            onChangeText={(v) => { setCustom(v.replace(/\D/g, '')); setError(null) }}
            keyboardType="number-pad"
            placeholder={t('captain.activate.amountLabel')}
          />

          <FormError message={error} />

          <Button
            label={t('captain.activate.confirmTopUp')}
            loading={mutation.isPending}
            disabled={amount <= 0}
            onPress={() => mutation.mutate()}
          />
        </View>
      </View>
    </Modal>
  )
}
