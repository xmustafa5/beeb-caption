import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import type { ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
  onPress?: () => void
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 40, md: 48, lg: 56 }
const PADDINGS: Record<ButtonSize, number> = { sm: 14, md: 18, lg: 22 }

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'lg',
  disabled,
  loading,
  fullWidth = true,
  leading,
  trailing,
}: ButtonProps) {
  const colors = useThemeColors()

  let bg: string
  let textColor: string
  let borderColor: string | undefined

  switch (variant) {
    case 'primary':
      bg = colors.tint
      textColor = colors.onTint
      break
    case 'secondary':
      bg = colors.surface
      textColor = colors.text
      borderColor = colors.border
      break
    case 'ghost':
      bg = 'transparent'
      textColor = colors.text
      break
    case 'destructive':
      bg = colors.destructive
      textColor = '#FFFFFF'
      break
  }

  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={{
        height: HEIGHTS[size],
        paddingHorizontal: PADDINGS[size],
        backgroundColor: bg,
        borderRadius: HEIGHTS[size] / 2,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        opacity: isDisabled ? 0.5 : 1,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        ...(borderColor ? { borderWidth: 1, borderColor } : {}),
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {leading}
          <Text style={{
            ...Typography['heading-sm'],
            color: textColor,
            fontFamily: 'Poppins_600SemiBold',
          }}>
            {label}
          </Text>
          {trailing}
        </>
      )}
    </TouchableOpacity>
  )
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>
}
