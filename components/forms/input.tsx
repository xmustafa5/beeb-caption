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
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, trailing, leading, ...props },
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
            textAlign: I18nManager.isRTL ? 'right' : 'left',
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
