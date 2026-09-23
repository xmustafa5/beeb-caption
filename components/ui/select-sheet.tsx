import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, TouchableOpacity, I18nManager } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheetModal,
  BottomSheetFlatList,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { SheetBackdrop, type OptionSheetRef } from '@/components/ui/option-sheet'
import { foldForSearch } from '@/lib/search-fold'

export interface SelectOption {
  value: string
  label: string
  /** Extra search terms beyond the label — the other language's name, synonyms. */
  keywords?: string[]
  /** Rendered before the label (e.g. a color swatch). */
  leading?: React.ReactNode
}

interface SelectSheetProps {
  title: string
  options: SelectOption[]
  /** Current value — its row shows a checkmark. */
  selected: string
  /** Fires with the chosen value; the sheet then dismisses itself. */
  onSelect: (value: string) => void
  /** Show a search box above the list. */
  searchable?: boolean
  searchPlaceholder?: string
  searchClearLabel?: string
  /** Shown when the search matches nothing. */
  emptyText?: string
}

// Folds the Arabic spellings people type interchangeably (hamza forms of alef,
// taa marbuta / haa, alef maqsura / yaa) and strips diacritics, so a search
// matches whether or not the keyboard added a hamza or tashkeel — and whether
// it was typed on an Arabic or a Kurdish keyboard (ک ی ە ۆ …).
function normalize(s: string) {
  return foldForSearch(s)
}

/**
 * Bottom-sheet single-choice list for option sets too long for <OptionSheet>
 * (years, colors), with an optional search box. Same ref-based trigger:
 * the parent calls `ref.current?.present()`. Requires the root
 * <BottomSheetModalProvider>.
 */
export const SelectSheet = forwardRef<OptionSheetRef, SelectSheetProps>(function SelectSheet(
  { title, options, selected, onSelect, searchable, searchPlaceholder, searchClearLabel, emptyText },
  ref,
) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [query, setQuery] = useState('')

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }), [])

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <SheetBackdrop {...props} onClose={() => sheetRef.current?.dismiss()} />
    ),
    [],
  )

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return options
    return options.filter((o) => [o.label, ...(o.keywords ?? [])].some((term) => normalize(term).includes(q)))
  }, [options, query])

  const choose = (value: string) => {
    onSelect(value)
    sheetRef.current?.dismiss()
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      // A fixed height (not dynamic sizing) — the list scrolls inside it.
      snapPoints={['75%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      // Reopening starts from the full list, not the last search.
      onDismiss={() => setQuery('')}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <View style={{ paddingTop: Spacing.sm, paddingHorizontal: Spacing.xl, paddingBottom: Spacing.md, gap: Spacing.md }}>
        <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'left' }}>
          {title}
        </Text>
        {searchable && (
          <View
            style={{
              // native forceRTL mirrors this row in AR — no manual flip
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              borderCurve: 'continuous',
              paddingHorizontal: Spacing.lg,
              height: 50,
              gap: Spacing.md,
            }}
          >
            <Icon name="search" size={18} color={colors.subtle} />
            <BottomSheetTextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.subtle}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              style={{
                flex: 1,
                ...Typography.body,
                color: colors.text,
                textAlign: I18nManager.isRTL ? 'right' : 'left',
                includeFontPadding: false,
              }}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                activeOpacity={0.7}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={searchClearLabel}
              >
                <Icon name="close-circle" size={18} color={colors.muted} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <BottomSheetFlatList
        data={filtered}
        keyExtractor={(o: SelectOption) => o.value}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: insets.bottom + Spacing.lg }}
        ListEmptyComponent={
          emptyText ? (
            <Text style={{ ...Typography['body-md'], color: colors.subtle, textAlign: 'left', padding: Spacing.lg }}>
              {emptyText}
            </Text>
          ) : null
        }
        renderItem={({ item }: { item: SelectOption }) => {
          const isSelected = item.value === selected
          return (
            <Pressable
              onPress={() => choose(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => ({
                // native forceRTL mirrors this row in AR — no manual flip
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.md,
                paddingVertical: Spacing.md + 2,
                paddingHorizontal: Spacing.lg,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: pressed || isSelected ? colors.surface : 'transparent',
              })}
            >
              {item.leading}
              <Text
                style={{
                  ...Typography.body,
                  flex: 1,
                  textAlign: 'left',
                  color: colors.text,
                  fontFamily: isSelected ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                }}
              >
                {item.label}
              </Text>
              {isSelected && <Icon name="checkmark" size={20} color={colors.tint} />}
            </Pressable>
          )
        }}
      />
    </BottomSheetModal>
  )
})
