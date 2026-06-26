import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { Text, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated'
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

type IconName = React.ComponentProps<typeof Icon>['name']

export interface Option<T extends string> {
  value: T
  label: string
  icon?: IconName
}

/** Imperative handle the parent uses to open/close the sheet (TAN's pattern). */
export interface OptionSheetRef {
  present: () => void
  dismiss: () => void
}

interface OptionSheetProps<T extends string> {
  title: string
  options: Option<T>[]
  /** Current value — its row shows a checkmark. */
  selected: T
  /** Fires with the chosen value; the parent applies the change and closes the sheet. */
  onSelect: (value: T) => void
  /** Called after the sheet finishes dismissing (swipe-down, backdrop tap, or programmatic). */
  onClose?: () => void
}

// Tap-to-dismiss backdrop. Mirrors TAN's share/comments sheets: a full-screen
// Pressable that's only interactive while the sheet is open (animatedIndex > -0.5).
function SheetBackdrop({ animatedIndex, style, onClose }: BottomSheetBackdropProps & { onClose: () => void }) {
  const [active, setActive] = useState(false)
  useAnimatedReaction(
    () => animatedIndex.value > -0.5,
    (cur, prev) => { if (cur !== prev) runOnJS(setActive)(cur) },
  )
  return (
    <Pressable
      onPress={onClose}
      style={[StyleSheet.absoluteFill, style, { backgroundColor: 'rgba(0,0,0,0.4)', pointerEvents: active ? 'auto' : 'none' }]}
    />
  )
}

/**
 * Bottom-sheet single-choice picker built on @gorhom/bottom-sheet (the same
 * package + ref-based trigger pattern TAN uses for its drawers). Presentational
 * only — the caller supplies options and handles selection.
 *
 * The parent holds a ref and calls `ref.current?.present()` from the tap handler
 * (no declarative `visible` prop — that bridge proved unreliable). Requires a
 * <BottomSheetModalProvider> mounted at the app root.
 */
function OptionSheetInner<T extends string>(
  { title, options, selected, onSelect, onClose }: OptionSheetProps<T>,
  ref: React.Ref<OptionSheetRef>,
) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)

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

  return (
    <BottomSheetModal
      ref={sheetRef}
      onDismiss={onClose}
      enablePanDownToClose
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
    >
      <BottomSheetView
        style={{
          paddingTop: Spacing.sm,
          paddingHorizontal: Spacing.xl,
          paddingBottom: insets.bottom + Spacing.lg,
          gap: Spacing.sm,
        }}
      >
        <Text
          style={{ ...Typography['heading-md'], color: colors.text, width: '100%', textAlign: 'left', marginBottom: Spacing.xs }}
        >
          {title}
        </Text>

        {options.map((opt) => {
          const isSelected = opt.value === selected
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={({ pressed }) => ({
                // native forceRTL mirrors this row in AR — no manual flip
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.md,
                paddingVertical: Spacing.md,
                paddingHorizontal: Spacing.md,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: pressed ? colors.surface : 'transparent',
              })}
            >
              {opt.icon && (
                <Icon name={opt.icon} size={20} color={isSelected ? colors.tint : colors.subtle} />
              )}
              <Text
                style={{
                  ...Typography.body,
                  flex: 1,
                  textAlign: 'left',
                  color: colors.text,
                  fontFamily: isSelected ? 'Poppins_600SemiBold' : 'Poppins_400Regular',
                }}
              >
                {opt.label}
              </Text>
              {isSelected && <Icon name="checkmark" size={20} color={colors.tint} />}
            </Pressable>
          )
        })}
      </BottomSheetView>
    </BottomSheetModal>
  )
}

// forwardRef + a generic component: cast preserves the <T> param through the ref wrapper.
export const OptionSheet = forwardRef(OptionSheetInner) as <T extends string>(
  props: OptionSheetProps<T> & { ref?: React.Ref<OptionSheetRef> },
) => ReturnType<typeof OptionSheetInner>
