import { forwardRef } from 'react'
import { TextInput, View, Text, type TextInputProps, I18nManager } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  error?: string
  trailing?: React.ReactNode
  leading?: React.ReactNode
  /**
   * Force left-to-right for numeric content (phone, OTP, amounts). Numbers read
   * LTR in both English and Arabic, so these fields stay left-aligned/LTR even
   * when the app is in RTL. Defaults to false (text follows the app direction).
   */
  numeric?: boolean
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, trailing, leading, numeric, ...props },
  ref,
) {
  const colors = useThemeColors()

  return (
    <View style={{ gap: Spacing.xs + 1 }}>
      {label && (
        <Text style={{ ...Typography['input-label'], color: colors.subtle }}>
          {label}
        </Text>
      )}
      <View style={{
        // Literal 'row' is NOT auto-mirrored by RN under RTL, so the leading slot stays
        // on the left and the TextInput to its right in both languages. For numeric
        // fields the TextInput's textAlign:'left' + writingDirection:'ltr' keep digits LTR.
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: error ? colors.destructive : colors.border,
        borderRadius: 14,
        borderCurve: 'continuous',
        paddingHorizontal: Spacing.lg,
        height: 54,
        gap: Spacing.md,
      }}>
        {leading}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.subtle}
          {...props}
          style={{
            flex: 1,
            ...Typography.body,
            color: colors.text,
            // Numeric fields (phone/OTP) stay LTR in both languages; text fields follow the app direction.
            textAlign: numeric ? 'left' : I18nManager.isRTL ? 'right' : 'left',
            writingDirection: numeric ? 'ltr' : undefined,
            includeFontPadding: false,
          }}
        />
        {trailing}
      </View>
      {error && (
        <Text style={{ ...Typography['caption-sm'], color: colors.destructive, fontStyle: 'normal' }}>
          {error}
        </Text>
      )}
    </View>
  )
})
