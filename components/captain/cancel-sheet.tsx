// components/captain/cancel-sheet.tsx
import { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Input } from '@/components/forms/input'
import { Button } from '@/components/ui/button'
import type { CancelReason } from '@/services/captain-trips'

const isRTL = I18nManager.isRTL // Stable for the session — forceRTL changes require a restart anyway
const REASONS: CancelReason[] = ['changed_mind', 'wait_too_long', 'wrong_pickup', 'safety', 'other']

interface CancelSheetProps {
  visible: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: (reason: CancelReason, comment?: string) => void
}

export function CancelSheet({ visible, submitting, onClose, onConfirm }: CancelSheetProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const [reason, setReason] = useState<CancelReason>('changed_mind')
  const [comment, setComment] = useState('')

  useEffect(() => {
    if (!visible) { setReason('changed_mind'); setComment('') }
  }, [visible])

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
          <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>{t('captain.live.cancelTitle')}</Text>

          <View style={{ gap: Spacing.sm }}>
            {REASONS.map((r) => {
              const active = reason === r
              return (
                <TouchableOpacity
                  key={r}
                  onPress={() => setReason(r)}
                  activeOpacity={0.85}
                  style={{
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: Spacing.md,
                    paddingHorizontal: Spacing.lg,
                    borderRadius: 14,
                    borderCurve: 'continuous',
                    borderWidth: 1.5,
                    borderColor: active ? colors.tint : colors.border,
                    backgroundColor: active ? colors.tint + '14' : colors.surface,
                  }}
                >
                  <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
                    {t(`captain.live.reason_${r}`)}
                  </Text>
                  {active && <Text style={{ color: colors.tint }}>●</Text>}
                </TouchableOpacity>
              )
            })}
          </View>

          <Input
            value={comment}
            onChangeText={setComment}
            placeholder={t('captain.live.commentOptional')}
          />

          <Button
            label={t('captain.live.cancelConfirm')}
            variant="destructive"
            loading={submitting}
            onPress={() => onConfirm(reason, comment || undefined)}
          />
          <Button label={t('captain.live.keepTrip')} variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  )
}
