import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { ChatThread } from '@/components/chat/chat-thread'
import { useChat } from '@/hooks/use-chat'
import { getTrip } from '@/services/captain-trips'

const isRTL = I18nManager.isRTL

export default function ChatScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  // Trip status gates the composer (send only while accepted / in_progress).
  const tripQuery = useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => getTrip(tripId),
    enabled: !!tripId,
  })
  const trip = tripQuery.data

  const chat = useChat(tripId)

  const canSend = trip?.status === 'accepted' || trip?.status === 'in_progress'
  const closedNote =
    trip?.status === 'completed' || trip?.status === 'cancelled'
      ? t('chat.closedTerminal')
      : t('chat.closedNote')

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + Spacing.sm,
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

        <View style={{ flex: 1 }}>
          <Text style={{ ...Typography['heading-sm'], color: colors.text }} numberOfLines={1}>
            {t('chat.riderTitle')}
          </Text>
          <Text
            style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal' }}
            numberOfLines={1}
          >
            {t('chat.subtitle')}
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
        canSend={canSend}
        closedNote={closedNote}
      />
    </View>
  )
}
