import { View, Text, Pressable, TouchableOpacity } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

interface SelectFieldProps {
  label: string
  /** Display text of the current choice; empty shows the placeholder. */
  value?: string
  placeholder?: string
  onPress: () => void
  error?: string
  leading?: React.ReactNode
  /** Optional fields: when set and a value is chosen, a clear button replaces the chevron. */
  onClear?: () => void
  clearLabel?: string
}

/**
 * Tappable field that opens a picker (usually a <SelectSheet>). Mirrors the
 * bordered container in components/forms/input.tsx so selects and text inputs
 * read as one control set.
 */
export function SelectField({ label, value, placeholder, onPress, error, leading, onClear, clearLabel }: SelectFieldProps) {
  const colors = useThemeColors()

  return (
    <View style={{ gap: Spacing.xs + 1 }}>
      <Text style={{ ...Typography['input-label'], color: colors.subtle, textAlign: 'left' }}>
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({
          // native forceRTL mirrors this row in AR — no manual flip
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: pressed ? colors.cardElevated : colors.surface,
          borderWidth: 1,
          borderColor: error ? colors.destructive : colors.border,
          borderRadius: 14,
          borderCurve: 'continuous',
          paddingHorizontal: Spacing.lg,
          height: 54,
          gap: Spacing.md,
        })}
      >
        {leading}
        <Text numberOfLines={1} style={{ ...Typography.body, color: value ? colors.text : colors.subtle, flex: 1, textAlign: 'left' }}>
          {value || placeholder}
        </Text>
        {value && onClear ? (
          <TouchableOpacity onPress={onClear} activeOpacity={0.7} hitSlop={10} accessibilityRole="button" accessibilityLabel={clearLabel}>
            <Icon name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : (
          <Icon name="chevron-down" size={18} color={colors.muted} />
        )}
      </Pressable>
      {error && (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal', textAlign: 'left' }}>
          {error}
        </Text>
      )}
    </View>
  )
}
