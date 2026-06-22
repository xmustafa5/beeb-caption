import { forwardRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  I18nManager,
  type TextInputProps,
} from 'react-native'
import { Image } from 'expo-image'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

// Stable for the session — forceRTL flips require a restart anyway.
const isRTL = I18nManager.isRTL

/**
 * Shared auth-screen frame: a full-bleed Beeb-tinted hero gradient with the logo
 * pinned top, an absolute back button, and a centered scrollable content column.
 * Mirrors the TAN reference layout (logo → title → form → pill button) but uses
 * Beeb's themed colors via useThemeColors() so light/dark both work.
 */
export function AuthScaffold({
  title,
  subtitle,
  children,
  showBack = true,
  onBack,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  showBack?: boolean
  onBack?: () => void
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const router = useRouter()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: Spacing.xl,
            paddingTop: insets.top + Spacing.xl * 3,
            paddingBottom: insets.bottom + Spacing.xl,
            justifyContent: 'center',
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {showBack && (
            <TouchableOpacity
              onPress={() => (onBack ? onBack() : router.back())}
              activeOpacity={0.7}
              hitSlop={12}
              style={{
                position: 'absolute',
                top: insets.top + Spacing.md,
                // Back chevron hugs the leading edge in both directions.
                ...(isRTL ? { right: Spacing.xl } : { left: Spacing.xl }),
                width: 40,
                height: 40,
                borderRadius: 14,
                borderCurve: 'continuous',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <Icon
                name={isRTL ? 'chevron-forward' : 'chevron-back'}
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          )}

          <Animated.View entering={FadeInDown.duration(400)}>
            {/* Logo */}
            <View style={{ alignItems: 'center', marginBottom: Spacing.xl * 1.5 }}>
              <Image
                source={require('@/assets/images/logo.png')}
                style={{ width: 96, height: 40 }}
                contentFit="contain"
              />
            </View>

            <Text
              style={{
                ...Typography['heading-lg'],
                color: colors.text,
                fontSize: 28,
                lineHeight: 34,
                letterSpacing: -0.5,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={{
                  ...Typography.body,
                  color: colors.subtle,
                  fontSize: 15,
                  lineHeight: 22,
                  textAlign: 'center',
                  marginTop: Spacing.sm,
                }}
              >
                {subtitle}
              </Text>
            )}

            <View style={{ marginTop: Spacing.xl * 1.5, gap: Spacing.lg }}>
              {children}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

/**
 * Labeled text field for the auth screens. Themed; supports an optional trailing
 * node and an inline error line below. Placeholder/content alignment follows the
 * physical edge so AR hugs the right.
 */
interface AuthFieldProps extends Omit<TextInputProps, 'style'> {
  label: string
  error?: string
  trailing?: React.ReactNode
  leading?: React.ReactNode
  numeric?: boolean
  /**
   * Pin the input row to LTR regardless of app direction. Native RTL mirrors a
   * literal `flexDirection: 'row'`, which would push a leading prefix (e.g. the
   * +964 dial code) to the visual right in AR. Setting `direction: 'ltr'` on the
   * row keeps the leading slot on the visual LEFT and the digits flowing after
   * it in both languages — the desired layout for a phone field.
   */
  pinLtrRow?: boolean
}

export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, error, trailing, leading, numeric, pinLtrRow, ...props },
  ref,
) {
  const colors = useThemeColors()
  const [focused, setFocused] = useState(false)

  return (
    <View style={{ gap: Spacing.xs + 1 }}>
      <Text
        style={{
          ...Typography['input-label'],
          color: colors.subtle,
          // Reading-start: visual left in EN, visual right in AR (native RTL swaps it).
          textAlign: 'left',
        }}
      >
        {label}
      </Text>
      <View
        style={{
          // pinLtrRow forces the row LTR so a leading prefix (the +964 dial code)
          // stays on the visual LEFT in AR too; otherwise native RTL mirrors the row.
          ...(pinLtrRow ? { direction: 'ltr' as const } : null),
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderWidth: 1.5,
          borderColor: error ? colors.destructive : focused ? colors.tint : colors.border,
          borderRadius: 14,
          borderCurve: 'continuous',
          paddingHorizontal: Spacing.lg,
          height: 54,
          gap: Spacing.md,
        }}
      >
        {leading}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.subtle}
          onFocus={(e) => {
            setFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            props.onBlur?.(e)
          }}
          {...props}
          style={{
            flex: 1,
            ...Typography.body,
            color: colors.text,
            // numeric fields (phone / OTP) stay Western-LTR even in AR; text fields
            // follow the physical edge so AR placeholders/content hug the right.
            ...(numeric
              ? { textAlign: 'left' as const, writingDirection: 'ltr' as const }
              : { textAlign: isRTL ? ('right' as const) : ('left' as const) }),
            includeFontPadding: false,
          }}
        />
        {trailing}
      </View>
      {error && (
        <Text
          style={{
            ...Typography['caption-sm'],
            color: colors.destructive,
            fontStyle: 'normal',
            textAlign: 'left',
          }}
        >
          {error}
        </Text>
      )}
    </View>
  )
})

