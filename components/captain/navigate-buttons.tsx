// components/captain/navigate-buttons.tsx
import { View, Text, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'
import { openNavigation, type NavApp } from '@/lib/nav-links'
import type { LatLng } from '@/hooks/use-current-location'

const APPS: { app: NavApp; labelKey: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
  { app: 'google', labelKey: 'captain.live.navGoogleMaps', icon: 'logo-google' },
  { app: 'waze', labelKey: 'captain.live.navWaze', icon: 'navigate' },
]

/**
 * Drive to the next stop in Google Maps or in Waze — the captain's pick, one
 * button each. One destination per tap (neither app takes a multi-stop route
 * from a link); the screen moves `destination` on as each stop is done.
 */
export function NavigateButtons({ destination }: { destination: LatLng | null | undefined }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  // native forceRTL mirrors this row in AR/KU — no manual flip
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
      {APPS.map(({ app, labelKey, icon }) => (
        <TouchableOpacity
          key={app}
          onPress={() => {
            if (destination) void openNavigation(destination, app)
          }}
          disabled={!destination}
          accessibilityRole="button"
          activeOpacity={0.8}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: Spacing.sm,
            paddingVertical: Spacing.md + 2,
            paddingHorizontal: Spacing.md,
            borderRadius: 14,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: destination ? 1 : 0.5,
          }}
        >
          <Icon name={icon} size={18} color={colors.tint} />
          <Text style={{ ...Typography['body-md'], fontSize: 15, color: colors.tint, fontStyle: 'normal' }} numberOfLines={1}>
            {t(labelKey)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}
