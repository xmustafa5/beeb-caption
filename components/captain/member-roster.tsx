// components/captain/member-roster.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { formatIqd } from '@/lib/format-currency'
import type { RoomMembersData } from '@/services/abriyah-members'

const isRTL = I18nManager.isRTL

interface MemberRosterProps {
  data?: RoomMembersData
}

export function MemberRoster({ data }: MemberRosterProps) {
  const { t, i18n } = useTranslation()
  // Reactive locale for currency suffix/grouping (د.ع vs IQD); layout uses module-scope isRTL.
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  if (!data || data.members.length === 0) return null

  const { dropoffZone, pickupBreakdown, members } = data
  const zoneLabel = (name: string | null, nameAr: string | null) =>
    (isAr ? nameAr : name) ?? t('captain.live.unknownZone')

  return (
    <View style={{ gap: Spacing.md }}>
      {/* Shared destination zone — what keys this room. */}
      <View
        style={{
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          backgroundColor: colors.tint + '15',
          borderRadius: 12,
          borderCurve: 'continuous',
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
        }}
      >
        <Icon name="flag" size={16} color={colors.tint} />
        <View style={{ flex: 1 }}>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.live.destinationLabel')}
          </Text>
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
            {zoneLabel(dropoffZone.name, dropoffZone.nameAr)}
          </Text>
        </View>
      </View>

      {/* Where the pool's riders board (cross-zone pickups). */}
      {pickupBreakdown.length > 0 && (
        <View style={{ gap: Spacing.sm }}>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
            {t('captain.live.pickupsLabel')}
          </Text>
          {pickupBreakdown.map((p, i) => (
            <View
              key={p.zoneId ?? `unknown-${i}`}
              style={{
                // native forceRTL mirrors this row in AR — no manual flip
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.sm,
                paddingHorizontal: Spacing.md,
              }}
            >
              <Icon name="location-outline" size={14} color={colors.subtle} />
              <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'], textAlign: isRTL ? 'right' : 'left' }}>
                {t('captain.live.pickupFromZone', {
                  count: p.riderCount,
                  zone: zoneLabel(p.name, p.nameAr),
                })}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Per-rider roster. */}
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
    </View>
  )
}
