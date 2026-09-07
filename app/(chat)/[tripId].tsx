import { useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { ChatThread } from '@/components/chat/chat-thread'
import type { QuickReply } from '@/components/chat/chat-quick-replies'
import { useChat } from '@/hooks/use-chat'
import { getTrip, type Trip, type TripStatus } from '@/services/captain-trips'
import { useCaptainPresence } from '@/providers/captain-presence'
import { setForegroundChatTrip } from '@/providers/push-provider'

const isRTL = I18nManager.isRTL

// Quick replies are phase-aware: before pickup the captain is coordinating a
// meeting point, during the ride there is only the arrival to announce.
const PICKUP_QUICK_KEYS = [
  'onMyWay',
  'almostThere',
  'arrived',
  'whereAreYou',
  'pleaseComeOut',
  'traffic',
] as const
const RIDE_QUICK_KEYS = ['almostDestination'] as const

export default function ChatScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { lastTripUpdate } = useCaptainPresence()

  // Trip status gates the composer (send only while accepted / in_progress).
  // Opened from a push there is no trip screen underneath keeping this fresh,
  // and the global staleTime is 5 min — so mirror use-live-trip: poll while the
  // trip is live, and stop as soon as it isn't. Without this the composer (and
  // the quick replies) stay armed on a finished trip and every send 409s.
  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => getTrip(tripId),
    enabled: !!tripId,
    refetchInterval: (query) =>
      query.state.data?.status === 'accepted' || query.state.data?.status === 'in_progress'
        ? 15_000
        : false,
  })
  const trip = tripQuery.data

  // The WS frame beats the poll: patch the cached status when it's THIS trip.
  useEffect(() => {
    if (lastTripUpdate && lastTripUpdate.id === tripId) {
      queryClient.setQueryData<Trip | undefined>(['trip', tripId], (prev) =>
        prev ? { ...prev, status: lastTripUpdate.status as TripStatus } : prev,
      )
    }
  }, [lastTripUpdate, tripId, queryClient])

  const chat = useChat(tripId)

  // Suppress the foreground chat banner for the thread that's on screen (the WS
  // already renders those messages live). Clear it when leaving the screen.
  useEffect(() => {
    setForegroundChatTrip(tripId)
    return () => setForegroundChatTrip(null)
  }, [tripId])

  const canSend = trip?.status === 'accepted' || trip?.status === 'in_progress'
  const isRide = trip?.status === 'in_progress'
  const closedNote =
    trip?.status === 'completed' || trip?.status === 'cancelled'
      ? t('chat.closedTerminal')
      : t('chat.closedNote')

  const subtitle = isRide
    ? t('chat.subtitleInProgress')
    : trip?.status === 'accepted'
      ? t('chat.subtitleAccepted')
      : t('chat.subtitle')

  const quickReplies: QuickReply[] = useMemo(() => {
    const keys = isRide ? RIDE_QUICK_KEYS : PICKUP_QUICK_KEYS
    return keys.map((key) => ({ key, body: t(`chat.quick.captain.${key}`) }))
  }, [isRide, t])

  // The pickup copy points at the chips, so only offer it while they're there.
  const emptyBody = canSend
    ? isRide
      ? t('chat.emptyBodyRide')
      : t('chat.emptyBodyPickup')
    : t('chat.emptyBody')

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + Spacing.md,
          paddingBottom: Spacing.md,
          paddingHorizontal: Spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.7}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Back chevron points against reading direction — swap glyph in AR. */}
          <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={26} color={colors.text} />
        </TouchableOpacity>

        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="person" size={20} color={colors.onTint} />
        </View>

        {/* Title carries the weight; the subtitle is a quiet status line. */}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ ...Typography['heading-md'], color: colors.text }} numberOfLines={1}>
            {t('chat.riderTitle')}
          </Text>
          <Text
            style={{ fontFamily: 'Poppins_400Regular', fontSize: 12, color: colors.subtle }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      <ChatThread
        messages={chat.messages}
        selfRole="captain"
        isLoading={chat.isLoading}
        hasLoadError={!!chat.loadError}
        hasMore={chat.hasMore}
        onLoadOlder={chat.loadOlder}
        isLoadingOlder={chat.isLoadingOlder}
        onSend={chat.send}
        isSending={chat.isSending}
        sendError={chat.sendError}
        canSend={canSend}
        closedNote={closedNote}
        quickReplies={quickReplies}
        emptyBody={emptyBody}
      />
    </View>
  )
}
