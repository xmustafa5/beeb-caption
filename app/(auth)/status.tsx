// app/(auth)/status.tsx
import { useState, useCallback } from 'react'
import { View, Text, ScrollView, AppState, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useAuthStore } from '@/store/auth-store'
import { getCaptain } from '@/services/captain-auth'

// Ops support line. Set EXPO_PUBLIC_SUPPORT_WHATSAPP_URL in env; the fallback is a
// placeholder until the real captain-support number is provided.
const SUPPORT_URL =
  process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_URL ?? 'https://wa.me/9647500000000'

export default function StatusScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const token = useAuthStore((s) => s.token)
  const captainId = useAuthStore((s) => s.captain?.id ?? s.pendingCaptainId)
  const status = useAuthStore((s) => s.captain?.status) ?? 'pending'
  const rejectionReason = useAuthStore((s) => s.captain?.rejectionReason)
  const [checking, setChecking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // With a token + id we can poll the captain record to detect approval. (Post
  // backend-fix, a pending captain always holds a token.) Without one, there's
  // nothing to poll — show the await-approval note.
  const refresh = useCallback(async () => {
    if (!token || !captainId) {
      setNote(t('captain.status.stillPending'))
      return
    }
    setChecking(true)
    try {
      const captain = await getCaptain(captainId)
      useAuthStore.getState().updateCaptain(captain)
      if (captain.status !== 'approved') setNote(t('captain.status.stillPending'))
      // AuthGate routes to (tabs) automatically once status === 'approved'.
    } finally {
      setChecking(false)
    }
  }, [token, captainId, t])

  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') refresh()
      })
      refresh()
      return () => sub.remove()
    }, [refresh]),
  )

  const isRejected = status === 'rejected'
  const isBlocked = status === 'blocked'
  const title = isBlocked
    ? t('captain.status.blockedTitle')
    : isRejected
      ? t('captain.status.rejectedTitle')
      : t('captain.status.pendingTitle')
  const body = isBlocked
    ? t('captain.status.blockedBody')
    : isRejected
      ? t('captain.status.rejectedBody')
      : t('captain.status.pendingBody')
  const icon = isBlocked ? 'lock-closed' : isRejected ? 'close-circle' : 'hourglass'
  const tone = isBlocked || isRejected ? colors.destructive : colors.tint
  const reasonText = rejectionReason
    ? t(`captain.status.reason_${rejectionReason}`, { defaultValue: t('captain.status.reason_other') })
    : null

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: Spacing.xl,
          paddingTop: insets.top + Spacing.xl * 2,
          paddingBottom: insets.bottom + Spacing.xl,
          gap: Spacing.xl,
        }}
      >
        <View style={{ alignItems: 'center', gap: Spacing.lg }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: tone + '22',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={icon} size={44} color={tone} />
          </View>
          <Text style={{ ...Typography['heading-lg'], color: colors.text, textAlign: 'center' }}>{title}</Text>
          <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{body}</Text>
          {isRejected && reasonText && (
            <Text style={{ ...Typography['caption-sm'], color: colors.destructive, textAlign: 'center', fontStyle: 'normal' }}>
              {t('captain.status.reason', { reason: reasonText })}
            </Text>
          )}
          {!isRejected && !isBlocked && note && (
            <Text style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{note}</Text>
          )}
        </View>

        <View style={{ flex: 1 }} />

        <View style={{ gap: Spacing.md }}>
          {!isRejected && !isBlocked && (
            <Button label={t('captain.status.checkStatus')} loading={checking} onPress={refresh} />
          )}
          <Button
            label={t('captain.status.contactSupport')}
            variant="secondary"
            onPress={() => Linking.openURL(SUPPORT_URL)}
            leading={<Icon name="logo-whatsapp" size={18} color={colors.text} />}
          />
          {isBlocked && (
            <Button label={t('profile.logout')} variant="ghost" onPress={() => useAuthStore.getState().clear()} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}
