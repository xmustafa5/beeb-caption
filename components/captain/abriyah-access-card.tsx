// components/captain/abriyah-access-card.tsx
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { useAbriyahAccess } from '@/hooks/use-abriyah-access'

/**
 * Abriyah (shared-ride) access: shows the current status and the one action that
 * applies to it — request / re-request / pending / approved. Gate the wider
 * Abriyah UI on the same status; the server also hides Abriyah room offers from
 * non-approved captains, so this is the captain's window into that gate.
 */
export function AbriyahAccessCard() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { status, rejectionReason, canRequest, request, isRequesting, requestError } =
    useAbriyahAccess()

  const tone =
    status === 'approved' ? colors.success
    : status === 'requested' ? colors.accent
    : status === 'rejected' ? colors.destructive
    : colors.subtle

  const descKey =
    status === 'approved' ? 'abriyahAccess.descApproved'
    : status === 'requested' ? 'abriyahAccess.descRequested'
    : status === 'rejected' ? 'abriyahAccess.descRejected'
    : 'abriyahAccess.descNone'

  const showRequestButton = status === 'none' || status === 'rejected'

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        padding: Spacing.lg,
        gap: Spacing.md,
      }}
    >
      {/* Header row: icon + title + status pill */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <View
          style={{
            width: 40, height: 40, borderRadius: 10, borderCurve: 'continuous',
            backgroundColor: colors.tint + '1A',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name="people" size={20} color={colors.tint} />
        </View>
        <Text style={{ ...Typography['body-md'], color: colors.text, flex: 1, textAlign: 'left' }}>
          {t('abriyahAccess.title')}
        </Text>
        {status !== 'none' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: tone + '1A', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: tone }} />
            <Text style={{ ...Typography['caption-sm'], color: tone, fontStyle: 'normal' }}>
              {t(`abriyahAccess.${status === 'requested' ? 'pending' : status}`)}
            </Text>
          </View>
        )}
      </View>

      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
        {t(descKey)}
      </Text>

      {status === 'rejected' && rejectionReason ? (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
          {t('abriyahAccess.reasonLabel')}: {rejectionReason}
        </Text>
      ) : null}

      {requestError ? (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
          {t('abriyahAccess.requestFailed')}
        </Text>
      ) : null}

      {showRequestButton &&
        (canRequest ? (
          <TouchableOpacity
            onPress={request}
            disabled={isRequesting}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Spacing.sm,
              backgroundColor: colors.tint,
              borderRadius: 12,
              borderCurve: 'continuous',
              paddingVertical: Spacing.md,
              opacity: isRequesting ? 0.7 : 1,
            }}
          >
            {isRequesting ? (
              <ActivityIndicator color={colors.onTint} />
            ) : (
              <Text style={{ ...Typography['body-md'], color: colors.onTint }}>
                {t(status === 'rejected' ? 'abriyahAccess.requestAgain' : 'abriyahAccess.request')}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
            {t('abriyahAccess.needApproved')}
          </Text>
        ))}
    </View>
  )
}
