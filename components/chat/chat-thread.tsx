import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  I18nManager,
  type ListRenderItemInfo,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { FormError } from '@/components/forms/form-error'
import { ChatQuickReplies, type QuickReply } from '@/components/chat/chat-quick-replies'
import { parseApiError } from '@/lib/api'
import { toAsciiDigits } from '@/lib/digits'
import { CHAT_MAX_LEN, type ChatMessage, type ChatRole } from '@/services/chat'

// Module-scope: forceRTL requires a restart, so the value is stable per session.
const isRTL = I18nManager.isRTL

// Consecutive messages from the same sender inside this window read as one turn.
const GROUP_WINDOW_MS = 2 * 60_000

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
  /** May reject — the thread restores the draft and shows the error banner. */
  onSend: (body: string) => void | Promise<void>
  isSending: boolean
  /** Last send failure (from use-chat), surfaced above the composer. */
  sendError?: unknown
  /** Gate the composer. When false, the input is hidden and a closed banner shows. */
  canSend: boolean
  /** Localized reason shown when canSend is false (e.g. "chat closed"). */
  closedNote?: string
  /** Phase-aware one-tap replies, shown above the composer while canSend. */
  quickReplies?: QuickReply[]
  /** Phase-aware empty-state copy; falls back to the generic line. */
  emptyBody?: string
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
  sendError,
  canSend,
  closedNote,
  quickReplies,
  emptyBody,
}: ChatThreadProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState('')

  // While the keyboard is up the KAV already lifts the composer by the keyboard
  // height (and on Android the nav bar is behind the keyboard), so adding the
  // bottom inset on top of that would leave a second gap. Both platforms, not
  // just iOS — under edge-to-edge Android the inset is the nav bar, which the
  // keyboard already covers. Kept identical to the rider app's copy.
  const [keyboardUp, setKeyboardUp] = useState(false)
  useEffect(() => {
    const isIOS = process.env.EXPO_OS === 'ios'
    const show = Keyboard.addListener(isIOS ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setKeyboardUp(true),
    )
    const hide = Keyboard.addListener(isIOS ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setKeyboardUp(false),
    )
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])
  const bottomInset = keyboardUp ? 0 : insets.bottom

  // Inverted list: newest at the bottom. Render newest-first (reverse the
  // oldest-first stream) so index 0 is the latest, which the inverted list pins
  // to the bottom. "Load older" fires when we reach the (visual top) end.
  const data = useMemo(() => [...messages].reverse(), [messages])

  const listRef = useRef<FlatList<ChatMessage>>(null)

  // Single send path for the composer and the quick-reply chips. onSend may
  // reject (offline, 409 on a trip that just ended); the old code discarded the
  // promise and cleared the draft, so a failed message was simply lost. Put the
  // text back — unless the user has already typed something new.
  const submit = useCallback(
    async (body: string) => {
      try {
        await onSend(body)
      } catch {
        setDraft((d) => d || body)
      }
    },
    [onSend],
  )

  const handleSend = useCallback(() => {
    const trimmed = draft.trim()
    if (!trimmed || isSending) return
    setDraft('')
    void submit(trimmed)
  }, [draft, isSending, submit])

  const handlePickQuickReply = useCallback(
    (body: string) => {
      if (isSending) return
      void submit(body)
    },
    [isSending, submit],
  )

  // 409 = the trip left accepted/in_progress between opening the thread and
  // sending; that is not a retryable failure, so name it for what it is.
  const sendErrorMessage = useMemo(() => {
    if (!sendError) return null
    return parseApiError(sendError).status === 409
      ? t('chat.closedTerminal')
      : t('chat.sendFailed')
  }, [sendError, t])

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ChatMessage>) => {
      // The list is inverted, so index+1 is the visually PREVIOUS (older)
      // message and index-1 the one below it (newer).
      const previous = data[index + 1]
      const next = data[index - 1]
      return (
        <Bubble
          message={item}
          isOwn={item.senderRole === selfRole}
          isFirstInGroup={!isGrouped(previous, item)}
          isLastInGroup={!isGrouped(item, next)}
          colors={colors}
        />
      )
    },
    [data, selfRole, colors],
  )

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      // 0, not a header height: this KAV fills the screen under a custom (JS)
      // header, so RN measures the gap from its own frame. A non-zero offset
      // here floats the composer that many points above the keyboard.
      keyboardVerticalOffset={0}
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
          body={emptyBody ?? t('chat.emptyBody')}
          colors={colors}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={data}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          // Spacing lives on the bubbles now (grouped turns sit tight, new turns
          // breathe), so no uniform gap here.
          contentContainerStyle={{ padding: Spacing.lg }}
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
        <>
          {sendErrorMessage ? (
            <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
              <FormError message={sendErrorMessage} />
            </View>
          ) : null}
          {quickReplies && quickReplies.length > 0 ? (
            <View style={{ paddingBottom: Spacing.sm }}>
              {/* Native forceRTL mirrors the horizontal row in AR. */}
              <ChatQuickReplies
                items={quickReplies}
                onPick={handlePickQuickReply}
                disabled={isSending}
              />
            </View>
          ) : null}
          <Composer
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            isSending={isSending}
            colors={colors}
            placeholder={t('chat.inputPlaceholder')}
            bottomInset={bottomInset}
          />
        </>
      ) : (
        <View
          style={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.md,
            // No composer to focus, so the keyboard never covers this — always
            // clear the home indicator / gesture bar.
            paddingBottom: insets.bottom + Spacing.md,
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

/** Two adjacent messages (older, newer) belong to the same visual turn. */
function isGrouped(older?: ChatMessage, newer?: ChatMessage): boolean {
  if (!older || !newer) return false
  if (older.senderRole !== newer.senderRole) return false
  const gap = new Date(newer.createdAt).getTime() - new Date(older.createdAt).getTime()
  return Number.isFinite(gap) && Math.abs(gap) <= GROUP_WINDOW_MS
}

interface BubbleProps {
  message: ChatMessage
  isOwn: boolean
  /** Opens a new turn — gets the wider gap above it. */
  isFirstInGroup: boolean
  /** Closes a turn — only this bubble wears the tail and the time/tick row. */
  isLastInGroup: boolean
  colors: ReturnType<typeof useThemeColors>
}

function Bubble({ message, isOwn, isFirstInGroup, isLastInGroup, colors }: BubbleProps) {
  return (
    <View
      style={{
        maxWidth: '82%',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        // The cell is double-flipped inside an inverted list, so its interior is
        // upright: marginTop is the space above the bubble, i.e. the seam with
        // data[index + 1].
        marginTop: isFirstInGroup ? Spacing.md : Spacing.xs,
        backgroundColor: isOwn ? colors.tint : colors.surface,
        borderRadius: 18,
        borderCurve: 'continuous',
        // Tuck the corner nearest the sender's edge — only on the turn's last
        // bubble, so a run of messages reads as one block.
        ...(isLastInGroup
          ? isOwn
            ? { borderBottomRightRadius: isRTL ? 18 : 4, borderBottomLeftRadius: isRTL ? 4 : 18 }
            : { borderBottomLeftRadius: isRTL ? 18 : 4, borderBottomRightRadius: isRTL ? 4 : 18 }
          : null),
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
      {isLastInGroup && (
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
              fontFamily: 'Poppins_400Regular',
              fontSize: 11,
              color: isOwn ? colors.onTint : colors.subtle,
              opacity: 0.75,
              // Clock time is Western numerals — keep LTR inside an AR card.
              writingDirection: 'ltr',
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatTime(message.createdAt)}
          </Text>
          {isOwn && (
            // Read state is carried by the glyph and its weight, not by a hue:
            // the old blue tick on the tint bubble was ~1.3:1 in dark.
            <View style={{ opacity: message.readAt ? 1 : 0.6 }}>
              <Icon
                name={message.readAt ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={isOwn ? colors.onTint : colors.subtle}
              />
            </View>
          )}
        </View>
      )}
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
  /** Safe-area bottom, already zeroed while the keyboard covers it. */
  bottomInset: number
}

function Composer({
  value,
  onChangeText,
  onSend,
  isSending,
  colors,
  placeholder,
  bottomInset,
}: ComposerProps) {
  const canSubmit = value.trim().length > 0 && !isSending
  return (
    <View
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: Spacing.md,
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
        paddingBottom: Math.max(bottomInset, Spacing.md),
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
          // Match the 44 pt send button at rest, then grow with the text.
          minHeight: 44,
          paddingHorizontal: Spacing.lg,
          paddingVertical: 8,
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
            lineHeight: 22,
            color: colors.text,
            textAlign: isRTL ? 'right' : 'left',
            textAlignVertical: 'center',
            includeFontPadding: false,
            maxHeight: 110,
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
          borderCurve: 'continuous',
          // Dim the tint rather than swapping in a pale fill: a white glyph on
          // colors.muted was ~1.5:1, and this is how Button reads as disabled.
          backgroundColor: colors.tint,
          opacity: canSubmit ? 1 : 0.4,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isSending ? (
          <ActivityIndicator color={colors.onTint} size="small" />
        ) : (
          // Direction-neutral glyph: nothing to mirror in AR.
          <Icon name="arrow-up" size={20} color={colors.onTint} />
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
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.xl,
        gap: Spacing.md,
      }}
    >
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={32} color={colors.tint} />
      </View>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        style={{
          ...Typography.caption,
          lineHeight: 22,
          maxWidth: 280,
          color: colors.subtle,
          textAlign: 'center',
        }}
      >
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
