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
  /** This rider is the captain's next stop: the card is outlined. */
  isNext: boolean
  onArrive: () => void
  onPickup: () => void
  onDropoff: () => void
  onCancel: () => void
}

/**
 * One rider of a Nafarat room. Each rider is a trip of its own and goes through
 * the same steps as a regular fare: Arrived (tells the rider the car is there) →
 * Pick up (starts the trip) → Drop off (completes it). Before pickup the captain
 * can also cancel just this rider, e.g. when they never show up.
 */
export function RiderSeatCard({ seat, busy, isNext, onArrive, onPickup, onDropoff, onCancel }: RiderSeatCardProps) {
  const { t, i18n } = useTranslation()
  const colors = useThemeColors()
  const status = seat.tripStatus
  const waiting = status !== 'completed' && status !== 'cancelled' && status !== 'in_progress'
  // The call button is for a rider still in the ride: never one who cancelled
  // or was already dropped off.
  const reachable = status !== 'completed' && status !== 'cancelled'

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderWidth: isNext ? 1.5 : 1,
        borderColor: isNext ? colors.tint : colors.border,
        padding: Spacing.lg,
        gap: Spacing.md,
        opacity: status === 'cancelled' ? 0.6 : 1,
      }}
    >
      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexShrink: 1 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...Typography.micro, color: colors.onTint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold', fontVariant: ['tabular-nums'] }}>
              {seat.seatNumber}
            </Text>
          </View>
          <Text numberOfLines={1} style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal', flexShrink: 1, textAlign: 'left' }}>
            {seat.name}
          </Text>
        </View>
        <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>
          {formatIqd(seat.fareIqd, i18n.language)}
        </Text>
      </View>

      {/* native forceRTL mirrors this row in AR — no manual flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        {reachable && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`tel:${seat.phone}`)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }}
          >
            <Icon name="call" size={15} color={colors.tint} />
            <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>{t('captain.nafarat.call')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ flex: 1 }}>
          {status === 'completed' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <Icon name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ ...Typography['caption-sm'], color: colors.success, fontStyle: 'normal' }}>{t('captain.nafarat.dropped')}</Text>
            </View>
          ) : status === 'cancelled' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <Icon name="close-circle" size={18} color={colors.subtle} />
              <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>{t('captain.nafarat.cancelled')}</Text>
            </View>
          ) : status === 'in_progress' ? (
            <Button label={t('captain.nafarat.dropOff')} size="md" loading={busy} onPress={onDropoff} />
          ) : seat.arrived ? (
            <Button label={t('captain.nafarat.pickUp')} size="md" loading={busy} disabled={seat.tripId == null} onPress={onPickup} />
          ) : (
            <Button label={t('captain.nafarat.arrived')} size="md" loading={busy} disabled={seat.tripId == null} onPress={onArrive} />
          )}
        </View>
      </View>

      {/* Only before pickup: a rider who never shows up can be cancelled on their own. */}
      {waiting && seat.tripId != null && (
        <TouchableOpacity
          onPress={onCancel}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
        >
          <Icon name="close-circle-outline" size={15} color={colors.destructive} />
          <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal' }}>
            {t('captain.nafarat.cancelRider')}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}
