import { View, TouchableOpacity, Text, ActivityIndicator, I18nManager } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Icon } from '@/components/ui/icon'
import { Typography } from '@/constants/Typography'
import { useActivation } from '@/hooks/use-activation'
import { useCaptainPresence } from '@/providers/captain-presence'
import type { ComponentProps } from 'react'
import type { Ionicons } from '@expo/vector-icons'

type IoniconName = ComponentProps<typeof Ionicons>['name']

interface TabDef {
  name: string
  icon: IoniconName
  labelKey: string
}

// Side tabs only — the center Activate button is rendered separately between them.
const TAB_DEFS: TabDef[] = [
  { name: 'index',   icon: 'home',   labelKey: 'tabs.home'    },
  { name: 'profile', icon: 'person', labelKey: 'tabs.profile' },
]

interface CustomTabBarProps {
  activeIndex: number
  /** Side-tab indices into the pager: Home = 0, Profile = 1. */
  onTabPress: (index: number) => void
  /** Open the payment sheet. Only reached while the day is NOT yet paid for. */
  onActivatePress: () => void
  badges?: Partial<Record<number, number>>
}

export function CustomTabBar({ activeIndex, onTabPress, onActivatePress, badges }: CustomTabBarProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      paddingBottom: insets.bottom || 12,
      paddingTop: 8,
      paddingHorizontal: 8,
      alignItems: 'flex-end',
      boxShadow: '0px -2px 12px rgba(0, 0, 0, 0.04)',
    }}>
      <TabItem
        icon={TAB_DEFS[0].icon}
        label={t(TAB_DEFS[0].labelKey)}
        active={activeIndex === 0}
        onPress={() => onTabPress(0)}
        colors={colors}
        isRTL={I18nManager.isRTL}
        badge={badges?.[0]}
      />

      <ActivateButton onPress={onActivatePress} colors={colors} />

      <TabItem
        icon={TAB_DEFS[1].icon}
        label={t(TAB_DEFS[1].labelKey)}
        active={activeIndex === 1}
        onPress={() => onTabPress(1)}
        colors={colors}
        isRTL={I18nManager.isRTL}
        badge={badges?.[1]}
      />
    </View>
  )
}

interface ActivateButtonProps {
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
}

/**
 * Center control. Once the day is paid for this IS the online switch — tapping
 * it goes on and off air directly, with no sheet in between. The sheet is only
 * for the one thing that genuinely needs a form: paying the daily fee.
 *
 *   not paid  → violet, "Activate"      → opens the payment sheet
 *   paid, off → outlined, "Go online"   → goes online
 *   busy      → spinner                 → request in flight, taps ignored
 *   connecting→ green, "Connecting…"     → on air, socket still handshaking
 *   live      → green, "Online"         → goes offline
 *   stale     → red, "Reconnecting…"    → still online, link is struggling
 */
function ActivateButton({ onPress, colors }: ActivateButtonProps) {
  const { t } = useTranslation()
  const { query } = useActivation()
  const { online, connection, goingOnline, setOnline } = useCaptainPresence()

  const activated = query.data?.activated === true
  // Only the in-flight request blocks input. Socket health must NOT: a link stuck
  // in `connecting` would otherwise leave the captain on air with no way to switch
  // off, which is the trap this button exists to avoid. Going offline is always
  // one tap away — the label still reports the health.
  const busy = goingOnline
  const connecting = online && connection === 'connecting'
  const stale = online && connection === 'stale'

  // Fill the disc whenever the button represents a committed state (unpaid day,
  // or on air). Offline is the one resting state, so it stays an outline.
  const tone = !activated ? colors.tint : stale ? colors.destructive : online ? colors.success : colors.tabIconDefault
  const filled = !activated || online

  const label = !activated
    ? t('captain.activate.tabActivate')
    : busy || connecting ? t('captain.online.connecting')
    : stale ? t('captain.online.stale')
    : online ? t('captain.online.online')
    : t('captain.online.toggleLabel')

  function handlePress() {
    if (busy) return
    if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Paid days toggle in place; only an unpaid day needs the sheet.
    if (activated) void setOnline(!online)
    else onPress()
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="switch"
      accessibilityState={{ checked: online, disabled: busy }}
      accessibilityLabel={label}
      style={{ flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 4, gap: 3 }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          borderCurve: 'continuous',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? tone : 'transparent',
          borderWidth: filled ? 0 : 1.5,
          borderColor: colors.border,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={filled ? colors.onTint : tone} />
        ) : (
          <Icon name="power" size={20} color={filled ? colors.onTint : tone} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          ...Typography['caption-sm'],
          fontStyle: 'normal',
          fontSize: 11,
          fontFamily: 'Poppins_600SemiBold',
          color: tone,
        }}
      >
        {label}
      </Text>
      <View style={{ height: 3, width: 0, marginTop: 2 }} />
    </TouchableOpacity>
  )
}

interface TabItemProps {
  icon: IoniconName
  label: string
  active: boolean
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
  isRTL?: boolean
  badge?: number
}

function TabItem({ icon, label, active, onPress, colors, isRTL, badge }: TabItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 4,
        gap: 3,
      }}
    >
      <View style={{ position: 'relative' }}>
        <Icon
          name={active ? icon : `${icon}-outline` as IoniconName}
          size={24}
          color={active ? colors.text : colors.tabIconDefault}
        />
        {badge != null && badge > 0 && (
          <View style={{
            position: 'absolute',
            top: -6,
            ...(isRTL ? { left: -8 } : { right: -8 }),
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.destructive,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
            borderWidth: 1.5,
            borderColor: colors.card,
          }}>
            <Text style={{
              ...Typography.micro,
              color: '#FFFFFF',
              fontSize: 9,
              fontFamily: 'Poppins_600SemiBold',
              fontStyle: 'normal',
            }}>
              {badge > 99 ? '99+' : String(badge)}
            </Text>
          </View>
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{
          ...Typography['caption-sm'],
          fontStyle: 'normal',
          fontSize: 11,
          fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
          color: active ? colors.text : colors.tabIconDefault,
        }}
      >
        {label}
      </Text>
      <View style={{
        height: 3,
        width: active ? 22 : 0,
        borderRadius: 2,
        backgroundColor: colors.tint,
        marginTop: 2,
      }} />
    </TouchableOpacity>
  )
}
