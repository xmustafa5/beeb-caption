// components/captain/stops-panel.tsx
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { TripStop } from '@/services/captain-stops'

interface StopsPanelProps {
  stops: TripStop[]
  reachingId?: string
  onReach: (stopId: string) => void
}

/**
 * Intermediate stops on a multi-stop regular trip, in visit order. The captain
 * marks each pending stop reached; a reached stop shows a check. Renders nothing
 * when the trip has no stops.
 */
export function StopsPanel({ stops, reachingId, onReach }: StopsPanelProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  if (stops.length === 0) return null

  return (
    <View style={{ gap: Spacing.sm }}>
      <Text style={{ ...Typography['body-md'], color: colors.subtle, fontStyle: 'normal', textAlign: 'left' }}>
        {t('captain.stops.title')}
      </Text>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 14,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {stops.map((stop, i) => {
          const reached = stop.status === 'reached'
          const reaching = reachingId === stop.id
          return (
            <View
              key={stop.id}
              style={{
                // native forceRTL mirrors this row in AR — no manual flip
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.md,
                padding: Spacing.md + 2,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 30, height: 30, borderRadius: 15,
                  backgroundColor: reached ? colors.success + '22' : colors.surface,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {reached ? (
                  <Icon name="checkmark" size={16} color={colors.success} />
                ) : (
                  <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal', fontVariant: ['tabular-nums'] }}>
                    {stop.seq}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'left' }} numberOfLines={1}>
                  {stop.address || t('captain.stops.stopLabel', { n: stop.seq })}
                </Text>
                {reached && (
                  <Text style={{ ...Typography['caption-sm'], color: colors.success, fontStyle: 'normal', textAlign: 'left' }}>
                    {t('captain.stops.reached')}
                  </Text>
                )}
              </View>
              {!reached && (
                <TouchableOpacity
                  onPress={() => onReach(stop.id)}
                  disabled={reaching}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: colors.tint,
                    borderRadius: 10,
                    borderCurve: 'continuous',
                    paddingHorizontal: Spacing.md,
                    paddingVertical: Spacing.sm,
                    minWidth: 96,
                    alignItems: 'center',
                  }}
                >
                  {reaching ? (
                    <ActivityIndicator size="small" color={colors.onTint} />
                  ) : (
                    <Text style={{ ...Typography['caption-sm'], color: colors.onTint, fontStyle: 'normal', fontFamily: 'Poppins_600SemiBold' }}>
                      {t('captain.stops.markReached')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}
