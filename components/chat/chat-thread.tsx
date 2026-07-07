import { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  I18nManager,
  type ListRenderItemInfo,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { toAsciiDigits } from '@/lib/digits'
import { CHAT_MAX_LEN, type ChatMessage, type ChatRole } from '@/services/chat'

// Module-scope: forceRTL requires a restart, so the value is stable per session.
const isRTL = I18nManager.isRTL

interface ChatThreadProps {
  messages: ChatMessage[]
  /** Which role the local user is — their bubbles hug the trailing edge. */
  selfRole: ChatRole
  isLoading: boolean
  /** True once the initial history load failed (403/404/network). */
  hasLoadError: boolean
  hasMore: boolean
  onLoadOlder: () => void
  isLoadingOlder: boolean
  onSend: (body: string) => void
  isSending: boolean
  /** Gate the composer. When false, the input is hidden and a closed banner shows. */
  canSend: boolean
  /** Localized reason shown when canSend is false (e.g. "chat closed"). */
  closedNote?: string
}

export function ChatThread({
  messages,
  selfRole,
  isLoading,
  hasLoadError,
  hasMore,
  onLoadOlder,
  isLoadingOlder,
  onSend,
  isSending,
  canSend,
  closedNote,
}: ChatThreadProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const [draft, setDraft] = useState('')

  // Inverted list: newest at the bottom. Render newest-first (reverse the
  // oldest-first stream) so index 0 is the latest, which the inverted list pins
  // to the bottom. "Load older" fires when we reach the (visual top) end.
  const data = useMemo(() => [...messages].reverse(), [messages])

  const listRef = useRef<FlatList<ChatMessage>>(null)

  const handleSend = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed || isSending) return
    onSend(trimmed)
    setDraft('')
  }, [draft, isSending, onSend])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => (
      <Bubble message={item} isOwn={item.senderRole === selfRole} colors={colors} />
    ),
    [selfRole, colors],
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? 90 : 0}
    >
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : hasLoadError && messages.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('chat.unavailableTitle')}
          body={t('chat.unavailableBody')}
          colors={colors}
        />
      ) : messages.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={t('chat.emptyTitle')}
          body={t('chat.emptyBody')}
          colors={colors}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.sm }}
          keyboardDismissMode="interactive"
          onEndReached={hasMore ? onLoadOlder : undefined}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isLoadingOlder ? (
              <View style={{ paddingVertical: Spacing.md }}>
                <ActivityIndicator color={colors.subtle} />
              </View>
            ) : null
          }
        />
      )}

      {canSend ? (
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={handleSend}
          isSending={isSending}
          colors={colors}
          placeholder={t('chat.inputPlaceholder')}
        />
      ) : (
        <View
          style={{
            paddingHorizontal: Spacing.lg,
            paddingVertical: Spacing.md,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text
            style={{
              ...Typography['caption-sm'],
              color: colors.subtle,
              textAlign: 'center',
              fontStyle: 'normal',
            }}
          >
            {closedNote ?? t('chat.closedNote')}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

interface BubbleProps {
  message: ChatMessage
  isOwn: boolean
  colors: ReturnType<typeof useThemeColors>
}

function Bubble({ message, isOwn, colors }: BubbleProps) {
  return (
    <View
      style={{
        maxWidth: '82%',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        backgroundColor: isOwn ? colors.tint : colors.surface,
        borderRadius: 18,
        borderCurve: 'continuous',
        // Tuck the corner nearest the sender's edge.
        ...(isOwn
          ? { borderBottomRightRadius: isRTL ? 18 : 4, borderBottomLeftRadius: isRTL ? 4 : 18 }
          : { borderBottomLeftRadius: isRTL ? 18 : 4, borderBottomRightRadius: isRTL ? 4 : 18 }),
        paddingHorizontal: Spacing.md + 2,
        paddingVertical: Spacing.sm + 2,
        gap: 2,
      }}
    >
      <Text
        style={{
          ...Typography.body,
          fontSize: 15,
          color: isOwn ? colors.onTint : colors.text,
          textAlign: isRTL ? 'right' : 'left',
        }}
      >
        {message.body}
      </Text>
      <View
        style={{
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-end',
          gap: 3,
        }}
      >
        <Text
          style={{
            fontFamily: 'Poppins_300Light',
            fontSize: 10,
            color: isOwn ? colors.onTint : colors.subtle,
            opacity: 0.8,
            // Clock time is Western numerals — keep LTR inside an AR card.
            writingDirection: 'ltr',
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatTime(message.createdAt)}
        </Text>
        {isOwn && (
          <Icon
            name={message.readAt ? 'checkmark-done' : 'checkmark'}
            size={13}
            color={message.readAt ? colors.info : colors.onTint}
          />
        )}
      </View>
    </View>
  )
}

interface ComposerProps {
  value: string
  onChangeText: (v: string) => void
  onSend: () => void
  isSending: boolean
  colors: ReturnType<typeof useThemeColors>
  placeholder: string
}

function Composer({ value, onChangeText, onSend, isSending, colors, placeholder }: ComposerProps) {
  const canSubmit = value.trim().length > 0 && !isSending
  return (
    <View
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 22,
          borderCurve: 'continuous',
          paddingHorizontal: Spacing.lg,
          paddingVertical: process.env.EXPO_OS === 'ios' ? 10 : 4,
          maxHeight: 120,
          justifyContent: 'center',
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.subtle}
          multiline
          maxLength={CHAT_MAX_LEN}
          style={{
            ...Typography.body,
            fontSize: 15,
            color: colors.text,
            textAlign: isRTL ? 'right' : 'left',
            includeFontPadding: false,
            maxHeight: 100,
          }}
        />
      </View>
      <TouchableOpacity
        onPress={onSend}
        disabled={!canSubmit}
        activeOpacity={0.85}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: canSubmit ? colors.tint : colors.muted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSending ? (
          <ActivityIndicator color={colors.onTint} size="small" />
        ) : (
          <Icon name="send" size={19} color={colors.onTint} />
        )}
      </TouchableOpacity>
    </View>
  )
}

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Icon>['name']
  title: string
  body: string
  colors: ReturnType<typeof useThemeColors>
}

function EmptyState({ icon, title, body, colors }: EmptyStateProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm }}>
      <Icon name={icon} size={44} color={colors.muted} />
      <Text style={{ ...Typography['heading-sm'], color: colors.text, textAlign: 'center' }}>{title}</Text>
      <Text style={{ ...Typography['caption-sm'], color: colors.subtle, textAlign: 'center', fontStyle: 'normal' }}>
        {body}
      </Text>
    </View>
  )
}

// HH:MM in the device's clock, digits normalized to ASCII.
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return toAsciiDigits(`${hh}:${mm}`)
}