/** Password field with a built-in show/hide eye toggle. */
export const PasswordField = forwardRef<TextInput, Omit<AuthFieldProps, 'trailing' | 'secureTextEntry'>>(
  function PasswordField(props, ref) {
    const colors = useThemeColors()
    const [show, setShow] = useState(false)
    return (
      <AuthField
        ref={ref}
        {...props}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        leading={<Icon name="lock-closed-outline" size={20} color={colors.subtle} />}
        trailing={
          <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={10} activeOpacity={0.7}>
            <Icon name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.subtle} />
          </TouchableOpacity>
        }
      />
    )
  },
)

/**
 * Iraqi phone field: a fixed +964 / 🇮🇶 prefix on the leading edge and an
 * LTR-locked numeric body. Caller owns the value (stores local `07…` digits).
 */
export const PhoneField = forwardRef<TextInput, Omit<AuthFieldProps, 'leading' | 'keyboardType' | 'numeric'>>(
  function PhoneField(props, ref) {
    const colors = useThemeColors()
    return (
      <AuthField
        ref={ref}
        keyboardType="phone-pad"
        numeric
        pinLtrRow
        maxLength={11}
        {...props}
        leading={
          <View
            style={{
              // Row is pinned LTR by pinLtrRow, so flag + dial code stay on the
              // visual LEFT with the divider on their trailing (right) edge in
              // both EN and AR — no per-language flipping needed.
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingRight: Spacing.sm,
              borderRightWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 18 }}>🇮🇶</Text>
            <Text
              style={{
                ...Typography.body,
                color: colors.text,
                writingDirection: 'ltr',
                fontVariant: ['tabular-nums'],
              }}
            >
              +964
            </Text>
          </View>
        }
      />
    )
  },
)

/**
 * Six-box OTP display driven by a single string value (boxes are read-only; the
 * real input is a hidden numeric TextInput the caller renders). Fills left→right
 * in both languages.
 */
export function OtpBoxes({ value }: { value: string }) {
  const colors = useThemeColors()
  const digits = value.split('')
  return (
    <View
      style={{
        // LTR-locked: box 0 = first digit in EN and AR alike.
        flexDirection: isRTL ? 'row-reverse' : 'row',
        gap: Spacing.sm,
        justifyContent: 'space-between',
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => {
        const filled = !!digits[i]
        const active = digits.length === i
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 56,
              borderRadius: 12,
              borderCurve: 'continuous',
              borderWidth: 1.5,
              borderColor: active ? colors.tint : filled ? colors.border : colors.muted,
              backgroundColor: filled ? colors.surface : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...Typography['heading-md'],
                color: colors.text,
                writingDirection: 'ltr',
                fontVariant: ['tabular-nums'],
              }}
            >
              {digits[i] ?? ''}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export { isRTL as authIsRTL }
