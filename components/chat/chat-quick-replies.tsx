import { FlatList, Text, TouchableOpacity, type ListRenderItemInfo } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

export interface QuickReply {
  /** i18n leaf under chat.quick.captain.* — also the list key. */
  key: string
  /** Already-translated text; a tap sends exactly this, as if typed. */
  body: string
}

interface ChatQuickRepliesProps {
  items: QuickReply[]
  onPick: (body: string) => void
  /** True while a send is in flight — chips stay visible but inert. */
  disabled: boolean
}

/**
 * One-tap canned messages above the composer. The captain is driving, so a tap
 * sends immediately (no prefill step); the thread's send path — and its error
 * banner — is the same one the composer uses.
 */
export function ChatQuickReplies({ items, onPick, disabled }: ChatQuickRepliesProps) {
  const colors = useThemeColors()

  const renderItem = ({ item }: ListRenderItemInfo<QuickReply>) => (
    <TouchableOpacity
      onPress={() => onPick(item.body)}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 18,
        borderCurve: 'continuous',
        paddingVertical: Spacing.sm + 2,
        paddingHorizontal: Spacing.lg,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ ...Typography['caption-sm'], color: colors.text, fontStyle: 'normal' }}>
        {item.body}
      </Text>
    </TouchableOpacity>
  )

  return (
    <FlatList
      data={items}
      horizontal
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      // The row is a sibling of the composer inside a column: without flexGrow 0
      // the scroll view would claim the leftover height above the keyboard.
      style={{ flexGrow: 0 }}
      // A chip tap must not be eaten by the keyboard-dismiss tap.
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: Spacing.sm }}
    />
  )
}
