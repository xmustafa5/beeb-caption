import { View, Text, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { useAuthStore } from '@/store/auth-store'

// Minimal captain profile: shows session + logout. Full captain profile
// (vehicle, docs, status) is designed in the feature cycle.
export default function ProfileScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const user = useAuthStore((s) => s.user)

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: Spacing.xl, gap: Spacing.lg, justifyContent: 'center' }}>
      <Text style={{ ...Typography['heading-md'], color: colors.text, textAlign: 'center' }}>
        {user?.name || t('captain.scaffoldProfile')}
      </Text>
      {user?.phone ? (
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center', fontVariant: ['tabular-nums'] }} selectable>
          {user.phone}
        </Text>
      ) : null}
      <TouchableOpacity
        onPress={() => useAuthStore.getState().clear()}
        activeOpacity={0.85}
        style={{ alignSelf: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.destructive + '15' }}
      >
        <Text style={{ ...Typography['body-md'], color: colors.destructive, fontFamily: 'Poppins_600SemiBold' }}>
          {t('profile.logout')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}
