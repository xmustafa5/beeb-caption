// components/captain/trip-action-bar.tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

interface TripActionBarProps {
  onCall: () => void
  onNavigate: () => void
  onCancel?: () => void // shown only when provided (accepted state)
}

export function TripActionBar({ onCall, onNavigate, onCancel }: TripActionBarProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  // native forceRTL mirrors this row in AR — no manual flip
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      <ActionButton icon="call" label={t('captain.live.call')} onPress={onCall} colors={colors} />
      <ActionButton icon="navigate" label={t('captain.live.navigate')} onPress={onNavigate} colors={colors} />
      {onCancel && (
        <ActionButton icon="close-circle" label={t('captain.live.cancel')} onPress={onCancel} colors={colors} destructive />
      )}
    </View>
  )
}

interface ActionButtonProps {
  icon: React.ComponentProps<typeof Icon>['name']
  label: string
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  destructive?: boolean
}

function ActionButton({ icon, label, onPress, colors, destructive }: ActionButtonProps) {
  const tone = destructive ? colors.destructive : colors.tint
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: Spacing.md,
        borderRadius: 14,
        borderCurve: 'continuous',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Icon name={icon} size={20} color={tone} />
      <Text style={{ ...Typography['caption-sm'], color: tone, fontStyle: 'normal' }}>{label}</Text>
    </TouchableOpacity>
  )
}
