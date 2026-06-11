import { View, Text, ScrollView, ActivityIndicator, RefreshControl, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { OfferCard } from '@/components/captain/offer-card'
import { useTripQueue } from '@/hooks/use-trip-queue'
import { useCaptainPresence } from '@/providers/captain-presence'
import { useCurrentLocation } from '@/hooks/use-current-location'
import { parseApiError } from '@/lib/api'
import type { CaptainOffer } from '@/services/captain-queue'

const isRTL = I18nManager.isRTL

export default function QueueScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { online } = useCaptainPresence()
  const { offers, isLoading, isRefetching, refetch, accept, accepting } = useTripQueue()
  const { location } = useCurrentLocation()
  const [error, setError] = useState<string | null>(null)

  async function onAccept(offer: CaptainOffer) {
    setError(null)
    try {
      await accept(offer)
      router.push(`/(trip)/${offer.id}`)
    } catch (err) {
      const info = parseApiError(err)
      if (info.status === 409) setError(t('captain.queue.taken'))
      else if (info.status === 403 || info.status === 400) refetch()
      else setError(t(info.isNetwork ? 'common.networkError' : 'captain.queue.acceptFailed'))
      refetch()
    }
  }

  const header = (
    <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: isRTL ? 'right' : 'left' }}>
      {t('captain.queue.title')}
    </Text>
  )

  // Offline
  if (!online) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md }}>
        <Icon name="cloud-offline-outline" size={48} color={colors.muted} />
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>{t('captain.queue.offlineTitle')}</Text>
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.offlineBody')}</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, paddingTop: insets.top + Spacing.xl, gap: Spacing.lg, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
    >
      {header}

      {error && (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal' }}>{error}</Text>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : offers.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
          <Icon name="hourglass-outline" size={40} color={colors.muted} />
          <Text style={{ ...Typography['body-md'], color: colors.text, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.emptyTitle')}</Text>
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>{t('captain.queue.emptyBody')}</Text>
        </View>
      ) : (
        offers.map((offer) => (
          <OfferCard
            key={`${offer.offerType}-${offer.id}`}
            offer={offer}
            captainLocation={location}
            onAccept={() => onAccept(offer)}
            accepting={accepting}
          />
        ))
      )}
    </ScrollView>
  )
}
