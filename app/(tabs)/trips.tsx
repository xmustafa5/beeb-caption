import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeColors } from '@/hooks/use-theme-colors'
import { Typography } from '@/constants/Typography'
import { Spacing } from '@/constants/Spacing'

// Placeholder. Captain's trips/earnings surface is designed in the feature cycle.
export default function TripsScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: Spacing.xl }}>
      <Text style={{ ...Typography.body, color: colors.subtle }}>{t('captain.scaffoldTrips')}</Text>
    </View>
  )
}
