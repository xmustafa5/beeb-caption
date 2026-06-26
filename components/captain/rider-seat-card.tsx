import { View, Text, TouchableOpacity, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { formatIqd } from '@/lib/format-currency'
import type { RiderSeat } from '@/hooks/use-nafarat-room'


interface RiderSeatCardProps {
  seat: RiderSeat
  busy: boolean
  onPickup: () => void
  onDropoff: () => void
}

export function RiderSeatCard({ seat, busy, onPickup, onDropoff }: RiderSeatCardProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()
  const status = seat.tripStatus

  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, padding: Spacing.lg, gap: Spacing.md }}>
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>{seat.name}</Text>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>
          {formatIqd(seat.fareIqd, isAr ? 'ar' : 'en')}
        </Text>
      </View>

      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <TouchableOpacity
          onPress={() => Linking.openURL(`tel:${seat.phone}`)}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          <Icon name="call" size={15} color={colors.tint} />
          <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{t('captain.nafarat.call')}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          {status === 'completed' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ ...Typography['caption-sm'], color: colors.success, fontStyle: 'normal' }}>{t('captain.nafarat.dropped')}</Text>
            </View>
          ) : status === 'in_progress' ? (
            <Button label={t('captain.nafarat.dropOff')} size="md" loading={busy} onPress={onDropoff} />
          ) : (
            <Button label={t('captain.nafarat.pickUp')} size="md" loading={busy} disabled={seat.tripId == null} onPress={onPickup} />
          )}
        </View>
      </View>
    </View>
  )
}
