import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

// Placeholder home for the Captain App. Real captain surfaces (Activate Today,
// Online toggle, Trip Queue) are designed in the captain feature cycle.
export default function HomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: Spacing.xl, gap: Spacing.md }}>
      <Text style={{ ...Typography['heading-lg'], color: colors.text }}>{t('captain.appName')}</Text>
      <Text style={{ ...Typography.body, color: colors.subtle, textAlign: 'center' }}>{t('captain.scaffoldHome')}</Text>
    </View>
  )
}
