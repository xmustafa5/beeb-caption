// components/captain/offer-card.tsx
import { View, Text, Pressable, I18nManager } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { formatIqd } from '@/lib/format-currency'
import { haversineKm } from '@/hooks/use-distance'
import { usePlaceName } from '@/hooks/use-place-name'
import type { LatLng } from '@/hooks/use-current-location'
import type { CaptainOffer } from '@/services/captain-queue'

const isRTL = I18nManager.isRTL

interface OfferCardProps {
  offer: CaptainOffer
  captainLocation: LatLng | null
  onAccept: () => void
  accepting: boolean
  /**
   * Tapping the card body frames pickup + dropoff together on the map, so the
   * captain can see the whole trip before accepting (the map otherwise sits on
   * the pickup at a fixed zoom, which can leave the destination off-screen).
   */
  onPress?: () => void
}

interface PlaceRowProps {
  icon: React.ComponentProps<typeof Icon>['name']
  color: string
  /** "من" / "إلى" — the part that makes the two rows tellable apart at a glance. */
  label: string
  name: string | null
  loading: boolean
}

function PlaceRow({ icon, color, label, name, loading }: PlaceRowProps) {
  const colors = useThemeColors()
  return (
    // native forceRTL mirrors this row in AR — no manual flip
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }}>
      {/* nudge the icon onto the NAME's baseline, not the smaller label above it */}
      <View style={{ paddingTop: 13 }}>
        <Icon name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ ...Typography.micro, color: colors.subtle, fontStyle: 'normal', textAlign: isRTL ? 'right' : 'left' }}>
          {label}
        </Text>
        <Text
          numberOfLines={2}
          style={{ ...Typography['body-md'], fontSize: 13, color: colors.text, textAlign: isRTL ? 'right' : 'left' }}
        >
          {name ?? (loading ? '…' : '—')}
        </Text>
      </View>
    </View>
  )
}

export function OfferCard({ offer, captainLocation, onAccept, accepting, onPress }: OfferCardProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const colors = useThemeColors()

  const isRoom = offer.offerType === 'room'
  const pickup: LatLng = { latitude: offer.pickupLat, longitude: offer.pickupLng }
  const dropoff: LatLng = { latitude: offer.dropoffLat, longitude: offer.dropoffLng }

  const awayKm = captainLocation ? haversineKm(captainLocation, pickup) : null
  const tripKm = haversineKm(pickup, dropoff)

  // The offer's own names win — they are what the rider chose (or the POI the
  // backend resolved), and reverse-geocoding these coordinates can only ever
  // return a worse label (bare mahalla codes like "605-14، ناحية مركز قضاء الكرخ").
  // Passing null keeps the hook disabled, so no geocoder request fires at all.
  const pickupName = usePlaceName(offer.pickupAddress ? null : pickup)
  const dropName = usePlaceName(offer.dropoffAddress ? null : dropoff)
  const pickupLabel = offer.pickupAddress ?? pickupName.name
  const dropoffLabel = offer.dropoffAddress ?? dropName.name

  return (
    // Pressable with no onPress is inert, so the card stays a plain surface for
    // callers that don't want the map-framing tap. The Accept button is a nested
    // pressable and keeps its own touch.
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderCurve: 'continuous',
        padding: Spacing.lg,
        gap: Spacing.md,
        boxShadow: '0px 6px 18px rgba(0, 0, 0, 0.10)',
      }}
    >
      {/* header: type + fare */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
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
        <Text style={{ ...Typography['heading-sm'], color: colors.text, fontVariant: ['tabular-nums'], writingDirection: 'ltr' }}>
          {formatIqd(offer.fareIqd, isAr ? 'ar' : 'en')}
        </Text>
      </View>

      {/* pickup + destination place names */}
      <View style={{ gap: Spacing.xs }}>
        <PlaceRow
          icon="ellipse"
          color={colors.tint}
          label={t('captain.queue.fromLabel')}
          name={pickupLabel}
          loading={pickupName.isLoading}
        />
        <PlaceRow
          icon="location"
          color={colors.destructive}
          label={t('captain.queue.toLabel')}
          name={dropoffLabel}
          loading={dropName.isLoading}
        />
      </View>

      {/* distances */}
      <View style={{ gap: 2, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
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
    </Pressable>
  )
}
