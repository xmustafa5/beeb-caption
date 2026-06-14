import { View, Text, TouchableOpacity, I18nManager } from 'react-native'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import type { ComponentProps, ReactNode } from 'react'

interface SettingsRowProps {
  icon: ComponentProps<typeof Icon>['name']
  iconBg?: string
  iconColor?: string
  label: string
  value?: string
  trailing?: ReactNode
  onPress?: () => void
  destructive?: boolean
  showChevron?: boolean
}

export function SettingsRow({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  trailing,
  onPress,
  destructive,
  showChevron = true,
}: SettingsRowProps) {
  const colors = useThemeColors()

  const labelColor = destructive ? colors.destructive : colors.text
  const resolvedIconBg = iconBg ?? colors.surface
  const resolvedIconColor = iconColor ?? (destructive ? colors.destructive : colors.text)

  const Wrapper: any = onPress ? TouchableOpacity : View

  return (
    <Wrapper
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        // native forceRTL mirrors this row in AR — no manual flip
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        paddingVertical: 14,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        borderCurve: 'continuous',
        backgroundColor: resolvedIconBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon name={icon} size={18} color={resolvedIconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...Typography['body-md'], color: labelColor }}>
          {label}
        </Text>
        {value && (
          <Text style={{ ...Typography['caption-sm'], color: colors.subtle, fontStyle: 'normal', marginTop: 1 }}>
            {value}
          </Text>
        )}
      </View>
      {trailing}
      {!trailing && onPress && showChevron && (
        <Icon
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={colors.subtle}
        />
      )}
    </Wrapper>
  )
}

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  const colors = useThemeColors()
  return (
    <View style={{ gap: Spacing.sm }}>
      {title && (
        <Text style={{
          ...Typography['input-label'],
          color: colors.subtle,
          paddingHorizontal: Spacing.lg,
          fontStyle: 'normal',
          textTransform: 'uppercase',
          fontSize: 11,
          letterSpacing: 0.6,
        }}>
          {title}
        </Text>
      )}
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 16,
        borderCurve: 'continuous',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
      }}>
        {children}
      </View>
    </View>
  )
}

export function SettingsDivider() {
  const colors = useThemeColors()
  // Indent the divider to align under the label, past the icon column.
  // Physical marginLeft does NOT auto-swap under forceRTL, so branch the edge:
  // in AR the icon sits on the reading start (visual right), so inset on the right.
  const indent = Spacing.lg + 36 + Spacing.md
  return (
    <View style={{
      height: 1,
      backgroundColor: colors.border,
      marginLeft: I18nManager.isRTL ? 0 : indent,
      marginRight: I18nManager.isRTL ? indent : 0,
    }} />
  )
}
