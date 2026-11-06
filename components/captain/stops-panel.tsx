// components/captain/stops-panel.tsx
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { usePlaceName } from '@/hooks/use-place-name'
import type { TripStop } from '@/services/captain-stops'

/** Its own component so each stop can look up its name. */
function StopName({ stop }: { stop: TripStop }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const place = usePlaceName(stop.address ? null : { latitude: stop.lat, longitude: stop.lng })
  const reached = stop.status === 'reached'
  return (
    <Text
      numberOfLines={1}
      style={{
        ...Typography.caption,
        flex: 1,
        color: reached ? colors.subtle : colors.text,
        textAlign: 'left',
        textDecorationLine: reached ? 'line-through' : 'none',
      }}
    >
      {stop.address || place.name || t('captain.stops.stopLabel', { n: stop.seq })}
    </Text>
  )
}

/**
 * The plan for a multi-stop regular trip, in visit order. Read-only: the screen's
 * main button marks the current stop, so stops can only be reached in the booked
 * order and never before the rider is aboard. Renders nothing without stops.
 */
export function StopsPanel({ stops }: { stops: TripStop[] }) {
  const colors = useThemeColors()

  if (stops.length === 0) return null

  return (
    <View style={{ gap: Spacing.sm }}>
      {stops.map((stop) => {
        const reached = stop.status === 'reached'
        return (
          // native forceRTL mirrors this row in AR — no manual flip
          <View key={stop.id} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: reached ? colors.success + '22' : colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {reached ? (
                <Icon name="checkmark" size={14} color={colors.success} />
              ) : (
                <Text
                  style={{
                    ...Typography.caption,
                    fontSize: 13,
                    color: colors.text,
                    fontVariant: ['tabular-nums'],
                    writingDirection: 'ltr',
                  }}
                >
                  {stop.seq}
                </Text>
              )}
            </View>
            <StopName stop={stop} />
          </View>
        )
      })}
    </View>
  )
}
