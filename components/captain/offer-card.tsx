// components/captain/offer-card.tsx
import { View, Text, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatIqd } from '@/lib/format-currency'
import { haversineKm } from '@/hooks/use-distance'
import type { LatLng } from '@/hooks/use-current-location'
import type { CaptainOffer } from '@/services/captain-queue'

const isRTL = I18nManager.isRTL

interface OfferCardProps {
  offer: CaptainOffer
  captainLocation: LatLng | null
  onAccept: () => void
  accepting: boolean
}

export function OfferCard({ offer, captainLocation, onAccept, accepting }: OfferCardProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const isRoom = offer.offerType === 'room'
  const pickup: LatLng = { latitude: offer.pickupLat, longitude: offer.pickupLng }
  const dropoff: LatLng = { latitude: offer.dropoffLat, longitude: offer.dropoffLng }

  const awayKm = captainLocation ? haversineKm(captainLocation, pickup) : null
  const tripKm = haversineKm(pickup, dropoff)

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        gap: Spacing.md,
        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.06)',
      }}
    >
      {/* header: type + fare */}
      <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Icon name={isRoom ? 'people' : 'car'} size={18} color={colors.tint} />
          <Text style={{ ...Typography['body-md'], color: colors.text, fontStyle: 'normal' }}>
            {isRoom ? t('captain.queue.newRoom') : t('captain.queue.newTrip')}
          </Text>
          {isRoom && offer.roomType === 'women_only' && (
            <View style={{ backgroundColor: colors.tint + '22', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ ...Typography['caption-sm'], color: colors.tint, fontStyle: 'normal' }}>
                {t('captain.queue.roomWomenOnly')}
              </Text>
            </View>
          )}
        </View>
        <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'] }}>
          {formatIqd(offer.fareIqd)}
        </Text>
      </View>

      {/* details */}
      <View style={{ gap: Spacing.xs, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        {!isRoom && awayKm != null && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.kmAway', { km: awayKm.toFixed(1) })}
          </Text>
        )}
        {!isRoom && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.tripDistance', { km: tripKm.toFixed(1) })}
          </Text>
        )}
        {isRoom && offer.roomType !== 'women_only' && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}>
            {t('captain.queue.roomMixed')}
          </Text>
        )}
      </View>

      <Button
        label={isRoom ? t('captain.queue.acceptRoom') : t('captain.queue.accept')}
        loading={accepting}
        onPress={onAccept}
      />
    </View>
  )
}
