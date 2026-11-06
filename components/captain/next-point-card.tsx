// components/captain/next-point-card.tsx
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { usePlaceName } from '@/hooks/use-place-name'
import type { LatLng } from '@/hooks/use-current-location'
import { isRoundTrip, type NextPoint } from '@/lib/trip-next-point'

interface NextPointCardProps {
  point: NextPoint
  /** Already at the pickup, waiting for the rider to get in. */
  arrived: boolean
  pickup: LatLng
  dropoff: LatLng
  pickupAddress?: string
  dropoffAddress?: string
  stopCount: number
}

/** Says where the captain is heading right now, so nobody has to read it off the map. */
export function NextPointCard({ point, arrived, pickup, dropoff, pickupAddress, dropoffAddress, stopCount }: NextPointCardProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const icon = point.kind === 'stop' ? 'flag' : point.kind === 'dropoff' ? 'location' : 'person'
  const label =
    point.kind === 'stop'
      ? t('captain.live.nextStop', { n: point.stop.seq, total: point.total })
      : point.kind === 'dropoff'
        ? t(isRoundTrip(pickup, dropoff, stopCount) ? 'captain.live.nextReturn' : 'captain.live.nextDropoff')
        : arrived
          ? t('captain.live.atPickup')
          : t('captain.live.nextPickup')
  const [address, coord] =
    point.kind === 'stop'
      ? [point.stop.address, { latitude: point.stop.lat, longitude: point.stop.lng }]
      : point.kind === 'dropoff'
        ? [dropoffAddress, dropoff]
        : [pickupAddress, pickup]
  // A pin dragged on the map has no address: look one up, as the offer card does.
  const place = usePlaceName(address ? null : coord)
  const name = address || place.name || (point.kind === 'stop' ? t('captain.stops.stopLabel', { n: point.stop.seq }) : null)

  return (
    // native forceRTL mirrors this row in AR — no manual flip
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        padding: Spacing.md + 2,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: colors.tint + '12',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={18} color={colors.onTint} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ ...Typography.caption, fontSize: 13, color: colors.subtle, textAlign: 'left' }}>
          {label}
        </Text>
        {!!name && (
          <Text numberOfLines={2} style={{ ...Typography['heading-sm'], color: colors.text, textAlign: 'left' }}>
            {name}
          </Text>
        )}
      </View>
    </View>
  )
}
