// components/captain/member-roster.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { formatIqd } from '@/lib/format-currency'
import type { RoomMember } from '@/services/abriyah-members'

const isRTL = I18nManager.isRTL

interface MemberRosterProps {
  members: RoomMember[]
}

export function MemberRoster({ members }: MemberRosterProps) {
  const { t, i18n } = useTranslation()
  // Reactive locale for currency suffix/grouping (د.ع vs IQD); layout uses module-scope isRTL.
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  if (members.length === 0) return null

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
        {t('captain.live.riders')}
      </Text>
      {members.map((m) => (
        <View
          key={m.riderId}
          style={{
            // native forceRTL mirrors this row in AR — no manual flip
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderCurve: 'continuous',
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
          }}
        >
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{m.name}</Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
            {formatIqd(m.fareIqd, isAr ? 'ar' : 'en')} · {t('captain.live.distanceLabel', { km: m.distanceKm.toFixed(1) })}
          </Text>
        </View>
      ))}
    </View>
  )
}
