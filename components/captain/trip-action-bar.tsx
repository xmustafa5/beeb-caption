// components/captain/trip-action-bar.tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

interface TripActionBarProps {
  onCall: () => void
  onChat?: () => void // shown only when provided (chat open while trip active)
  onCancel?: () => void // shown only when provided (accepted state)
}

// Navigation lives in its own row (NavigateButtons: Google Maps / Waze).
export function TripActionBar({ onCall, onChat, onCancel }: TripActionBarProps) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  // native forceRTL mirrors this row in AR — no manual flip
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      <ActionButton icon="call" label={t('captain.live.call')} onPress={onCall} colors={colors} />
      {onChat && (
        <ActionButton icon="chatbubble-ellipses" label={t('captain.live.chat')} onPress={onChat} colors={colors} />
      )}
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
