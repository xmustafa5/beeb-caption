import { ScrollView, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'
import { Icon } from '@/components/ui/icon'

export default function NotificationsScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: Spacing.xl, gap: Spacing.lg }}
    >
      <Text style={{ ...Typography['heading-lg'], color: colors.text }}>
        {t('tabs.notifications')}
      </Text>

      <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl * 2 }}>
        <Icon name="notifications-outline" size={48} color={colors.subtle} />
        <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>
          {t('notifications.empty')}
        </Text>
      </View>
    </ScrollView>
  )
}
